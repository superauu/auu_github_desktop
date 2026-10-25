import { ImageDiffView } from '@/features/git/ImageDiffView';
import { isImagePath } from '@/services/git/ImageDiffService';
import { DiffFontControl } from '@/components/ui/DiffFontControl';
import { VirtualRows } from '@/components/ui/VirtualRows';
import { useSettingsStore } from '@/stores/settingsStore';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { DiffTools, highlightDiff } from '@/components/ui/DiffTools';
import { X } from 'lucide-react';
import type { ParsedDiffLine } from '@/services/git/PorcelainParser';
import { computeSplitRows } from '@/utils/diffRows';
import { useI18n } from '@/i18n';
import { useRepoStore } from '@/stores/repoStore';
import { gitService } from '@/services/git/GitService';
import { CommitSnapshotTree } from '@/features/git/CommitSnapshotTree';
import { ModalSurface } from '@/components/ui/ModalSurface';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';

export function CommitDiffDialog({ path, hash, lines, loading, error, onClose, onReload, image }: {
  image?: { repoPath: string; before: string; after: string; beforePath?: string };
  path: string; hash: string; lines: ParsedDiffLine[]; loading: boolean; error: string | null; onClose: () => void; onReload: () => void;
}) {
  const { t } = useI18n();
  const diffFontSize = useSettingsStore(state => state.diffFontSize);
  const wrap = useSettingsStore(state => state.diffWrapLines);
  const [query, setQuery] = useState('');
  const diffId = useId();
  const [split, setSplit] = useState(false);
  const [mode, setMode] = useState<'changes' | 'snapshot'>('changes');
  // 从快照树跳转来的差异：在弹窗内临时替换主差异视图（仓库/提交/预览文件变化时重置）。
  const [jumped, setJumped] = useState<{ path: string; lines: ParsedDiffLine[]; loading: boolean; error: string | null } | null>(null);
  const jumpRequest = useRef(0);
  const storeRepoPath = useRepoStore(state => state.currentRepo?.path);
  const storeCommitHash = useRepoStore(state => state.selectedCommit?.hash);
  const repoPath = storeRepoPath || image?.repoPath || '';
  const commitHash = storeCommitHash || image?.after || hash;
  const snapshotAvailable = !!repoPath && !!commitHash;

  // 仓库/提交/预览文件变化：丢弃跳转差异并回到变更模式；快照模式懒加载，回切时重新挂载拉取。
  useEffect(() => {
    jumpRequest.current++;
    setJumped(null);
    setMode('changes');
  }, [repoPath, commitHash, path]);

  const loadJumpDiff = useCallback((filePath: string) => {
    if (!repoPath || !commitHash) return;
    const id = ++jumpRequest.current;
    setJumped({ path: filePath, lines: [], loading: true, error: null });
    setMode('changes');
    gitService.getCommitFileDiff(repoPath, commitHash, filePath, useSettingsStore.getState().diffIgnoreWhitespace)
      .then(result => { if (id === jumpRequest.current) setJumped({ path: filePath, lines: result, loading: false, error: null }); })
      .catch((jumpError: unknown) => {
        if (id !== jumpRequest.current) return;
        setJumped({ path: filePath, lines: [], loading: false, error: jumpError instanceof Error ? jumpError.message : String(jumpError) });
      });
  }, [repoPath, commitHash]);

  const viewSnapshotDiff = useCallback((filePath: string) => {
    // 图像弹窗只承载图像差异，非图像文件的跳转不可用（按钮在快照树侧同步隐藏）。
    if (image && !isImagePath(filePath)) return;
    if (filePath === path) { jumpRequest.current++; setJumped(null); setMode('changes'); return; }
    if (filePath === jumped?.path) { setMode('changes'); return; }
    loadJumpDiff(filePath);
  }, [image, path, jumped, loadJumpDiff]);

  const activePath = jumped?.path || path;
  const activeLines = jumped ? jumped.lines : lines;
  const activeLoading = jumped ? jumped.loading : loading;
  const activeError = jumped ? jumped.error : error;
  const rows = useMemo(() => split ? computeSplitRows(activeLines) : [], [split, activeLines]);
  const contents = useMemo(() => split ? rows.map(row => row.headerContent || `${row.left?.content || ''}\n${row.right?.content || ''}`) : activeLines.map(line => line.content), [split, rows, activeLines]);
  const handleReload = useCallback(() => { if (jumped) loadJumpDiff(jumped.path); else onReload(); }, [jumped, loadJumpDiff, onReload]);
  const lineClass = (type?: string) => type === 'add' ? 'diff-line-add' : type === 'delete' ? 'diff-line-del' : type === 'header' ? 'diff-line-header' : '';
  const modeToggle = snapshotAvailable && <div className="flex gap-1">
    <Button variant={mode === 'changes' ? 'secondary' : 'ghost'} aria-pressed={mode === 'changes'} onClick={() => setMode('changes')}>{t('fileTree.modeChanges')}</Button>
    <Button variant={mode === 'snapshot' ? 'secondary' : 'ghost'} aria-pressed={mode === 'snapshot'} onClick={() => setMode('snapshot')}>{t('fileTree.modeSnapshot')}</Button>
  </div>;
  const backToOriginal = jumped && <Button variant="ghost" size="xs" onClick={() => { jumpRequest.current++; setJumped(null); }}>{t('fileTree.backToOriginal')}</Button>;
  if (image && isImagePath(path)) return <ModalSurface label={`${t('changes.viewDiff')} · ${activePath}`} onDismiss={onClose} className="fixed inset-0 z-[60] bg-black/45 flex items-center justify-center p-6"><div className="w-full h-[85vh] max-w-6xl flex flex-col rounded-xl border border-border bg-background shadow-2xl overflow-hidden"><header className="flex justify-between items-center gap-2 p-4 border-b border-border"><h2 className="text-sm font-semibold truncate" title={activePath}>{activePath}</h2><div className="flex items-center gap-2 shrink-0">{backToOriginal}{modeToggle}<Button variant="ghost" size="icon" aria-label={t('common.close')} onClick={onClose}><X className="w-4 h-4" /></Button></div></header>{mode === 'snapshot' ? <CommitSnapshotTree repoPath={repoPath} commitHash={commitHash} onViewDiff={viewSnapshotDiff} canViewDiff={isImagePath} /> : jumped ? <ImageDiffView path={jumped.path} repoPath={image.repoPath} before={image.before} after={image.after} /> : <ImageDiffView path={path} {...image} />}</div></ModalSurface>;
  return <ModalSurface label={`${t('changes.viewDiff')} · ${activePath}`} onDismiss={onClose} className="fixed inset-0 z-[60] bg-black/45 flex items-center justify-center p-6">
    <div className="w-full h-[90vh] max-w-[1600px] flex flex-col rounded-xl border border-border bg-background shadow-2xl overflow-hidden">
      <header className="flex items-center gap-3 p-4 border-b border-border shrink-0">
        <div className="flex-1 min-w-0"><h2 className="text-[14px] font-semibold truncate" title={activePath}>{activePath}</h2><p className="font-mono text-[12px] text-muted-foreground">{hash}</p></div>
        {backToOriginal}
        <DiffFontControl />
        {mode === 'changes' && <div className="flex gap-1"><Button variant={split ? 'ghost' : 'secondary'} aria-pressed={!split} onClick={() => setSplit(false)}>{t('diff.unified')}</Button><Button variant={split ? 'secondary' : 'ghost'} aria-pressed={split} onClick={() => setSplit(true)}>{t('diff.split')}</Button></div>}
        {modeToggle}
        <Button variant="ghost" size="icon" aria-label={t('rightPane.closePreview')} onClick={onClose}><X className="h-4 w-4" /></Button>
      </header>
      {mode === 'snapshot' ? <CommitSnapshotTree repoPath={repoPath} commitHash={commitHash} onViewDiff={viewSnapshotDiff} /> : <>
        <DiffTools query={query} onQueryChange={setQuery} contents={contents} targetId={diffId} onReload={handleReload} />
        <div id={diffId} data-text-context style={{ fontSize: diffFontSize }} className={cn('flex-1 min-h-0 overflow-auto font-mono leading-6 select-text', wrap && 'diff-wrap')} role="region" tabIndex={0} aria-label={t('changes.viewDiff')}>
          {activeLoading ? <p role="status" className="p-6 text-muted-foreground">{t('common.loading')}</p> : activeError ? <p role="alert" className="p-6 text-destructive">{activeError}</p> : !activeLines.length ? <p className="p-6 text-muted-foreground">{t('rightPane.noTextDiff')}</p> : split ?
            <div className="min-w-[800px]"><VirtualRows items={rows} renderRow={(row, index) => row.isHeader ? <div key={index} className="diff-line-header px-3 whitespace-pre">{row.headerContent}</div> : <div key={index} className="grid grid-cols-2">
              {[row.left, row.right].map((side, sideIndex) => <div key={sideIndex} className={cn('flex min-w-0 border-r border-border', lineClass(side?.type))}><span className="w-12 shrink-0 text-right pr-3 text-muted-foreground select-none">{side?.lineNo}</span><span data-diff-content className="whitespace-pre overflow-x-auto px-2">{highlightDiff(side?.content || '', query)}</span></div>)}
            </div>} /></div> :
            <VirtualRows items={activeLines} contentWidth={!wrap} renderRow={(line, index) => <div key={index} className={cn('flex whitespace-pre pr-6', lineClass(line.type))}><span className="w-12 shrink-0 text-right pr-3 text-muted-foreground select-none">{line.oldNo}</span><span className="w-12 shrink-0 text-right pr-3 text-muted-foreground select-none">{line.newNo}</span><span data-diff-content>{highlightDiff(line.content, query)}</span></div>} />}
        </div>
      </>}
    </div>
  </ModalSurface>;
}
