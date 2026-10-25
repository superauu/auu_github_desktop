import { executeGit } from './GitExecutor';

/**
 * 每提交仓库快照文件树（F1）。
 * - listSnapshot: `git ls-tree -r -z -l <commit>` 一次拉全量平铺条目，客户端 O(n) 构建嵌套树；
 *   超大仓库（>2 万条目）不做分页，渲染层用 VirtualRows 虚拟化。
 * - readBlob: `git cat-file` 文本通道读取 blob；objectHash 先过严格十六进制校验再进参数，
 *   二进制/超过 2MB 的对象返回占位标记而不是内容，由 UI 渲染说明文案。
 * 提交哈希解析沿用 GitService.resolveCommitHash 的 `rev-parse --verify --end-of-options
 * <x>^{commit}` 写法（本文件独立实现，不反向依赖 GitService）。
 */

/** ls-tree 平铺条目（路径相对仓库根，'/' 分隔，与 git 输出原样一致）。 */
export interface SnapshotEntry {
  mode: string;
  type: 'blob' | 'tree' | 'commit';
  objectHash: string;
  /** 字节数；目录/子模块等没有 size 的条目为 null。 */
  sizeBytes: number | null;
  path: string;
}

/** 嵌套快照树节点。目录 children 内目录在前、文件在后，各自按名称排序。 */
export interface SnapshotNode {
  name: string;
  /** 从仓库根开始的完整路径；根级目录的 path 即目录名。 */
  path: string;
  kind: 'dir' | 'file';
  /** file: blob=普通文件，commit=子模块引用；dir 恒为 tree。 */
  type: 'blob' | 'tree' | 'commit';
  objectHash: string | null;
  sizeBytes: number | null;
  /** 仅目录节点非空。 */
  children: SnapshotNode[] | null;
}

export interface CommitSnapshot {
  /** rev-parse 解析出的完整提交哈希（40~64 位，兼容 SHA-256 仓库）。 */
  commit: string;
  entries: SnapshotEntry[];
}

export type BlobContent =
  | { kind: 'text'; content: string; sizeBytes: number }
  | { kind: 'binary'; sizeBytes: number }
  | { kind: 'too-large'; sizeBytes: number };

/** blob 对象哈希：40（SHA-1）~64（SHA-256）位小写十六进制，杜绝把任意参数走私进 cat-file。 */
export const OBJECT_HASH_PATTERN = /^[0-9a-f]{40,64}$/;
/** 文本预览上限：超过即返回 too-large 占位，不把大对象拉进前端。 */
export const MAX_TEXT_BLOB_BYTES = 2 * 1024 * 1024;

/**
 * `git ls-tree -z -l` 的单条记录：`<mode> SP <type> SP <object> SP+ <size>\t<path>`，
 * 记录间 NUL 分隔。size 右对齐补空格（最小宽度 7，`-` 同样补空格），非 blob 为 `-`；
 * path 在 -z 下原样输出（含空格/中文/换行），不经 quotepath 转义。
 * 无法解析的记录跳过（fail soft），不让畸形输出拖垮整棵树。
 */
const LS_TREE_RECORD = /^([0-7]{6}) (blob|tree|commit) ([0-9a-f]{40,64}) +([0-9]+|-)\t([\s\S]+)$/;

export function parseLsTreeZ(raw: string): SnapshotEntry[] {
  const entries: SnapshotEntry[] = [];
  for (const record of raw.split('\0')) {
    if (!record) continue;
    const match = LS_TREE_RECORD.exec(record);
    if (!match) continue;
    entries.push({
      mode: match[1],
      type: match[2] as SnapshotEntry['type'],
      objectHash: match[3],
      sizeBytes: !match[4] || match[4] === '-' ? null : Number(match[4]),
      path: match[5],
    });
  }
  return entries;
}

/**
 * 平铺条目 → 嵌套树。单趟 Map 缓存目录节点，整体 O(n)（n=条目数），
 * 隐式中间目录按需创建；显式 tree 条目（无 -r 的输出形态）合并进对应目录节点。
 */
export function buildSnapshotTree(entries: readonly SnapshotEntry[]): SnapshotNode[] {
  const root: SnapshotNode = { name: '', path: '', kind: 'dir', type: 'tree', objectHash: null, sizeBytes: null, children: [] };
  const directories = new Map<string, SnapshotNode>([['', root]]);
  const ensureDirectory = (directoryPath: string): SnapshotNode => {
    const existing = directories.get(directoryPath);
    if (existing) return existing;
    const separator = directoryPath.lastIndexOf('/');
    const parent = ensureDirectory(separator < 0 ? '' : directoryPath.slice(0, separator));
    const node: SnapshotNode = {
      name: directoryPath.slice(separator + 1),
      path: directoryPath,
      kind: 'dir',
      type: 'tree',
      objectHash: null,
      sizeBytes: null,
      children: [],
    };
    parent.children!.push(node);
    directories.set(directoryPath, node);
    return node;
  };
  for (const entry of entries) {
    const segments = entry.path.split('/').filter(Boolean);
    if (!segments.length) continue;
    const name = segments.pop()!;
    const parent = ensureDirectory(segments.join('/'));
    if (entry.type === 'tree') {
      const directoryPath = `${segments.length ? segments.join('/') + '/' : ''}${name}`;
      const node = ensureDirectory(directoryPath);
      if (!node.objectHash) node.objectHash = entry.objectHash;
      continue;
    }
    parent.children!.push({
      name,
      path: entry.path,
      kind: 'file',
      type: entry.type,
      objectHash: entry.objectHash,
      sizeBytes: entry.sizeBytes,
      children: null,
    });
  }
  const sortChildren = (node: SnapshotNode) => {
    if (!node.children) return;
    node.children.sort((a, b) => a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'dir' ? -1 : 1);
    node.children.forEach(sortChildren);
  };
  sortChildren(root);
  return root.children!;
}

export interface SnapshotRow {
  node: SnapshotNode;
  depth: number;
}

/** 展开/折叠状态（折叠目录 path 集合）→ 当前可见的平铺行，供 VirtualRows 渲染。 */
export function collectVisibleRows(nodes: readonly SnapshotNode[], collapsed: ReadonlySet<string>, depth = 0, rows: SnapshotRow[] = []): SnapshotRow[] {
  for (const node of nodes) {
    rows.push({ node, depth });
    if (node.kind === 'dir' && node.children && !collapsed.has(node.path)) {
      collectVisibleRows(node.children, collapsed, depth + 1, rows);
    }
  }
  return rows;
}

/** 与 git 一致的二进制启发：采样里出现 NUL 或 UTF-8 解码替换符（U+FFFD）即按二进制处理。 */
export function looksBinary(content: string): boolean {
  const sample = content.slice(0, 8192);
  return sample.includes('\0') || sample.includes('\uFFFD');
}

/** 人类可读字节数（B/KB/MB/GB），无有效值返回空串。 */
export function formatBytes(sizeBytes: number | null | undefined): string {
  if (sizeBytes === null || sizeBytes === undefined || !Number.isFinite(sizeBytes) || sizeBytes < 0) return '';
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = sizeBytes;
  let unit = -1;
  do { value /= 1024; unit++; } while (value >= 1024 && unit < units.length - 1);
  return `${value >= 100 ? Math.round(value) : Number(value.toFixed(1))} ${units[unit]}`;
}

export class TreeService {
  /**
   * 校验并解析提交哈希：`--end-of-options` 保证选项形态的输入不会被当成 flag，
   * `^{commit}` 保证结果确实指向一个提交；输出必须是完整对象哈希。
   */
  async resolveCommitHash(repoPath: string, revision: string): Promise<string> {
    const trimmed = revision.trim();
    if (!trimmed || trimmed.startsWith('-')) throw new Error('Invalid revision');
    const res = await executeGit(['rev-parse', '--verify', '--end-of-options', `${trimmed}^{commit}`], repoPath);
    const hash = res.stdout.trim();
    if (!OBJECT_HASH_PATTERN.test(hash)) throw new Error(`Invalid revision: ${trimmed}`);
    return hash;
  }

  /** 某提交时点的全量文件清单（先校验提交，再一次 ls-tree 拉平铺全量）。 */
  async listSnapshot(repoPath: string, commitHash: string): Promise<CommitSnapshot> {
    if (!repoPath) throw new Error('Invalid repository path');
    const commit = await this.resolveCommitHash(repoPath, commitHash);
    const res = await executeGit(['ls-tree', '-r', '-z', '-l', commit], repoPath);
    return { commit, entries: parseLsTreeZ(res.stdout) };
  }

  /** 按对象哈希读 blob：哈希先过 ^[0-9a-f]{40,64}$ 再进参数；二进制/超限返回占位标记。 */
  async readBlob(repoPath: string, objectHash: string): Promise<BlobContent> {
    if (!repoPath) throw new Error('Invalid repository path');
    if (!OBJECT_HASH_PATTERN.test(objectHash)) throw new Error('Invalid object hash');
    const sizeResult = await executeGit(['cat-file', '-s', objectHash], repoPath);
    const sizeBytes = Number(sizeResult.stdout.trim());
    if (!Number.isInteger(sizeBytes) || sizeBytes < 0) throw new Error('Invalid object size');
    if (sizeBytes > MAX_TEXT_BLOB_BYTES) return { kind: 'too-large', sizeBytes };
    const res = await executeGit(['cat-file', 'blob', objectHash], repoPath);
    if (looksBinary(res.stdout)) return { kind: 'binary', sizeBytes };
    return { kind: 'text', content: res.stdout, sizeBytes };
  }
}

export const treeService = new TreeService();
