import { chooseRemoteTarget } from '@/services/git/RemoteActions';
import { watchPushedCommit } from '@/services/git/PushChecks';
import { useShallow } from 'zustand/react/shallow';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useWorkspaceSessionStore, draftKey, EMPTY_DRAFT } from '@/stores/workspaceSessionStore';
import { Check, ChevronDown, FileText, ListTree, Loader2, Send, Settings, Sparkles } from 'lucide-react';
import { useRepoStore } from '@/stores/repoStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { confirmAction } from '@/stores/confirmStore';
import { gitService } from '@/services/git/GitService';
import { getCommitScope } from '@/services/git/commitScope';
import { aiCommitService, type GenerationResult } from '@/services/ai/AiCommitService';
import type { GitCommit } from '@/services/git/types';
import { useI18n } from '@/i18n';
import { toast } from '@/stores/toastStore';
import { Button } from '@/components/ui/button';
import { ModalSurface } from '@/components/ui/ModalSurface';
import { FilePath } from '@/components/ui/FilePath';
import { AiCommitBatchDialog } from '@/features/git/AiCommitBatchDialog';
import { confirmWorkingReview } from '@/features/review/confirmWorkingReview';
import { useCurrentBranchIssue } from '@/features/issues/useCurrentBranchIssue';
import { issueKey } from '@/features/issues/issueLogic';
import { issueCommitDraft, toIssueContext } from '@/services/ai/issueContext';
import { appendCommitTrailer } from '@/services/errors/fixFlow';
import { useErrorsStore } from '@/stores/errorsStore';
import { useHunkPlanDialogStore } from '@/stores/hunkPlanDialogStore';

/** 提交动作区分组：AI 规划（暂存/全部）与提交（提交/提交并推送）各自合并为一个 split button。 */
type AiPlanMode = 'staged' | 'all';
type CommitMode = 'commit' | 'commitPush';
const AI_PLAN_PREF = 'auugit.composer.aiPlan';
const COMMIT_MODE_PREF = 'auugit.composer.commit';
// split button 默认面记忆「上次使用」的方式；node 单测环境无 window/localStorage，静默回落默认值
const readActionPref = (key: string): string | null => {
  try { return window.localStorage.getItem(key); } catch { return null; }
};
const writeActionPref = (key: string, value: string): void => {
  try { window.localStorage.setItem(key, value); } catch { /* 无 localStorage 的环境忽略 */ }
};

export function useComposerDraft(repoPath?: string, branch?: string) {
  const [busy, setBusy] = useState(false);
  const operation = useRef(false);
  const scopeSignature = useRef('');
  const key = draftKey(repoPath, branch);
  const saved = useWorkspaceSessionStore(state => state.drafts[key]) || EMPTY_DRAFT;
  const { title, body } = saved;
  const setTitle = useCallback((title: string) => useWorkspaceSessionStore.getState().updateDraft(key, { title }), [key]);
  const setBody = useCallback((body: string) => useWorkspaceSessionStore.getState().updateDraft(key, { body }), [key]);
  const [amend, setAmend] = useState(false);
  const [amendCommit, setAmendCommit] = useState<GitCommit | null>(null);
  const [origin, setOrigin] = useState<GenerationResult | null>(null);
  useEffect(() => { setAmend(false); setAmendCommit(null); setOrigin(null); }, [repoPath, branch]);
  return { busy, setBusy, operation, scopeSignature, title, setTitle, body, setBody, amend, setAmend, amendCommit, setAmendCommit, origin, setOrigin };
}

export function CommitComposer({ onOpenAiSettings, draftState }: {
  onOpenAiSettings: () => void; draftState: ReturnType<typeof useComposerDraft>;
}) {
  const { currentRepo, status } = useRepoStore(useShallow(state => ({ currentRepo: state.currentRepo, status: state.status })));
  const aiConfig = useSettingsStore(state => state.aiConfig);
  const { t } = useI18n();
  const { busy, setBusy, operation, scopeSignature, title, setTitle, body, setBody, amend, setAmend, amendCommit, setAmendCommit, origin, setOrigin } = draftState;
  const [generating, setGenerating] = useState(false);
  const [preview, setPreview] = useState<GenerationResult | null>(null);
  const [scopeOpen, setScopeOpen] = useState(false);
  const currentTask = useCurrentBranchIssue();
  const [includeIssue, setIncludeIssue] = useState(false);
  const taskKey = currentTask.reference ? issueKey(currentTask.reference) : '';
  const [batchContext, setBatchContext] = useState<{ path: string; branch: string } | null>(null);
  const hunkContext = useHunkPlanDialogStore(state => state.context);
  // 两个 split button 的默认面：上次使用的方式（localStorage 全局记忆）
  const [aiPlanMode, setAiPlanMode] = useState<AiPlanMode>(() => readActionPref(AI_PLAN_PREF) === 'all' ? 'all' : 'staged');
  const [commitMode, setCommitMode] = useState<CommitMode>(() => readActionPref(COMMIT_MODE_PREF) === 'commitPush' ? 'commitPush' : 'commit');
  const [aiMenuOpen, setAiMenuOpen] = useState(false);
  const [commitMenuOpen, setCommitMenuOpen] = useState(false);
  useEffect(() => { setBatchContext(null); }, [currentRepo?.path, status?.currentBranch]);
  const generation = useRef(0);
  const draft = useRef('');
  draft.current = title + (body.trim() ? `\n\n${body}` : '');
  const scope = getCommitScope(status, amend);
  const scopeKey = JSON.stringify(scope.files);
  const configured = aiConfig.provider === 'openai-compatible' && !!aiConfig.apiKey.trim();
  const setMessage = (message: string) => {
    const [first = '', ...rest] = message.split('\n');
    setTitle(first); setBody(rest.join('\n').trim());
  };
  useEffect(() => {
    generation.current++;
    setPreview(null); setGenerating(false);
    setIncludeIssue(false);
  }, [currentRepo?.path, currentTask.branch, taskKey, currentTask.scope]);
  useEffect(() => {
    const signature = scopeKey + amend;
    if (signature !== scopeSignature.current) { generation.current++; setPreview(null); setOrigin(null); setGenerating(false); scopeSignature.current = signature; }
  }, [scopeKey, amend, scopeSignature, setOrigin]);
  useEffect(() => () => { generation.current++; }, []);
  const sourceLabel = (result: GenerationResult) => result.source === 'llm'
    ? `AI · ${result.model}` : t(result.fallback ? 'composer.localFallback' : 'composer.localRules');

  const generate = async () => {
    if (!currentRepo || !scope.files.length || generating || busy) return;
    const request = ++generation.current;
    setGenerating(true);
    try {
      const issueContext = includeIssue && currentTask.issue && currentTask.reference ? [toIssueContext(currentTask.reference, currentTask.issue)] : undefined;
      const result = await aiCommitService.generateCommitMessageResult({ repoPath: currentRepo.path, files: scope.files, aiConfig, issueContext });
      if (request !== generation.current || useRepoStore.getState().currentRepo?.path !== currentRepo.path) return;
      // Generated text always remains reviewable before it replaces a user's draft.
      setPreview(result);
      if (result.fallback) toast.warning(t('composer.fallbackTitle'), t('composer.fallbackDesc'));
    } catch (error: any) {
      if (request === generation.current) toast.error(t('rightPane.aiFailed'), error?.message);
    } finally {
      if (request === generation.current) setGenerating(false);
    }
  };

  const toggleAmend = async (enabled: boolean) => {
    if (busy || !currentRepo) return;
    if (!enabled) { setAmend(false); setAmendCommit(null); return; }
    const path = currentRepo.path;
    try {
      const [commit] = await gitService.getCommitsForBranch(path, 'HEAD', 1);
      if (useRepoStore.getState().currentRepo?.path !== path) return;
      if (!commit) { toast.warning(t('header.undoTooltipEmpty')); return; }
      setAmendCommit(commit); setAmend(true);
      if (!draft.current.trim()) setMessage(commit.subject + (commit.body ? `\n\n${commit.body}` : ''));
    } catch (error: any) { toast.error(t('rightPane.commitFailed'), error?.message); }
  };

  const submit = async (andPush = false) => {
    if (operation.current || busy || !currentRepo || !title.trim() || (!scope.files.length && !amend)) return;
    operation.current = true; setBusy(true);
    const path = currentRepo.path;
    const message = draft.current.trim();
    try {
      const pushTarget = andPush ? await chooseRemoteTarget(path) : null;
      if (andPush && !pushTarget) return;
      const latestStatus = await gitService.getStatus(path);
      const latestScope = getCommitScope(latestStatus, amend);
      if (useRepoStore.getState().currentRepo?.path !== path) return;
      if (latestStatus.currentBranch !== status?.currentBranch || JSON.stringify(latestScope.files) !== scopeKey) {
        await useRepoStore.getState().refreshStatus();
        toast.warning(t('composer.scopeChanged'), t('composer.scopeChangedDesc')); return;
      }
      if (amend && await gitService.getBranchCommitHash(path, 'HEAD') !== amendCommit?.hash) { toast.warning(t('composer.scopeChanged'), t('composer.scopeChangedDesc')); setAmend(false); return; }
      if (amend && !await confirmAction({ title: t('rightPane.commitAmend'), description: t('composer.amendWarning'), detail: `${amendCommit?.shortHash} ${amendCommit?.subject}` })) return;
      if (!await confirmWorkingReview(path, latestStatus.currentBranch, latestScope.files, false, latestStatus.headOid)) return;
      const reviewedStatus = await gitService.getStatus(path);
      if (useRepoStore.getState().currentRepo?.path !== path || reviewedStatus.currentBranch !== latestStatus.currentBranch || reviewedStatus.headOid !== latestStatus.headOid || JSON.stringify(getCommitScope(reviewedStatus, amend).files) !== scopeKey) {
        toast.warning(t('composer.scopeChanged'), t('composer.scopeChangedDesc')); return;
      }
      if (latestScope.stageAll) await gitService.stageAll(path);
      // Errors 修复分支（PRD §8.2）：当前分支已被链接时自动追加中性 trailer（幂等）
      const errorTrailer = useErrorsStore.getState().trailerForBranch(path, latestStatus.currentBranch);
      const finalMessage = errorTrailer ? appendCommitTrailer(message, errorTrailer) : message;
      await gitService.commit(path, finalMessage, amend);
      useRepoStore.setState({ redoStack: [] });
      // 记录修复提交到 IssueGitLink（amend 改写历史，不记录）
      if (!amend) {
        try {
          const sha = await gitService.getBranchCommitHash(path, 'HEAD');
          if (sha) useErrorsStore.getState().recordFixCommit(path, latestStatus.currentBranch, sha);
        } catch { /* 关联记录失败不影响提交流程 */ }
      }
      setTitle(''); setBody(''); setAmend(false); setAmendCommit(null); setOrigin(null);
      toast.success(t(amend ? 'rightPane.amendSuccess' : 'rightPane.commitSuccess'), message.split('\n')[0]);
      if (andPush) {
        try {
          const hash = await gitService.getBranchCommitHash(path, 'HEAD');
          const pushed = await gitService.push(path, pushTarget!.remote, pushTarget!.branch, pushTarget!);
          if (pushed?.preferenceError) toast.warning(t('remote.preferenceNotSaved'), pushed.preferenceError);
          if (hash) await watchPushedCommit(path, pushTarget!.remote, pushTarget!.branch, hash, () => useRepoStore.getState().currentRepo?.path === path);
          toast.success(t('rightPane.pushSuccess'));
        } catch (error: any) { toast.error(t('rightPane.pushFailed'), error?.message); }
      }
    } catch (error: any) { toast.error(t('rightPane.commitFailed'), error?.message); }
    finally {
      if (useRepoStore.getState().currentRepo?.path === path) await useRepoStore.getState().refreshStatus().catch(() => {});
      operation.current = false; setBusy(false);
    }
  };

  const disabled = busy || generating || !title.trim() || (!scope.files.length && !amend);
  const actionLabel = amend ? t('rightPane.commitAmend') : scope.stageAll ? t('rightPane.stageAllCommit') : t('rightPane.commit');
  // ===== split button：默认面 + 下拉记忆 =====
  const hunkPlanDisabled = busy || generating || amend || !currentRepo || !status;
  const batchDisabled = hunkPlanDisabled || !(status ? status.staged.length + status.unstaged.length + status.untracked.length : 0);
  const aiPlanLabel = (mode: AiPlanMode) => mode === 'staged' ? t('hunkPlan.button') : t('batch.button');
  const commitModeLabel = (mode: CommitMode) => mode === 'commit' ? actionLabel
    : amend ? t('composer.amendPush') : scope.stageAll ? t('rightPane.stageAllCommitPush') : t('rightPane.commitPush');
  const runAiPlan = (mode: AiPlanMode) => {
    setAiPlanMode(mode); writeActionPref(AI_PLAN_PREF, mode); setAiMenuOpen(false); setCommitMenuOpen(false);
    // 切换默认方式无条件限制（条件不满足也能预先记住）；仅执行动作本身受条件约束
    if (!currentRepo || !status) return;
    if (mode === 'staged') useHunkPlanDialogStore.getState().open(currentRepo.path, status.currentBranch);
    else if (status.staged.length + status.unstaged.length + status.untracked.length) setBatchContext({ path: currentRepo.path, branch: status.currentBranch });
  };
  const runCommit = (mode: CommitMode) => {
    setCommitMode(mode); writeActionPref(COMMIT_MODE_PREF, mode); setCommitMenuOpen(false); setAiMenuOpen(false);
    // submit 自带条件守卫：条件不满足时这里只完成「切换并记住默认方式」，不执行
    void submit(mode === 'commitPush');
  };
  return <div className="h-full min-h-0 flex flex-col text-[13px] overflow-y-auto" onKeyDown={(event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !preview && !batchContext && !hunkContext && !disabled) { event.preventDefault(); void submit(commitMode === 'commitPush'); }
  }}>
    <section className="mx-4 mt-4 shrink-0 rounded-lg border border-border bg-muted/30 p-3 space-y-1" aria-label={t('composer.scope')}>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 font-semibold" title={t('composer.scope')}><FileText className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="truncate">{t('composer.scopeTitle')}</span></span>
        <span className="shrink-0 whitespace-nowrap tabular-nums">{t('composer.fileCount').replace('{n}', String(scope.files.length))}</span>
      </div>
      <p className="text-[12px] text-muted-foreground leading-relaxed">{scope.stageAll ? t('composer.stageAllHint') : t('composer.excluded').replace('{n}', String(scope.excluded.length))}</p>
      {!!scope.files.length && <>
        <button className="text-primary underline-offset-4 hover:underline min-h-7" aria-expanded={scopeOpen} onClick={() => setScopeOpen(!scopeOpen)}>{t(scopeOpen ? 'composer.hideFiles' : 'composer.showFiles')}</button>
        {scopeOpen && <ul className="max-h-48 overflow-auto space-y-2 border-t border-border pt-2">{scope.files.map(file => <li key={file.path}><FilePath path={file.path} /></li>)}</ul>}
      </>}
    </section>
    {/* 单滚动模型：根容器整体滚动，按钮区粘底——矮面板下表单不再被挤成碎条，
        高度充裕时布局与之前完全一致（mt-auto 保证按钮区贴底） */}
    <div className="p-4 space-y-4">
    {currentTask.reference && <section aria-label={t('issueFlow.commitContext')} className="rounded-lg border border-border p-3 space-y-2 text-xs">
      <p className="break-words">{taskKey}{currentTask.issue ? ` · ${currentTask.issue.title}` : ''}</p>
      <Button variant="outline" size="xs" disabled={busy || generating || !currentTask.issue} onClick={() => {
        if (!currentTask.reference || !currentTask.issue) return;
        setPreview({ message: issueCommitDraft(toIssueContext(currentTask.reference, currentTask.issue), currentTask.issue.labels.some(label => label.name.toLowerCase() === 'bug')), source: 'builtin', fallback: false });
      }}>{t('issueFlow.draftCommit')}</Button>
      <label className="flex items-start gap-2"><input type="checkbox" checked={includeIssue} disabled={busy || generating || !currentTask.issue} onChange={event => { generation.current++; setIncludeIssue(event.target.checked); setPreview(null); }} /><span>{t('issueFlow.includeContext')}</span></label>
      <p className="text-muted-foreground text-[11px]">{t('issueFlow.contextHint')}</p>
    </section>}
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2"><label htmlFor="commit-title" className="font-medium">{t('composer.title')}</label><Button variant="outline" size="xs" onClick={generate} disabled={generating || busy || !scope.files.length}><Sparkles className="h-3.5 w-3.5" />{t(generating ? 'composer.generating' : 'composer.generate')}</Button></div>
      <div className="flex items-center justify-between gap-2 text-[12px] text-muted-foreground">
        <span role="status">{origin ? sourceLabel(origin) : configured ? `AI · ${aiConfig.model || 'deepseek-chat'}` : t('composer.localRules')}</span>
        <button className="flex items-center gap-1 min-h-7 hover:text-foreground" onClick={onOpenAiSettings}><Settings className="h-3.5 w-3.5" />{t('composer.configureAi')}</button>
      </div>

      <input id="commit-title" value={title} disabled={busy} onChange={event => setTitle(event.target.value)} placeholder={t('composer.titlePlaceholder')} className="w-full h-10 rounded-md border border-input bg-background px-3 text-[13px]" />
      <label htmlFor="commit-body" className="block pt-2 font-medium">{t('composer.body')}</label>
      <textarea id="commit-body" value={body} disabled={busy} onChange={event => setBody(event.target.value)} placeholder={t('composer.bodyPlaceholder')} rows={3} className="w-full min-h-24 resize-y rounded-md border border-input bg-background p-3 text-[13px] leading-relaxed font-sans" />
    </div>
    <details className="text-[12px] text-muted-foreground">
      <summary className="cursor-pointer min-h-7">{t('composer.moreOptions')}</summary>
      <label className="flex items-center gap-2 py-2"><input type="checkbox" checked={amend} disabled={busy} onChange={event => void toggleAmend(event.target.checked)} />{t('rightPane.amend')}</label>
    </details>
    {amend && <div role="status" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-2">
      <p className="font-semibold">{t('rightPane.commitAmend')} · {status?.currentBranch}</p>
      <p className="wrap-break-word">{amendCommit?.shortHash} · {amendCommit?.subject}</p>
      <p className="text-[12px] text-muted-foreground leading-relaxed">{t('composer.amendWarning')}</p>
      <button className="text-primary min-h-7" onClick={() => void toggleAmend(false)}>{t('composer.cancelAmend')}</button>
    </div>}
    </div>
    <div className="commit-actions sticky bottom-0 z-10 mt-auto space-y-2 border-t border-border bg-card/95 backdrop-blur-sm p-4">
      {/* AI 规划 split button：主按钮执行上次使用的方式，下拉切换方式（选中即执行并记住）。
          注意：working-review 单测按「w-full h-10 + font-semibold」定位提交主按钮，
          此处主按钮不得带 font-semibold，避免成为第一个匹配。 */}
      <div className="relative flex w-full">
        <Button variant="outline" className="min-w-0 w-full h-10 rounded-r-none border-r-0" disabled={aiPlanMode === 'staged' ? hunkPlanDisabled : batchDisabled} title={aiPlanMode === 'staged' ? t('hunkPlan.scope') : t(amend ? 'batch.noAmend' : 'batch.scope')} onClick={() => runAiPlan(aiPlanMode)}>
          {aiPlanMode === 'staged' ? <ListTree className="h-4 w-4 text-muted-foreground" /> : <Sparkles className="h-4 w-4 text-muted-foreground" />}
          <span className="truncate">{aiPlanLabel(aiPlanMode)}</span>
        </Button>
        <Button variant="outline" className="h-10 w-8 shrink-0 rounded-l-none px-0" aria-label={t('composer.chooseAiPlan')} aria-expanded={aiMenuOpen} onClick={() => { setAiMenuOpen(!aiMenuOpen); setCommitMenuOpen(false); }}>
          <ChevronDown className="h-4 w-4" />
        </Button>
        {aiMenuOpen && <>
          <div className="fixed inset-0 z-20" aria-hidden="true" onClick={() => setAiMenuOpen(false)} />
          <div role="menu" aria-label={t('composer.chooseAiPlan')} className="absolute bottom-full left-0 right-0 z-30 mb-1 rounded-lg border border-border bg-popover p-1 shadow-xl">
            <button role="menuitemradio" aria-checked={aiPlanMode === 'staged'} onClick={() => runAiPlan('staged')} className="w-full text-left px-2 py-1.5 text-xs rounded-md flex items-center gap-2 text-foreground/80 hover:text-foreground hover:bg-accent disabled:opacity-40 disabled:pointer-events-none">
              <ListTree className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              {t('hunkPlan.button')}
              <Check className={aiPlanMode === 'staged' ? 'h-3.5 w-3.5 shrink-0 ml-auto text-primary' : 'h-3.5 w-3.5 shrink-0 ml-auto opacity-0'} />
            </button>
            <button role="menuitemradio" aria-checked={aiPlanMode === 'all'} onClick={() => runAiPlan('all')} className="w-full text-left px-2 py-1.5 text-xs rounded-md flex items-center gap-2 text-foreground/80 hover:text-foreground hover:bg-accent disabled:opacity-40 disabled:pointer-events-none">
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              {t('batch.button')}
              <Check className={aiPlanMode === 'all' ? 'h-3.5 w-3.5 shrink-0 ml-auto text-primary' : 'h-3.5 w-3.5 shrink-0 ml-auto opacity-0'} />
            </button>
          </div>
        </>}
      </div>
      {/* 提交 split button：默认面为上次使用的方式（提交 / 提交并推送），Ctrl+Enter 跟随当前默认面 */}
      <div className="relative flex w-full">
        <Button disabled={disabled} className="min-w-0 w-full h-10 font-semibold rounded-r-none border-r-0" onClick={() => runCommit(commitMode)}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : commitMode === 'commitPush' ? <Send className="h-4 w-4" /> : <Check className="h-4 w-4" />}
          <span className="truncate">{commitModeLabel(commitMode)}{scope.files.length ? ` (${scope.files.length})` : ''}</span>
        </Button>
        <Button variant="outline" className="h-10 w-8 shrink-0 rounded-l-none px-0" aria-label={t('composer.chooseCommitAction')} aria-expanded={commitMenuOpen} onClick={() => { setCommitMenuOpen(!commitMenuOpen); setAiMenuOpen(false); }}>
          <ChevronDown className="h-4 w-4" />
        </Button>
        {commitMenuOpen && <>
          <div className="fixed inset-0 z-20" aria-hidden="true" onClick={() => setCommitMenuOpen(false)} />
          <div role="menu" aria-label={t('composer.chooseCommitAction')} className="absolute bottom-full left-0 right-0 z-30 mb-1 rounded-lg border border-border bg-popover p-1 shadow-xl">
            <button role="menuitemradio" aria-checked={commitMode === 'commit'} onClick={() => runCommit('commit')} className="w-full text-left px-2 py-1.5 text-xs rounded-md flex items-center gap-2 text-foreground/80 hover:text-foreground hover:bg-accent disabled:opacity-40 disabled:pointer-events-none">
              <Check className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              {commitModeLabel('commit')}
              <Check className={commitMode === 'commit' ? 'h-3.5 w-3.5 shrink-0 ml-auto text-primary' : 'h-3.5 w-3.5 shrink-0 ml-auto opacity-0'} />
            </button>
            <button role="menuitemradio" aria-checked={commitMode === 'commitPush'} onClick={() => runCommit('commitPush')} className="w-full text-left px-2 py-1.5 text-xs rounded-md flex items-center gap-2 text-foreground/80 hover:text-foreground hover:bg-accent disabled:opacity-40 disabled:pointer-events-none">
              <Send className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              {commitModeLabel('commitPush')}
              <Check className={commitMode === 'commitPush' ? 'h-3.5 w-3.5 shrink-0 ml-auto text-primary' : 'h-3.5 w-3.5 shrink-0 ml-auto opacity-0'} />
            </button>
          </div>
        </>}
      </div>
      <p className="text-[12px] text-muted-foreground text-center">Ctrl / ⌘ + Enter</p>
    </div>
    {preview && <ModalSurface label={t('composer.preview')} onDismiss={() => setPreview(null)} className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-6">
      <div className="w-full max-w-2xl rounded-xl border border-border bg-popover p-6 shadow-2xl space-y-4">
        <h2 className="font-semibold text-base">{t('composer.preview')}</h2>
        <p className="text-[12px] text-muted-foreground">{sourceLabel(preview)} · {t('composer.included').replace('{n}', String(scope.files.length))}</p>
        <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap wrap-break-word font-sans text-[13px] leading-relaxed rounded-lg border border-border bg-muted/30 p-4">{preview.message}</pre>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setPreview(null)}>{t('composer.keepDraft')}</Button><Button onClick={() => { setMessage(preview.message); setOrigin(preview); setPreview(null); }}>{t(draft.current.trim() ? 'composer.replaceDraft' : 'composer.useMessage')}</Button></div>
      </div>
    </ModalSurface>}
    {batchContext && batchContext.path === currentRepo?.path && batchContext.branch === status?.currentBranch && <AiCommitBatchDialog key={`${batchContext.path}:${batchContext.branch}`} repoPath={batchContext.path} branch={batchContext.branch} onClose={() => setBatchContext(null)} onOpenAiSettings={onOpenAiSettings} />}
  </div>;
}
