import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, FileText, FileWarning, Folder, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { VirtualRows } from '@/components/ui/VirtualRows';
import { FilePath } from '@/components/ui/FilePath';
import { useI18n } from '@/i18n';
import { useSettingsStore } from '@/stores/settingsStore';
import { gitService } from '@/services/git/GitService';
import type { GitFileChange } from '@/services/git/types';
import { MAX_TEXT_BLOB_BYTES, buildSnapshotTree, collectVisibleRows, formatBytes, treeService } from '@/services/git/TreeService';
import type { CommitSnapshot, SnapshotNode } from '@/services/git/TreeService';
import { cn } from '@/utils/cn';

type ContentState =
  | { state: 'idle' }
  | { state: 'loading'; path: string }
  | { state: 'text'; path: string; content: string; sizeBytes: number }
  | { state: 'binary'; path: string; sizeBytes: number }
  | { state: 'too-large'; path: string; sizeBytes: number }
  | { state: 'submodule'; path: string }
  | { state: 'error'; path: string; message: string };

/**
 * 提交详情弹窗内的“仓库快照”模式：左侧虚拟化快照文件树（缩进导轨 + 目录折叠 + 路径筛选），
 * 右侧展示所选文件在该提交时点的内容；属于本次提交变更集的文件提供一键跳转到其差异视图。
 * 组件内状态自足：仓库/提交变化时以请求票据（epoch）丢弃旧响应，快照懒加载只在挂载时拉取。
 */
export function CommitSnapshotTree({ repoPath, commitHash, onViewDiff, canViewDiff }: {
  repoPath: string;
  commitHash: string;
  onViewDiff: (path: string) => void;
  /** 可选：限制“跳到差异”按钮的可用范围（如图像弹窗只允许图像文件跳转）。 */
  canViewDiff?: (path: string) => boolean;
}) {
  const { t } = useI18n();
  const fontSize = useSettingsStore(state => state.diffFontSize);
  const wrapLines = useSettingsStore(state => state.diffWrapLines);
  const requestRef = useRef(0);
  const contentRequestRef = useRef(0);
  const [snapshot, setSnapshot] = useState<CommitSnapshot | null>(null);
  const [changed, setChanged] = useState<ReadonlySet<string> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<SnapshotNode | null>(null);
  const [content, setContent] = useState<ContentState>({ state: 'idle' });

  // 快照懒加载：仓库/提交变化（含错误重试）即重置全部状态，旧请求通过票据作废。
  useEffect(() => {
    const id = ++requestRef.current;
    setSnapshot(null); setChanged(null); setError(null); setLoading(true);
    setCollapsed(new Set()); setQuery(''); setSelected(null);
    setContent({ state: 'idle' });
    if (!repoPath || !commitHash) { setLoading(false); return; }
    const changedPaths: Promise<ReadonlySet<string> | null> = gitService.getCommitFiles(repoPath, commitHash)
      .then((files: GitFileChange[]) => new Set(files.map(file => file.path)))
      .catch(() => null);
    treeService.listSnapshot(repoPath, commitHash).then(async result => {
      const changedSet = await changedPaths;
      if (id !== requestRef.current) return;
      setSnapshot(result); setChanged(changedSet); setLoading(false);
    }).catch((loadError: unknown) => {
      if (id !== requestRef.current) return;
      setError(loadError instanceof Error ? loadError.message : String(loadError));
      setLoading(false);
    });
    return () => { requestRef.current++; };
  }, [repoPath, commitHash, reloadTick]);

  const filteredEntries = useMemo(() => {
    const entries = snapshot?.entries ?? [];
    const needle = query.trim().toLowerCase();
    if (!needle) return entries;
    return entries.filter(entry => entry.path.toLowerCase().includes(needle));
  }, [snapshot, query]);
  const nodes = useMemo(() => buildSnapshotTree(filteredEntries), [filteredEntries]);
  const rows = useMemo(() => collectVisibleRows(nodes, collapsed), [nodes, collapsed]);
  const contentLines = useMemo(() => {
    if (content.state !== 'text') return [];
    const lines = content.content.split('\n');
    if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
    return lines;
  }, [content]);

  const toggleDirectory = (path: string) => setCollapsed(previous => {
    const next = new Set(previous);
    if (next.has(path)) next.delete(path); else next.add(path);
    return next;
  });

  const openFile = (node: SnapshotNode) => {
    setSelected(node);
    const id = ++contentRequestRef.current;
    if (node.type === 'commit') { setContent({ state: 'submodule', path: node.path }); return; }
    setContent({ state: 'loading', path: node.path });
    treeService.readBlob(repoPath, node.objectHash || '').then(result => {
      if (id !== contentRequestRef.current) return;
      if (result.kind === 'text') setContent({ state: 'text', path: node.path, content: result.content, sizeBytes: result.sizeBytes });
      else if (result.kind === 'binary') setContent({ state: 'binary', path: node.path, sizeBytes: result.sizeBytes });
      else setContent({ state: 'too-large', path: node.path, sizeBytes: result.sizeBytes });
    }).catch((readError: unknown) => {
      if (id !== contentRequestRef.current) return;
      setContent({ state: 'error', path: node.path, message: readError instanceof Error ? readError.message : String(readError) });
    });
  };

  const viewerPath = content.state === 'idle' ? null : content.path;
  const viewerSize = content.state === 'text' || content.state === 'binary' || content.state === 'too-large' ? content.sizeBytes : null;
  const isEmptyText = content.state === 'text' && content.content === '';
  const isChangedFile = !!selected && (changed?.has(selected.path) ?? false);

  return <div className="flex min-h-0 flex-1 w-full text-[13px]">
    <div className="flex w-72 shrink-0 flex-col border-r border-border min-h-0">
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 shrink-0">
        <input aria-label={t('fileTree.filterPlaceholder')} placeholder={t('fileTree.filterPlaceholder')} value={query} maxLength={200}
          onChange={event => setQuery(event.target.value)} className="glass-control h-7 min-w-0 flex-1 px-2 text-[12px]" />
        <span className="shrink-0 text-[11px] font-mono text-muted-foreground">{t('fileTree.entryCount').replace('{count}', String(filteredEntries.length))}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto" role="tree" aria-label={t('fileTree.treeViewLabel')}>
        {loading ? <p role="status" className="p-3 text-[12px] text-muted-foreground">{t('fileTree.snapshotLoading')}</p>
          : error ? <div role="alert" className="space-y-2 p-3 text-[12px]">
            <p className="text-destructive">{t('fileTree.snapshotError').replace('{m}', error)}</p>
            <Button variant="outline" size="xs" onClick={() => setReloadTick(value => value + 1)}>{t('fileTree.retry')}</Button>
          </div>
          : !filteredEntries.length ? <p className="p-3 text-[12px] text-muted-foreground">{query.trim() ? t('fileTree.noMatch') : t('fileTree.snapshotEmpty')}</p>
            : <VirtualRows items={rows} rowHeight={24} renderRow={(row, index) => {
              const { node, depth } = row;
              const isDir = node.kind === 'dir';
              const isCollapsed = isDir && collapsed.has(node.path);
              const isChanged = node.kind === 'file' && (changed?.has(node.path) ?? false);
              return <button type="button" role="treeitem" data-list-row
                onClick={() => isDir ? toggleDirectory(node.path) : openFile(node)}
                aria-expanded={isDir ? !isCollapsed : undefined}
                aria-current={selected?.path === node.path ? 'true' : undefined}
                aria-selected={selected?.path === node.path}
                title={`${node.path}${isChanged ? ` · ${t('fileTree.changedInCommit')}` : ''}`}
                className={cn('flex h-6 w-full items-stretch text-left text-[12px] hover:bg-accent/60 focus-visible:bg-accent focus-visible:outline-hidden',
                  selected?.path === node.path && 'bg-accent text-accent-foreground')}
                style={{ paddingLeft: 8, paddingRight: 8 }}>
                <span aria-hidden className="flex shrink-0">
                  {Array.from({ length: depth }).map((_, level) => <span key={`${index}-${level}`} className="w-3 border-l border-border/50" />)}
                </span>
                <span className="flex min-w-0 flex-1 items-center gap-1">
                  {isDir
                    ? <>{isCollapsed ? <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}{isCollapsed ? <Folder className="h-3.5 w-3.5 shrink-0 text-git-tag" /> : <FolderOpen className="h-3.5 w-3.5 shrink-0 text-git-tag" />}</>
                    : <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                  <span className="truncate">{node.name}</span>
                  {isChanged
                    ? <span aria-label={t('fileTree.changedInCommit')} className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-git-added" />
                    : node.kind === 'file' && node.sizeBytes !== null && <span className="ml-auto shrink-0 font-mono text-[11px] text-muted-foreground/70">{formatBytes(node.sizeBytes)}</span>}
                </span>
              </button>;
            }} />}
      </div>
    </div>
    <div className="flex min-w-0 flex-1 flex-col min-h-0">
      {!selected || !viewerPath ? <div className="flex flex-1 items-center justify-center p-6 text-center text-[12px] text-muted-foreground">{t('fileTree.selectFileHint')}</div>
        : <>
          <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 shrink-0">
            <FilePath path={viewerPath} />
            {viewerSize !== null && <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{formatBytes(viewerSize)}</span>}
            {content.state === 'text' && !isEmptyText && <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{t('fileTree.lineCount').replace('{count}', String(contentLines.length))}</span>}
            {isChangedFile && (!canViewDiff || canViewDiff(viewerPath)) && <Button variant="secondary" size="xs" onClick={() => onViewDiff(viewerPath)}>{t('fileTree.viewDiff')}</Button>}
          </div>
          <div tabIndex={0} role="region" aria-label={t('fileTree.contentViewLabel')} style={{ fontSize }}
            className={cn('flex-1 min-h-0 overflow-auto font-mono leading-6 select-text', wrapLines && 'diff-wrap')}>
            {content.state === 'loading' ? <p role="status" className="p-6 text-[12px] text-muted-foreground">{t('fileTree.contentLoading')}</p>
              : content.state === 'error' ? <p role="alert" className="p-6 text-[12px] text-destructive">{t('fileTree.contentError').replace('{m}', content.message)}</p>
                : content.state === 'submodule' ? <p className="p-6 text-[12px] text-muted-foreground">{t('fileTree.submodule')}</p>
                  : content.state === 'binary' ? <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-muted-foreground">
                    <FileWarning className="h-8 w-8" />
                    <p className="text-[12px]">{t('fileTree.binaryFile')}</p>
                    <p className="font-mono text-[11px]">{formatBytes(content.sizeBytes)}</p>
                  </div>
                    : content.state === 'too-large' ? <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-muted-foreground">
                      <FileWarning className="h-8 w-8" />
                      <p className="text-[12px]">{t('fileTree.tooLargeFile').replace('{size}', formatBytes(content.sizeBytes)).replace('{limit}', formatBytes(MAX_TEXT_BLOB_BYTES))}</p>
                    </div>
                      : isEmptyText ? <p className="p-6 text-[12px] text-muted-foreground">{t('fileTree.emptyFile')}</p>
                        : <VirtualRows items={contentLines} contentWidth={!wrapLines} renderRow={(line, index) => <div className="flex whitespace-pre pr-6">
                          <span className="w-12 shrink-0 select-none text-right pr-3 text-muted-foreground">{index + 1}</span>
                          <span>{line.length ? line : ' '}</span>
                        </div>} />}
          </div>
        </>}
    </div>
  </div>;
}
