import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowRightLeft, FileDiff, GitCompare, X } from 'lucide-react';
import { ModalSurface } from '@/components/ui/ModalSurface';
import { Button } from '@/components/ui/button';
import { VirtualRows } from '@/components/ui/VirtualRows';
import { DiffHunkHeader } from '@/components/ui/DiffHunkHeader';
import { DiffFontControl } from '@/components/ui/DiffFontControl';
import { DiffTools, highlightDiff } from '@/components/ui/DiffTools';
import { diffHunkStats, formatDiffHunkLabel } from '@/utils/diffHunkLabel';
import { computeSplitRows } from '@/utils/diffRows';
import { useSettingsStore } from '@/stores/settingsStore';
import { useI18n } from '@/i18n';
import { gitService } from '@/services/git/GitService';
import type { GitBranch, GitFileChange } from '@/services/git/types';
import type { ParsedDiffLine } from '@/services/git/PorcelainParser';
import { cn } from '@/utils/cn';

const STATUS_META: Record<string, { label: string; className: string }> = {
  added: { label: 'A', className: 'text-git-added' },
  deleted: { label: 'D', className: 'text-git-deleted' },
  modified: { label: 'M', className: 'text-git-modified' },
  renamed: { label: 'R', className: 'text-git-renamed' },
  untracked: { label: 'U', className: 'text-muted-foreground' },
};

/**
 * 分支比较弹窗：任意两个本地分支间的三点差异（base...head）。
 * 左侧文件清单来自 getBranchDiff，右侧逐文件内容走 getRefFileDiff。
 * 入口在侧边栏分支右键菜单「与当前分支比较」（当前分支默认作基准）。
 */
export function BranchCompareModal({ open, onClose, repoPath, branches, initialBase, initialHead }: {
  open: boolean;
  onClose: () => void;
  repoPath: string;
  branches: GitBranch[];
  initialBase: string;
  initialHead: string;
}) {
  const { t, lang, tf } = useI18n();
  const diffFontSize = useSettingsStore(state => state.diffFontSize);
  const wrap = useSettingsStore(state => state.diffWrapLines);
  const ignoreWhitespace = useSettingsStore(state => state.diffIgnoreWhitespace);
  const localBranches = useMemo(() => branches.filter(branch => !branch.isRemote), [branches]);

  const [base, setBase] = useState(initialBase);
  const [head, setHead] = useState(initialHead);
  const [files, setFiles] = useState<GitFileChange[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [diffLines, setDiffLines] = useState<ParsedDiffLine[]>([]);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [split, setSplit] = useState(false);
  const filesRequest = useRef(0);
  const diffRequest = useRef(0);
  const diffId = useId();
  const [query, setQuery] = useState('');

  // 打开或入口分支变化时重置为初始方向。
  useEffect(() => {
    if (!open) return;
    setBase(initialBase);
    setHead(initialHead);
  }, [open, initialBase, initialHead]);

  // 方向变化：重拉文件清单并清空选中文件。
  useEffect(() => {
    if (!open || !repoPath || !base || !head || base === head) {
      setFiles([]); setFilesError(null); setSelectedPath(null); setDiffLines([]); setDiffError(null);
      return;
    }
    const id = ++filesRequest.current;
    setFilesLoading(true); setFilesError(null); setSelectedPath(null); setDiffLines([]); setDiffError(null);
    gitService.getBranchDiff(repoPath, base, head)
      .then(result => { if (id === filesRequest.current) { setFiles(result.files); setFilesLoading(false); } })
      .catch((error: unknown) => {
        if (id !== filesRequest.current) return;
        setFiles([]); setFilesLoading(false);
        setFilesError(error instanceof Error ? error.message : String(error));
      });
    return () => { filesRequest.current = id + 1; };
  }, [open, repoPath, base, head]);

  // 选中文件：逐文件取 ref 间 diff。
  useEffect(() => {
    if (!open || !repoPath || !selectedPath || base === head) return;
    const id = ++diffRequest.current;
    setDiffLoading(true); setDiffError(null); setDiffLines([]);
    gitService.getRefFileDiff(repoPath, base, head, selectedPath, ignoreWhitespace)
      .then(result => { if (id === diffRequest.current) { setDiffLines(result); setDiffLoading(false); } })
      .catch((error: unknown) => {
        if (id !== diffRequest.current) return;
        setDiffLines([]); setDiffLoading(false);
        setDiffError(error instanceof Error ? error.message : String(error));
      });
    return () => { diffRequest.current = id + 1; };
  }, [open, repoPath, selectedPath, base, head, ignoreWhitespace]);

  const rows = useMemo(() => split ? computeSplitRows(diffLines) : [], [split, diffLines]);
  const stats = useMemo(() => diffHunkStats(diffLines), [diffLines]);
  const contents = useMemo(() => split
    ? rows.map(row => row.isHeader ? formatDiffHunkLabel(row.headerContent || '', lang) : `${row.left?.content || ''}\n${row.right?.content || ''}`)
    : diffLines.map(line => line.type === 'header' ? formatDiffHunkLabel(line.content, lang) : line.content),
  [split, rows, diffLines, lang]);
  const lineClass = (type?: string) => type === 'add' ? 'diff-line-add' : type === 'delete' ? 'diff-line-del' : type === 'header' ? 'diff-line-header' : '';
  const swap = () => { setBase(head); setHead(base); };
  const selectClass = 'h-7 rounded-md border border-border bg-secondary/60 px-2 text-xs font-mono max-w-[200px] truncate';

  // ModalSurface 是常开 Radix Dialog：关闭态必须整组件不挂载（与其他弹窗的条件挂载惯例一致）。
  if (!open) return null;

  return (
    <ModalSurface label={t('branchCompare.title')} onDismiss={onClose} className="fixed inset-0 z-60 bg-black/45 flex items-center justify-center p-6">
      <div className="w-full h-[90vh] max-w-[1600px] flex flex-col rounded-xl border border-border bg-background shadow-2xl overflow-hidden">
        <header className="flex items-center gap-2.5 p-4 border-b border-border shrink-0 flex-wrap">
          <div className="p-1.5 rounded bg-primary/10 text-primary shrink-0"><GitCompare className="h-4 w-4" /></div>
          <h2 className="text-sm font-semibold shrink-0">{t('branchCompare.title')}</h2>
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[11px] text-muted-foreground shrink-0">{t('branchCompare.baseLabel')}</span>
            <select aria-label={t('branchCompare.baseLabel')} className={selectClass} value={base} onChange={(e) => setBase(e.target.value)}>
              {localBranches.map(branch => <option key={branch.name} value={branch.name}>{branch.name}</option>)}
            </select>
            <Button variant="ghost" size="icon-sm" aria-label={t('branchCompare.swap')} title={t('branchCompare.swap')} onClick={swap} disabled={filesLoading}>
              <ArrowRightLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="text-[11px] text-muted-foreground shrink-0">{t('branchCompare.headLabel')}</span>
            <select aria-label={t('branchCompare.headLabel')} className={selectClass} value={head} onChange={(e) => setHead(e.target.value)}>
              {localBranches.map(branch => <option key={branch.name} value={branch.name}>{branch.name}</option>)}
            </select>
          </div>
          {!filesLoading && !filesError && base !== head && (
            <span className="text-[11px] text-muted-foreground font-mono shrink-0">{tf('branchCompare.filesChanged', { n: String(files.length) })}</span>
          )}
          <Button variant="ghost" size="icon" aria-label={t('common.close')} className="ml-auto shrink-0" onClick={onClose}><X className="h-4 w-4" /></Button>
        </header>

        {base === head ? (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground p-8">{t('branchCompare.sameBranch')}</div>
        ) : (
          <div className="flex-1 flex min-h-0">
            {/* 左侧：差异文件清单 */}
            <aside className="w-64 shrink-0 border-r border-border flex flex-col overflow-hidden bg-card/40">
              <div className="flex-1 overflow-y-auto" role="region" aria-label={t('branchCompare.title')}>
                {filesLoading ? <p role="status" aria-label={t('common.loading')} className="p-4 text-xs text-muted-foreground animate-pulse">{t('common.loading')}</p>
                  : filesError ? <p role="alert" className="p-4 text-xs text-destructive break-all">{t('branchCompare.filesFailed')}: {filesError}</p>
                  : files.length === 0 ? <p className="p-4 text-xs text-muted-foreground">{t('branchCompare.noDiff')}</p>
                  : files.map(file => {
                    const meta = STATUS_META[file.status] ?? { label: '?', className: 'text-muted-foreground' };
                    const active = file.path === selectedPath;
                    return (
                      <button
                        key={`${file.oldPath ?? ''}:${file.path}`}
                        type="button"
                        onClick={() => setSelectedPath(file.path)}
                        className={cn('w-full text-left px-3 py-1.5 border-b border-border/40 flex items-center gap-2 text-xs hover:bg-accent', active && 'bg-primary/10')}
                      >
                        <span className={cn('font-mono font-bold shrink-0', meta.className)}>{meta.label}</span>
                        <span className="truncate font-mono" title={file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}>
                          {file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
                        </span>
                      </button>
                    );
                  })}
              </div>
            </aside>

            {/* 右侧：选中文件的 diff 内容 */}
            <section className="flex-1 min-w-0 flex flex-col overflow-hidden">
              {selectedPath ? <>
                <div className="px-3 py-1.5 border-b border-border/60 bg-muted/30 flex items-center gap-2 text-xs shrink-0">
                  <FileDiff className="h-3 w-3 text-primary shrink-0" />
                  <span className="font-mono truncate" title={selectedPath}>{selectedPath}</span>
                  <DiffFontControl />
                  <div className="flex gap-1 ml-auto shrink-0">
                    <Button variant={split ? 'ghost' : 'secondary'} aria-pressed={!split} onClick={() => setSplit(false)}>{t('diff.unified')}</Button>
                    <Button variant={split ? 'secondary' : 'ghost'} aria-pressed={split} onClick={() => setSplit(true)}>{t('diff.split')}</Button>
                  </div>
                </div>
                <DiffTools query={query} onQueryChange={setQuery} contents={contents} targetId={diffId} />
                <div id={diffId} data-text-context style={{ fontSize: diffFontSize }} className={cn('flex-1 min-h-0 overflow-auto font-mono leading-6 select-text', wrap && 'diff-wrap')} role="region" tabIndex={0} aria-label={t('changes.viewDiff')}>
                  {diffLoading ? <p role="status" aria-label={t('common.loading')} className="p-6 text-muted-foreground animate-pulse">{t('common.loading')}</p>
                    : diffError ? <p role="alert" className="p-6 text-destructive break-all">{diffError}</p>
                    : !diffLines.length ? <p className="p-6 text-muted-foreground">{t('rightPane.noTextDiff')}</p>
                    : split ? (
                      <div className="min-w-[800px]"><VirtualRows items={rows} renderRow={(row, index) => row.isHeader
                        ? <div key={index} className="diff-line-header px-3 py-1"><DiffHunkHeader header={row.headerContent || ''} stats={stats.get(row.sourceIndex ?? -1)} query={query} /></div>
                        : <div key={index} className="grid grid-cols-2">
                          {[row.left, row.right].map((side, sideIndex) => (
                            <div key={sideIndex} className={cn('flex min-w-0 border-r border-border', lineClass(side?.type))}>
                              <span className="w-12 shrink-0 text-right pr-3 text-muted-foreground select-none">{side?.lineNo}</span>
                              <span data-diff-content className="whitespace-pre overflow-x-auto px-2">{highlightDiff(side?.content || '', query)}</span>
                            </div>
                          ))}
                        </div>} /></div>
                    ) : (
                      <VirtualRows items={diffLines} contentWidth={!wrap} renderRow={(line, index) => line.type === 'header'
                        ? <div key={index} className="diff-line-header px-3 py-1"><DiffHunkHeader header={line.content} stats={stats.get(index)} query={query} /></div>
                        : <div key={index} className={cn('flex whitespace-pre pr-6', lineClass(line.type))}>
                          <span className="w-12 shrink-0 text-right pr-3 text-muted-foreground select-none">{line.oldNo}</span>
                          <span className="w-12 shrink-0 text-right pr-3 text-muted-foreground select-none">{line.newNo}</span>
                          <span data-diff-content>{highlightDiff(line.content, query)}</span>
                        </div>} />
                    )}
                </div>
              </> : (
                <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground p-8">{files.length > 0 ? t('branchCompare.pickFile') : ''}</div>
              )}
            </section>
          </div>
        )}
      </div>
    </ModalSurface>
  );
}
