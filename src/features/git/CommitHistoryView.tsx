import { HistoryEditorDialog } from './HistoryEditorDialog';
import { BisectWizardDialog } from './BisectWizardDialog';
import { DragDropActionModal } from './DragDropActionModal';
import { historyWorkflowService } from '@/services/git/HistoryWorkflowService';
import type { GitBranch } from '@/services/git/types';
import { useShallow } from 'zustand/react/shallow';
import { ResizeHandle } from '@/components/ui/ResizeHandle';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { confirmAction } from '@/stores/confirmStore';
import { Button } from '@/components/ui/button';
import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { useWorkspaceSessionStore } from '@/stores/workspaceSessionStore';
import { gitService } from '@/services/git/GitService';
import {
  Tag as TagIcon,
  Search,
  Check,
  Cloud,
  FileCode2,
  Laptop,
  Copy,
  Cherry,
  Undo2,
  ArrowUpFromLine,
  ArrowDownToLine,
  Split,
  MoreHorizontal,
  ChevronDown,
  ListTree,
} from 'lucide-react';
import { useI18n } from '@/i18n';
import { useRepoStore } from '@/stores/repoStore';
import { GitGraphRenderer } from '@/features/graph/GitGraphRenderer';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/EmptyState';
import { ContextMenu, ContextMenuItem } from '@/components/ui/ContextMenu';
import { toast } from '@/stores/toastStore';
import { cn } from '@/utils/cn';
import { GitCommit } from '@/services/git/types';

// 本地默认视图（与写侧默认值保持一致）：旧 localStorage 记录可能缺字段，
// 这里做内联防御合并，不 import store 的新导出，避免与写侧 version/migrate 逻辑耦合。
const DEFAULT_HISTORY_VIEW = { query: '', scrollTop: 0, metadataWidth: 176, columns: { author: true, date: true, hash: false } };
// 行高与 GitGraphRenderer.ROW_HEIGHT 保持一致；34px 对齐专业 Git 客户端的信息密度
const ROW_H = 34;

export const CommitHistoryView: React.FC = () => {
  const { t } = useI18n();
  const {
    commits,
    selectedCommit,
    setSelectedCommit,
    setActiveTab,
    status,
    branches,
    selectedBranch,
    scrollToCommitHash,
    isLoading,
    commitsLoadedAll,
    loadMoreCommits,
    revertCommit,
    cherryPickCommit,
    softResetCommit,
    hardResetCommit,
  } = useRepoStore(useShallow(state => ({ commits: state.commits, selectedCommit: state.selectedCommit, setSelectedCommit: state.setSelectedCommit, setActiveTab: state.setActiveTab, status: state.status, branches: state.branches, selectedBranch: state.selectedBranch, scrollToCommitHash: state.scrollToCommitHash, isLoading: state.isLoading, commitsLoadedAll: state.commitsLoadedAll, loadMoreCommits: state.loadMoreCommits, revertCommit: state.revertCommit, cherryPickCommit: state.cherryPickCommit, softResetCommit: state.softResetCommit, hardResetCommit: state.hardResetCommit })));

  const repoPath = useRepoStore(state => state.currentRepo?.path) || '';
  const savedViewRaw = useWorkspaceSessionStore(state => state.historyViews[repoPath]);
  // 旧记录缺字段时逐层回退默认值，防止 columns/metadataWidth 为 undefined 导致渲染崩溃
  const savedView = useMemo(
    () => ({ ...DEFAULT_HISTORY_VIEW, ...savedViewRaw, columns: { ...DEFAULT_HISTORY_VIEW.columns, ...savedViewRaw?.columns } }),
    [savedViewRaw]
  );
  const { metadataWidth, columns, query: searchQuery } = savedView;
  const updateView = useCallback((patch: Partial<typeof DEFAULT_HISTORY_VIEW>) => useWorkspaceSessionStore.getState().updateHistoryView(repoPath, patch), [repoPath]);
  const setMetadataWidth = (metadataWidth: number) => updateView({ metadataWidth });
  const setColumns = (update: (previous: typeof columns) => typeof columns) => updateView({ columns: update(columns) });
  const setSearchQuery = (query: string) => updateView({ query, scrollTop: 0 });
  const [graphWidth, setGraphWidth] = useState(64);
  const [editorOpen, setEditorOpen] = useState(false);
  const [bisectOpen, setBisectOpen] = useState(false);
  // 三选下拉：metadata=提交信息（客户端过滤），contents=代码增删（-S 字面），regex=代码正则（-G）。
  // 用下拉而非"内容模式 + 正则勾选"：勾选框只在内容模式下有效，会让模式与身份键出现隐藏组合状态。
  const [searchMode, setSearchMode] = useState<'metadata' | 'contents' | 'regex'>('metadata');
  // 路径过滤只对内容搜索生效：输入即时回显，300ms 防抖进搜索身份键。
  const [pathInput, setPathInput] = useState('');
  const [searchPath, setSearchPath] = useState('');
  const [branchDrop, setBranchDrop] = useState<{ source: GitBranch; target: GitBranch } | null>(null);
  const searchIdentity = `${searchMode}:${searchPath}:${searchQuery}`;
  const focusAfterRender = useRef<string | null>(null);
  const [remoteResults, setRemoteResults] = useState<{ query: string; commits: GitCommit[] } | null>(null);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searchComplete, setSearchComplete] = useState(false);
  const searchRequest = useRef(0);
  const scrollSave = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastScroll = useRef(savedView.scrollTop);
  const previousQuery = useRef(searchQuery);
  const previousPath = useRef('');
  const restoringScroll = useRef(savedView.scrollTop > 0);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ open: boolean; x: number; y: number; commit: GitCommit | null }>({
    open: false,
    x: 0,
    y: 0,
    commit: null,
  });

  const totalChanges =
    (status?.staged.length || 0) +
    (status?.unstaged.length || 0) +
    (status?.untracked.length || 0);

  const hasWip = totalChanges > 0;
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ top: savedView.scrollTop, height: 800 });
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    element.scrollTop = savedView.scrollTop;
    const update = () => setViewport({ top: element.scrollTop, height: element.clientHeight });
    const observer = new ResizeObserver(update); observer.observe(element); update();
    return () => { observer.disconnect(); clearTimeout(scrollSave.current); updateView({ scrollTop: lastScroll.current }); };
  }, []);

  // Auto-scroll to selected commit or target branch commit
  useEffect(() => {
    if (restoringScroll.current && !scrollToCommitHash) { restoringScroll.current = false; return; }
    restoringScroll.current = false;
    const hashToScroll = scrollToCommitHash || selectedCommit?.hash;
    if (!hashToScroll) return;

    const timer = setTimeout(() => {
      const index = filteredCommits.findIndex((commit) => commit.hash === hashToScroll);
      if (index >= 0 && viewportRef.current) {
        const top = (index + (hasWip ? 1 : 0)) * ROW_H;
        if (scrollToCommitHash || top < viewportRef.current.scrollTop || top + ROW_H > viewportRef.current.scrollTop + viewportRef.current.clientHeight) viewportRef.current.scrollTo({ top: Math.max(0, top - viewportRef.current.clientHeight / 2), behavior: 'auto' });
      }
      const el = document.getElementById(`commit-row-${hashToScroll}`);
      if (scrollToCommitHash && el) el.scrollIntoView({ behavior: 'auto', block: 'nearest' });
      if (scrollToCommitHash) useRepoStore.getState().setScrollToCommitHash(null);
    }, 60);

    return () => clearTimeout(timer);
  }, [scrollToCommitHash, selectedCommit?.hash]);

  // 路径过滤 300ms 防抖：输入停顿后才更新身份键触发搜索，避免每个按键都发一次全历史查询。
  useEffect(() => {
    const timer = setTimeout(() => setSearchPath(pathInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [pathInput]);

  useEffect(() => {
    const request = ++searchRequest.current;
    setSearchError(''); setSearchComplete(false);
    if (!searchQuery.trim() || !repoPath) { setSearchBusy(false); setRemoteResults(null); return; }
    setSearchBusy(true);
    const timer = setTimeout(() => {
      void (searchMode === 'metadata' ? gitService.findCommits(repoPath, searchQuery) : historyWorkflowService.searchContents(repoPath, searchQuery, { regex: searchMode === 'regex', path: searchPath })).then(results => {
        if (request !== searchRequest.current) return;
        setRemoteResults({ query: searchIdentity, commits: results }); setSearchComplete(searchMode === 'metadata' || results.length < 100);
      }).catch((error: Error) => { if (request === searchRequest.current) setSearchError(error.message); })
        .finally(() => { if (request === searchRequest.current) setSearchBusy(false); });
    }, 250);
    return () => { clearTimeout(timer); searchRequest.current++; };
  }, [repoPath, searchQuery, searchMode, searchPath]);

  const filteredCommits = useMemo(() => remoteResults?.query === searchIdentity && searchQuery.trim() ? remoteResults.commits : commits.filter((c) => {
    if (!searchQuery.trim()) return true;
    if (searchMode !== 'metadata') return false;
    const q = searchQuery.toLowerCase();
    return (
      c.subject.toLowerCase().includes(q) ||
      c.author.name.toLowerCase().includes(q) ||
      c.shortHash.toLowerCase().includes(q) ||
      c.refs?.some((r) => r.toLowerCase().includes(q))
    );
  }), [commits, searchQuery, remoteResults, searchMode, searchIdentity]);

  const loadNext = async () => {
    if (!searchQuery.trim()) { await loadMoreCommits(); return; }
    if (searchBusy || searchMode !== 'metadata') return;
    const request = searchRequest.current;
    setSearchBusy(true);
    try {
      const next = await gitService.findCommits(repoPath, searchQuery, filteredCommits.length);
      if (request !== searchRequest.current) return;
      const seen = new Set(filteredCommits.map(commit => commit.hash));
      setRemoteResults({ query: searchIdentity, commits: [...filteredCommits, ...next.filter(commit => !seen.has(commit.hash))] });
      setSearchComplete(next.length < 100);
    } catch (error: any) { if (request === searchRequest.current) setSearchError(error.message); }
    finally { if (request === searchRequest.current) setSearchBusy(false); }
  };

  useEffect(() => {
    if (previousQuery.current === searchQuery && previousPath.current === searchPath) return;
    previousQuery.current = searchQuery; previousPath.current = searchPath; lastScroll.current = 0;
    if (viewportRef.current) viewportRef.current.scrollTop = 0;
    setViewport(previous => ({ ...previous, top: 0 }));
  }, [searchQuery, searchPath]);
  const firstVisible = Math.min(filteredCommits.length, Math.max(0, Math.floor(viewport.top / ROW_H) - (hasWip ? 1 : 0) - 8));
  const lastVisible = Math.min(filteredCommits.length, Math.ceil((viewport.top + viewport.height) / ROW_H) + 8);
  // 搜索态下不把高亮回退到 filteredCommits[0]：否则列表高亮与右侧详情（仍指向原选中提交）不一致；
  // 未命中时保持 detail 不变，列表显示空态。
  const activeCommit = filteredCommits.find(commit => commit.hash === selectedCommit?.hash)
    || (searchQuery.trim() ? undefined : filteredCommits[0]);
  const selectedIndex = hasWip
    ? filteredCommits.findIndex((c) => c.hash === activeCommit?.hash) + 1
    : filteredCommits.findIndex((c) => c.hash === activeCommit?.hash);

  useEffect(() => {
    if (!focusAfterRender.current) return;
    const element = document.getElementById(`commit-row-${focusAfterRender.current}`);
    if (element) { element.focus({ preventScroll: true }); focusAfterRender.current = null; }
  }, [selectedCommit?.hash, firstVisible, lastVisible]);
  const handleHistoryKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (!target.hasAttribute('data-commit-row') || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const index = filteredCommits.findIndex(commit => commit.hash === target.dataset.commitRow);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? filteredCommits.length - 1 : Math.max(0, Math.min(filteredCommits.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
    const commit = filteredCommits[next];
    if (!commit) return;
    event.preventDefault(); focusAfterRender.current = commit.hash; setSelectedCommit(commit);
    const rowTop = (next + (hasWip ? 1 : 0)) * ROW_H;
    const element = viewportRef.current;
    if (element && (rowTop < element.scrollTop || rowTop + ROW_H > element.scrollTop + element.clientHeight)) element.scrollTop = Math.max(0, rowTop - element.clientHeight / 2);
    document.getElementById(`commit-row-${commit.hash}`)?.focus({ preventScroll: true });
  };

  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopyHash = (hash: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    toast.success(t('history.copyHash'), hash);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopiedHash(null), 2000);
  };

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  // 右键菜单动作：统一 toast 反馈，冲突场景由顶部 ConflictBanner 接管
  const runCommitAction = async (action: () => Promise<void>, success: string, failed: string) => {
    try {
      await action();
      toast.success(success);
    } catch (err: any) {
      toast.error(failed, err?.message);
    }
  };

  const ctxMenuItems: ContextMenuItem[] = ctxMenu.commit
    ? [
        {
          id: 'copy-hash',
          label: t('history.ctx.copyHash'),
          icon: <Copy className="h-3.5 w-3.5" />,
          onClick: () => {
            navigator.clipboard.writeText(ctxMenu.commit!.hash);
            toast.success(t('history.copyHash'), ctxMenu.commit!.shortHash);
          },
        },
        { id: 'sep-1', separator: true },
        {
          id: 'cherry-pick',
          label: t('history.ctx.cherryPick'),
          icon: <Cherry className="h-3.5 w-3.5" />,
          onClick: () =>
            runCommitAction(
              () => cherryPickCommit(ctxMenu.commit!.hash),
              t('history.cherryPicked').replace('{h}', ctxMenu.commit!.shortHash),
              t('history.cherryPickFailed')
            ),
        },
        {
          id: 'revert',
          label: t('history.ctx.revert'),
          icon: <Undo2 className="h-3.5 w-3.5" />,
          onClick: () =>
            runCommitAction(
              () => revertCommit(ctxMenu.commit!.hash),
              t('history.reverted').replace('{h}', ctxMenu.commit!.shortHash),
              t('history.revertFailed')
            ),
        },
        { id: 'sep-2', separator: true },
        {
          id: 'reset-soft',
          label: t('history.ctx.resetSoft'),
          icon: <ArrowUpFromLine className="h-3.5 w-3.5" />,
          onClick: async () => {
            if (!await confirmAction({ title: t('history.ctx.resetSoft'), description: t('history.resetSoftConfirm').replace('{h}', ctxMenu.commit!.shortHash), detail: ctxMenu.commit!.subject })) return;
            runCommitAction(
              () => softResetCommit(ctxMenu.commit!.hash),
              t('history.resetDone').replace('{h}', ctxMenu.commit!.shortHash),
              t('history.resetFailed')
            );
          },
        },
        {
          id: 'reset-hard',
          label: t('history.ctx.resetHard'),
          icon: <ArrowDownToLine className="h-3.5 w-3.5" />,
          danger: true,
          onClick: async () => {
            if (!await confirmAction({ title: t('history.ctx.resetHard'), description: t('history.resetHardConfirm').replace('{h}', ctxMenu.commit!.shortHash) + '\n' + t('composer.hardResetWarning'), detail: ctxMenu.commit!.subject })) return;
            runCommitAction(
              () => hardResetCommit(ctxMenu.commit!.hash),
              t('history.resetDone').replace('{h}', ctxMenu.commit!.shortHash),
              t('history.resetFailed')
            );
          },
        },
      ]
    : [];

  return (
    <div className="history-view flex-1 h-full flex flex-col overflow-hidden select-none bg-transparent">
      {/* Top Search & Filter Bar（瘦身为 h-8：标题语义由侧栏导航与列表 aria-label 承担，这里只留数据与工具） */}
      <div className="h-8 px-3 border-b border-border flex flex-wrap gap-2 items-center justify-between text-xs bg-card/40 shrink-0">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="h-4.5 text-[11px] font-mono">
            {filteredCommits.length} {t('history.commitCount')}
          </Badge>
          {hasWip && (
            <Badge variant="warning" className="h-4.5 px-1.5 text-[11px] font-mono gap-1 ">
              <span>{totalChanges} {t('history.uncommitted')}</span>
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1">
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild><Button variant="outline" size="xs" disabled={!repoPath}><MoreHorizontal aria-hidden="true" className="size-3.5" />{t('history.moreTools')}<ChevronDown aria-hidden="true" className="size-3" /></Button></DropdownMenu.Trigger>
            <DropdownMenu.Portal><DropdownMenu.Content align="end" sideOffset={6} className="z-50 w-80 max-w-[calc(100vw-1rem)] bg-popover text-popover-foreground border border-border rounded-lg shadow-xl p-1">
              <DropdownMenu.Group>
                <DropdownMenu.Item className="menu-item" onSelect={() => setBisectOpen(true)}>
                  <span className="flex w-full min-w-0 items-start gap-2">
                    <Split aria-hidden="true" className="size-4 mt-0.5 shrink-0 text-muted-foreground" />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
                      <span className="font-medium leading-5">{t('bisect.open')}</span>
                      <span className="text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">{t('bisect.subtitle')}</span>
                    </span>
                  </span>
                </DropdownMenu.Item>
                <DropdownMenu.Item className="menu-item" onSelect={() => setEditorOpen(true)}>
                  <span className="flex w-full min-w-0 items-start gap-2">
                    <ListTree aria-hidden="true" className="size-4 mt-0.5 shrink-0 text-muted-foreground" />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
                      <span className="font-medium leading-5">{t('flow.historyEditor')}</span>
                      <span className="text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">{t('history.organizeHint')}</span>
                    </span>
                  </span>
                </DropdownMenu.Item>
              </DropdownMenu.Group>
            </DropdownMenu.Content></DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
        {/* Search commit box */}
        <div className="flex items-center gap-2">
          <select aria-label={t('flow.searchMode')} value={searchMode} onChange={e => { setRemoteResults(null); setSearchMode(e.target.value as 'metadata' | 'contents' | 'regex'); }} className="max-w-28 rounded border border-input bg-background p-1 text-xs"><option value="metadata">{t('flow.searchMetadata')}</option><option value="contents">{t('flow.searchContents')}</option><option value="regex">{t('flow.searchRegex')}</option></select><div className="relative w-52">
            <Search className="h-3 w-3 text-muted-foreground absolute left-2 top-2" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label={t('history.searchPlaceholder')} placeholder={t('history.searchPlaceholder')}
              className="h-7 pl-7 text-[12px] bg-secondary/30"
            />
          </div>
          {/* 路径过滤仅在内容搜索（字面/正则）下生效，提交信息模式下不渲染以免误导 */}
          {searchMode !== 'metadata' && <Input
            value={pathInput}
            onChange={(e) => setPathInput(e.target.value)}
            aria-label={t('flow.searchPath')} title={t('flow.searchPath')} placeholder={t('flow.searchPathPlaceholder')}
            className="w-36 h-7 text-[12px] bg-secondary/30"
          />}
        <DropdownMenu.Root><DropdownMenu.Trigger asChild><Button variant="ghost" size="xs">{t('composer.columns')}</Button></DropdownMenu.Trigger>
          <DropdownMenu.Portal><DropdownMenu.Content align="end" className="z-50 min-w-40 bg-popover border border-border rounded-lg shadow-xl p-1">
            {(['author', 'date', 'hash'] as const).map(key => <DropdownMenu.CheckboxItem key={key} className="menu-item" checked={columns[key]} onCheckedChange={checked => setColumns(previous => ({ ...previous, [key]: checked === true }))}><span className="w-4">{columns[key] ? '✓' : ''}</span>{t(`composer.column.${key}`)}</DropdownMenu.CheckboxItem>)}
          </DropdownMenu.Content></DropdownMenu.Portal>
        </DropdownMenu.Root>
        </div>
      </div>


      {/* GitKraken-style Column Headers: BRANCH / TAG | GRAPH | COMMIT MESSAGE（中文不受 uppercase 影响，用 11px+字距表达层级） */}
      <div className="h-7 px-3 border-b border-border/80 bg-muted/20 flex items-center text-[11px] font-medium text-muted-foreground tracking-[0.08em] shrink-0">
        <div style={{ width: graphWidth }} className="text-center shrink-0">{t('history.col.graph')}</div>
        <div className="flex-1 min-w-0 pl-3">{t('history.col.message')}</div>
        {Object.values(columns).some(Boolean) && <div style={{ width: metadataWidth }} className="history-meta text-right pr-2 shrink-0 items-center"><ResizeHandle currentSize={metadataWidth} onSizeChange={setMetadataWidth} minSize={120} maxSize={320} defaultSize={176} reverse title={t('composer.resizeMetadata')} className="h-7 mr-2" /><span className="flex-1">{t('history.col.authorDate')}</span></div>}
      </div>

      {/* Commit List Table with SVG Graph */}
      {searchBusy && <p role="status" className="px-3 py-1 text-[12px] text-muted-foreground">{t('history.searchingAll')}</p>}
      {searchError && <p role="alert" className="px-3 py-1 text-[12px] text-destructive">{searchError}</p>}
      <div ref={viewportRef} role="list" aria-label={t('history.title')} onKeyDown={handleHistoryKey} className="flex-1 min-h-0 overflow-auto" onScroll={(event) => {
        const top = event.currentTarget.scrollTop;
        setViewport({ top, height: event.currentTarget.clientHeight }); lastScroll.current = top;
        clearTimeout(scrollSave.current); scrollSave.current = setTimeout(() => updateView({ scrollTop: top }), 150);
      }}>
        {isLoading && commits.length === 0 ? (
          <div className="py-6 px-3 space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-[28px] rounded-md skeleton"
                style={{ opacity: 1 - i * 0.1 }}
              />
            ))}
          </div>
        ) : filteredCommits.length === 0 && !hasWip ? (
          <EmptyState variant="search" title={t('history.noMatch')} />
        ) : (
          <div className="flex relative">
            {/* SVG Graph Column (Spanning entire rows, perfectly aligned to w-16 column at left: 12px(px-3) + 192px(w-48) = 204px) */}
            <div className="pt-0 shrink-0 z-10 absolute left-[14px] top-0 pointer-events-none" style={{ width: graphWidth }}>
              <GitGraphRenderer
                commits={filteredCommits}
                onWidthChange={setGraphWidth}
                selectedIndex={selectedIndex}
                rowHeight={ROW_H}
                hasWipNode={hasWip}
                visibleStart={firstVisible}
                visibleEnd={lastVisible}
              />
            </div>

            {/* Rows list */}
            <div className="flex-1 min-w-0">
              {/* GitKraken-style Row 0: // WIP (Work in Progress) */}
              {hasWip && (
                <div
                  role="listitem" tabIndex={0}
                  onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setActiveTab('changes'); } }}
                  onClick={() => {
                    setActiveTab('changes');
                    toast.info(t('history.wipToast'));
                  }}
                  className="h-[34px] px-3 flex items-center justify-between gap-3 text-xs cursor-pointer transition-colors bg-primary/10 hover:bg-primary/15 group"
                  title={t('history.wipTitle')}
                >
                  {/* Spacer for Graph column */}
                  <div style={{ width: graphWidth }} className="shrink-0" />

                  {/* Commit message / WIP subject */}
                  <div className="flex items-center gap-2 min-w-0 flex-1 pl-3">
                    <span className="font-mono text-xs font-bold text-sky-600 dark:text-sky-400 flex items-center gap-1.5">
                      <FileCode2 className="h-3.5 w-3.5" />
                      <span>// WIP</span>
                    </span>
                    <Badge variant="success" className="h-4 px-1.5 text-[12px] font-mono font-bold">
                      +{totalChanges}
                    </Badge>
                    <span className="text-[12px] text-muted-foreground truncate hidden sm:inline">
                      {t('history.wipLabel')}
                    </span>
                  </div>

                  {/* Right Column: Prompt */}
                  <div className="history-meta w-44 text-right pr-2 text-[12px] text-primary shrink-0">
                    {t('history.viewChanges')}
                  </div>
                </div>
              )}

              {/* Commit Details Rows */}
              <div aria-hidden style={{ height: firstVisible * ROW_H }} />
              {filteredCommits.slice(firstVisible, lastVisible).map((commit) => {
                const isSelected = activeCommit?.hash === commit.hash;
                const isCopied = copiedHash === commit.hash;

                return (
                  <div
                    key={commit.hash}
                    id={`commit-row-${commit.hash}`}
                    role="listitem" data-commit-row={commit.hash}
                    draggable
                    onDragStart={e => { e.dataTransfer.setData('application/x-auugit-commit', commit.hash); e.dataTransfer.effectAllowed = 'copy'; }} tabIndex={isSelected ? 0 : -1} aria-current={isSelected ? 'true' : undefined}
                    aria-label={`${commit.subject} · ${commit.author.name} · ${commit.shortHash}`}
                    title={commit.subject}
                    onFocus={event => { if (event.target === event.currentTarget) setSelectedCommit(commit); }}
                    onKeyDown={event => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key === 'Enter') { event.preventDefault(); setSelectedCommit(commit); }
                      if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
                        event.preventDefault(); const box = event.currentTarget.getBoundingClientRect(); setCtxMenu({ open: true, x: box.left + 60, y: box.bottom, commit });
                      }
                    }}
                    onClick={() => setSelectedCommit(commit)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setSelectedCommit(commit);
                      setCtxMenu({ open: true, x: e.clientX, y: e.clientY, commit });
                    }}
                    className={cn(
                      "h-[34px] px-3 flex items-center justify-between gap-3 text-xs cursor-pointer transition-colors group",
                      isSelected
                        ? "bg-primary/15 text-foreground font-medium"
                        : "hover:bg-accent/50 dark:hover:bg-white/3 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {/* Spacer for Graph column */}
                    <div style={{ width: graphWidth }} className="shrink-0" />

                    {/* Subject */}
                    <div className="flex items-center gap-2 min-w-0 flex-1 pl-3">
                    {/* Left Column: BRANCH / TAG Badges（当前分支/HEAD 不参与压缩，远程徽标先截断） */}
                    <div className="flex items-center gap-1 min-w-0 max-w-[280px] shrink overflow-hidden">
                      {(() => {
                        const rawRefs = commit.refs ? [...commit.refs] : [];
                        if (
                          selectedBranch &&
                          !rawRefs.some((r) => r.includes(selectedBranch))
                        ) {
                          const branchObj = branches.find((b) => b.name === selectedBranch);
                          if (branchObj?.lastCommit?.hash === commit.hash) {
                            rawRefs.unshift(selectedBranch);
                          }
                        }

                        if (rawRefs.length === 0) return null;

                        return (
                          <>
                            {rawRefs.slice(0, 2).map((ref) => {
                              const isHead = ref.includes('HEAD');
                              const isTag = ref.startsWith('tag:');
                              const isRemote = ref.includes('origin/') || ref.startsWith('remotes/');
                              const cleanName = ref.replace('tag: ', '').replace('HEAD -> ', '').replace(/^remotes\//, '');
                              const isSelectedBranch = selectedBranch && (cleanName === selectedBranch || cleanName.endsWith('/' + selectedBranch));

                              return (
                                <Badge
                                  key={ref}
                                  draggable={!isTag && branches.some(branch => branch.name === cleanName)}
                                  onDragStart={e => { e.stopPropagation(); const branch = branches.find(branch => branch.name === cleanName); if (branch) { e.dataTransfer.setData('application/x-auugit-branch', JSON.stringify({ name: branch.name, isRemote: branch.isRemote })); e.dataTransfer.setData('text/plain', branch.name); } }}
                                  onDragOver={e => { if (!isTag && !isRemote) { e.preventDefault(); e.dataTransfer.dropEffect = e.dataTransfer.types.includes('application/x-auugit-commit') ? 'copy' : 'move'; } }}
                                  onDrop={e => { e.preventDefault(); e.stopPropagation(); const target = branches.find(branch => branch.name === cleanName && !branch.isRemote); if (!target) return; const name = e.dataTransfer.getData('text/plain'); const source = branches.find(branch => branch.name === name); if (source && source.name !== target.name) { setBranchDrop({ source, target }); return; } const hash = e.dataTransfer.getData('application/x-auugit-commit'); if (target.isCurrent && /^[0-9a-f]{40,64}$/.test(hash)) { void (async () => { if (await confirmAction({ title: t('history.ctx.cherryPick'), description: `${hash.slice(0, 8)} → ${target.name}`, danger: false })) await runCommitAction(() => cherryPickCommit(hash), t('history.cherryPicked').replace('{h}', hash.slice(0, 8)), t('history.cherryPickFailed')); })(); } }}
                                  title={`${ref} · ${t('flow.graphDragHint')}`}
                                  className={cn(
                                    "h-5 px-1.5 text-[11px] gap-1 font-mono min-w-0 truncate rounded shadow-2xs border transition-colors",
                                    (isHead || isSelectedBranch) ? "flex-none max-w-[150px]" : "shrink max-w-[110px]",
                                    isTag && "bg-amber-500/15 text-git-tag border-amber-500/40",
                                    isHead && "bg-primary/10 text-primary border-primary/30",
                                    isRemote && "bg-secondary text-secondary-foreground border-border",
                                    !isTag && !isHead && !isRemote && (isSelectedBranch
                                      ? "bg-accent text-accent-foreground border-primary/40 font-semibold"
                                      : "bg-secondary text-secondary-foreground border-border"
                                    )
                                  )}
                                >
                                  {isTag ? (
                                    <>
                                      <TagIcon className="h-2.5 w-2.5 text-git-tag shrink-0" />
                                      <span className="truncate">{cleanName}</span>
                                    </>
                                  ) : isRemote ? (
                                    <>
                                      <Cloud className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
                                      <span className="truncate">{cleanName}</span>
                                    </>
                                  ) : (
                                    <>
                                      <span className="truncate">{cleanName}</span>
                                      <Laptop className="h-2.5 w-2.5 text-muted-foreground shrink-0 opacity-80" />
                                    </>
                                  )}
                                </Badge>
                              );
                            })}
                            {rawRefs.length > 2 && (
                              <Badge variant="outline" className="h-5 px-1 text-[11px] font-mono shrink-0">
                                +{rawRefs.length - 2}
                              </Badge>
                            )}
                          </>
                        );
                      })()}
                    </div>


                      <span className="text-[13px] text-foreground transition-colors truncate">
                        {commit.subject}
                      </span>
                    </div>

                    {/* Author & Date & Hash */}
                    {Object.values(columns).some(Boolean) && <div style={{ width: metadataWidth }} className="history-meta items-center justify-end gap-2 text-[12px] text-muted-foreground shrink-0 pr-2">
                      {columns.author && <span className="truncate max-w-[80px]" title={commit.author.name}>{commit.author.name}</span>}
                      {columns.date && <span className="whitespace-nowrap">{commit.author.relativeDate}</span>}
                      {columns.hash && <button
                        onClick={(e) => handleCopyHash(commit.hash, e)}
                        className="font-mono text-[12px] px-1 py-0.5 rounded bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        title={t('history.copyHashTitle')}
                      >
                        {isCopied ? <Check className="h-2.5 w-2.5 text-git-added" /> : commit.shortHash}
                      </button>}
                    </div>}
                  </div>
                );
              })}

              <div aria-hidden style={{ height: (filteredCommits.length - lastVisible) * ROW_H }} />
              {/* Progressive history loading footer */}
              {filteredCommits.length > 0 && (
                <div className="py-3 flex justify-center">
                  {!(searchQuery.trim() ? searchComplete : commitsLoadedAll) ? (
                    <button
                      disabled={searchBusy} onClick={() => loadNext().catch((error: Error) => toast.error(error.message))}
                      className="px-3 py-1 rounded-md text-[12px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 border border-border/60 transition-colors"
                    >
                      {t('history.loadMore')}
                    </button>
                  ) : (
                    <span className="text-[12px] text-muted-foreground/60">
                      {t('history.allLoaded')}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Commit Context Menu (right click on any commit row) */}
      {editorOpen && <HistoryEditorDialog repoPath={repoPath} onClose={() => setEditorOpen(false)} />}
      {bisectOpen && (
        <BisectWizardDialog
          repoPath={repoPath}
          commits={commits}
          defaultBadHash={selectedCommit?.hash}
          onClose={() => setBisectOpen(false)}
        />
      )}
      {branchDrop && <DragDropActionModal open sourceBranch={branchDrop.source} targetBranch={branchDrop.target} onOpenChange={open => { if (!open) setBranchDrop(null); }} />}
      <ContextMenu
        open={ctxMenu.open}
        x={ctxMenu.x}
        y={ctxMenu.y}
        items={ctxMenuItems}
        onClose={() => setCtxMenu((s) => ({ ...s, open: false }))}
      />
    </div>
  );
};
