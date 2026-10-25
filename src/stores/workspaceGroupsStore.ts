import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * 仓库分组 Workspaces（T6）。
 *
 * 约束：
 * - 本模块只依赖 zustand，不 import 其他 store/service，保证可以在测试里独立打包加载；
 * - 持久化键 auu_git_workspace_groups，persist 带 version/migrate + merge 双层形状校验
 *   （参考 T1 githubStore.parseStoredProfiles 的防御模式：脏数据整体降级为安全空态/逐条过滤）；
 * - 仓库仅以路径（repoPath）参与分组，删除分组只解除归属，绝不删除仓库本身。
 */

export const WORKSPACE_GROUPS_KEY = 'auu_git_workspace_groups';

export interface WorkspaceGroup {
  id: string;
  name: string;
  repoPaths: string[];
}

interface WorkspaceGroupsState {
  groups: WorkspaceGroup[];
  /** 创建分组：组名 trim 后非空且不与现有组同名；成功返回新组 id，失败返回 null */
  createGroup: (name: string) => string | null;
  /** 重命名分组：同样的组名校验；成功 true，失败 false */
  renameGroup: (id: string, name: string) => boolean;
  /** 删除分组：组内仓库自然回落到“未分组”，不影响仓库本身 */
  deleteGroup: (id: string) => void;
  /** 指派仓库到分组；groupId 为 null（或不存在的 id）时移出所有分组 */
  assignRepo: (repoPath: string, groupId: string | null) => void;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** 生成去连字符 UUID（32 位 hex），与 githubStore 的 Profile id 同一约定 */
export function newGroupId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID().replace(/-/g, '');
  }
  let hex = '';
  for (let i = 0; i < 32; i++) hex += Math.floor(Math.random() * 16).toString(16);
  return hex;
}

const dedupStrings = (values: string[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (!seen.has(value)) { seen.add(value); out.push(value); }
  }
  return out;
};

/** 逐条清洗分组数据：丢弃非法条目（缺 id / 空 name），repoPaths 去空去重，重复 id 只保留首个 */
export function sanitizeGroups(value: unknown): WorkspaceGroup[] {
  if (!Array.isArray(value)) return [];
  const seenIds = new Set<string>();
  const groups: WorkspaceGroup[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const { id, name, repoPaths } = item as Record<string, unknown>;
    if (typeof id !== 'string' || !id.trim() || seenIds.has(id)) continue;
    if (typeof name !== 'string' || !name.trim()) continue;
    const paths = Array.isArray(repoPaths)
      ? dedupStrings(repoPaths.filter((p): p is string => typeof p === 'string' && p.trim().length > 0))
      : [];
    seenIds.add(id);
    groups.push({ id, name: name.trim(), repoPaths: paths });
  }
  return groups;
}

const groupsOf = (persisted: unknown): unknown => (isRecord(persisted) ? persisted.groups : undefined);

export const useWorkspaceGroupsStore = create<WorkspaceGroupsState>()(persist((set, get) => ({
  groups: [],
  createGroup: (name) => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    if (get().groups.some((group) => group.name === trimmed)) return null;
    const id = newGroupId();
    set((state) => ({ groups: [...state.groups, { id, name: trimmed, repoPaths: [] }] }));
    return id;
  },
  renameGroup: (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return false;
    const { groups } = get();
    const target = groups.find((group) => group.id === id);
    if (!target) return false;
    if (groups.some((group) => group.id !== id && group.name === trimmed)) return false;
    if (target.name === trimmed) return true;
    set((state) => ({ groups: state.groups.map((group) => (group.id === id ? { ...group, name: trimmed } : group)) }));
    return true;
  },
  deleteGroup: (id) => set((state) => ({ groups: state.groups.filter((group) => group.id !== id) })),
  assignRepo: (repoPath, groupId) => {
    if (!repoPath) return;
    set((state) => {
      const currentOwner = state.groups.find((group) => group.repoPaths.includes(repoPath));
      const target = groupId ? state.groups.find((group) => group.id === groupId) : null;
      // 已在目标组内（或本来就未分组且目标为空）：保持原序，零变更
      if (currentOwner?.id === target?.id) return state;
      // 先从所有组移除该路径（一个仓库至多属于一个组），再按需加入目标组
      const removed = state.groups.map((group) => {
        if (!group.repoPaths.includes(repoPath)) return group;
        return { ...group, repoPaths: group.repoPaths.filter((path) => path !== repoPath) };
      });
      if (!target) return { groups: removed };
      return { groups: removed.map((group) => (group.id === target.id ? { ...group, repoPaths: [...group.repoPaths, repoPath] } : group)) };
    });
  },
}), {
  name: WORKSPACE_GROUPS_KEY,
  version: 1,
  partialize: (state) => ({ groups: state.groups }),
  // 旧版本数据：形状统一清洗（脏数据降级为安全空态）
  migrate: (persisted) => ({ groups: sanitizeGroups(groupsOf(persisted)) }),
  // 同版本下的脏数据（如手工编辑 localStorage）也在合并前清洗
  merge: (persisted, current) => ({ ...current, groups: sanitizeGroups(groupsOf(persisted)) }),
  storage: createJSONStorage(() => localStorage),
}));

// ===== 供 Header 仓库菜单与测试复用的纯函数 =====

/** 仓库菜单的分区：group 为 null 表示“未分组”区 */
export interface RepoSection {
  group: WorkspaceGroup | null;
  repos: string[];
}

/**
 * 把最近仓库按分组分区。仓库在各分区内的顺序保持传入顺序（最近打开序）。
 * 无任何分组时返回单一“未分组”分区（与原扁平列表等价），保证菜单零变化。
 */
export function buildRepoSections(groups: WorkspaceGroup[], repoPaths: string[]): RepoSection[] {
  if (groups.length === 0) return [{ group: null, repos: [...repoPaths] }];
  const buckets = new Map<string, string[]>(groups.map((group) => [group.id, []]));
  const ungrouped: string[] = [];
  for (const path of repoPaths) {
    const owner = groups.find((group) => group.repoPaths.includes(path));
    if (owner) buckets.get(owner.id)!.push(path);
    else ungrouped.push(path);
  }
  const sections: RepoSection[] = groups.map((group) => ({ group, repos: buckets.get(group.id)! }));
  if (ungrouped.length > 0) sections.push({ group: null, repos: ungrouped });
  return sections;
}

export interface BatchRepoTarget { path: string; name: string }
export interface BatchFetchResult {
  ok: BatchRepoTarget[];
  failed: Array<BatchRepoTarget & { message: string }>;
}

/**
 * 逐个执行批量 fetch（顺序执行，避免并发拉起大量 git 进程），聚合成功/失败结果。
 * fetchOne 由调用方注入（生产环境为 gitService.fetch，测试里用假实现）。
 */
export async function runBatchFetch(
  targets: BatchRepoTarget[],
  fetchOne: (repoPath: string) => Promise<void>,
): Promise<BatchFetchResult> {
  const ok: BatchRepoTarget[] = [];
  const failed: Array<BatchRepoTarget & { message: string }> = [];
  for (const target of targets) {
    try {
      await fetchOne(target.path);
      ok.push(target);
    } catch (error) {
      failed.push({ ...target, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return { ok, failed };
}

/** 把批量结果转成 toast 文案：全成功 → success；有失败 → warning（标题含成功/失败计数，描述列出失败仓库名） */
export function batchFetchToast(
  result: BatchFetchResult,
  t: (key: string) => string,
): { type: 'success' | 'warning'; title: string; description?: string } {
  if (result.failed.length === 0) {
    return { type: 'success', title: t('workspaces.batchFetchDone').replace('{n}', String(result.ok.length)) };
  }
  return {
    type: 'warning',
    title: t('workspaces.batchFetchPartial')
      .replace('{n}', String(result.ok.length))
      .replace('{m}', String(result.failed.length)),
    description: result.failed.map((item) => `${item.name}: ${item.message}`).join('\n'),
  };
}
