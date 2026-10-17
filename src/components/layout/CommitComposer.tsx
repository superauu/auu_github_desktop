import { useShallow } from 'zustand/react/shallow';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useWorkspaceSessionStore, draftKey, EMPTY_DRAFT } from '@/stores/workspaceSessionStore';
import { Check, FileText, Loader2, Send, Settings, Sparkles } from 'lucide-react';
import { useRepoStore } from '@/stores/repoStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useGitHubStore } from '@/stores/githubStore';
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
  const { aiConfig } = useSettingsStore();
  const { t } = useI18n();
  const { busy, setBusy, operation, scopeSignature, title, setTitle, body, setBody, amend, setAmend, amendCommit, setAmendCommit, origin, setOrigin } = draftState;
  const [generating, setGenerating] = useState(false);
  const [preview, setPreview] = useState<GenerationResult | null>(null);
  const [scopeOpen, setScopeOpen] = useState(false);
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
  }, [currentRepo?.path, currentRepo?.currentBranch]);
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
      const result = await aiCommitService.generateCommitMessageResult({ repoPath: currentRepo.path, files: scope.files, aiConfig });
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
      const latestStatus = await gitService.getStatus(path);
      const latestScope = getCommitScope(latestStatus, amend);
      if (useRepoStore.getState().currentRepo?.path !== path) return;
      if (latestStatus.currentBranch !== status?.currentBranch || JSON.stringify(latestScope.files) !== scopeKey) {
        await useRepoStore.getState().refreshStatus();
        toast.warning(t('composer.scopeChanged'), t('composer.scopeChangedDesc')); return;
      }
      if (amend && await gitService.getBranchCommitHash(path, 'HEAD') !== amendCommit?.hash) { toast.warning(t('composer.scopeChanged'), t('composer.scopeChangedDesc')); setAmend(false); return; }
      if (amend && !await confirmAction({ title: t('rightPane.commitAmend'), description: t('composer.amendWarning'), detail: `${amendCommit?.shortHash} ${amendCommit?.subject}` })) return;
      if (latestScope.stageAll) await gitService.stageAll(path);
      await gitService.commit(path, message, amend);
      useRepoStore.setState({ redoStack: [] });
      setTitle(''); setBody(''); setAmend(false); setAmendCommit(null); setOrigin(null);
      toast.success(t(amend ? 'rightPane.amendSuccess' : 'rightPane.commitSuccess'), message.split('\n')[0]);
      if (andPush) {
        try {
          const hash = await gitService.getBranchCommitHash(path, 'HEAD');
          await gitService.push(path);
          if (hash && useRepoStore.getState().currentRepo?.path === path) useGitHubStore.getState().watchPushChecks(hash);
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
  return <div className="h-full min-h-0 flex flex-col text-[13px]" onKeyDown={(event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !preview && !disabled) { event.preventDefault(); void submit(); }
  }}>
    <section className="mx-4 mt-4 shrink-0 rounded-lg border border-border bg-muted/30 p-3 space-y-1" aria-label={t('composer.scope')}>
      <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 font-semibold"><FileText className="h-4 w-4 text-muted-foreground" />{t('composer.scope')}</span><span>{t('composer.included').replace('{n}', String(scope.files.length))}</span></div>
      <p className="text-[12px] text-muted-foreground leading-relaxed">{scope.stageAll ? t('composer.stageAllHint') : t('composer.excluded').replace('{n}', String(scope.excluded.length))}</p>
      {!!scope.files.length && <>
        <button className="text-primary underline-offset-4 hover:underline min-h-7" aria-expanded={scopeOpen} onClick={() => setScopeOpen(!scopeOpen)}>{t(scopeOpen ? 'composer.hideFiles' : 'composer.showFiles')}</button>
        {scopeOpen && <ul className="max-h-48 overflow-auto space-y-2 border-t border-border pt-2">{scope.files.map(file => <li key={file.path}><FilePath path={file.path} /></li>)}</ul>}
      </>}
    </section>
    <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
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
      <p className="break-words">{amendCommit?.shortHash} · {amendCommit?.subject}</p>
      <p className="text-[12px] text-muted-foreground leading-relaxed">{t('composer.amendWarning')}</p>
      <button className="text-primary min-h-7" onClick={() => void toggleAmend(false)}>{t('composer.cancelAmend')}</button>
    </div>}
    </div>
    <div className="shrink-0 space-y-2 border-t border-border p-4 bg-card">
      <Button disabled={disabled} className="w-full h-10" onClick={() => void submit()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}<span className="truncate">{actionLabel}{scope.files.length ? ` (${scope.files.length})` : ''}</span></Button>
      <Button disabled={disabled} variant="outline" className="w-full h-9" onClick={() => void submit(true)}><Send className="h-4 w-4" />{t(amend ? 'composer.amendPush' : scope.stageAll ? 'rightPane.stageAllCommitPush' : 'rightPane.commitPush')}</Button>
      <p className="text-[12px] text-muted-foreground text-center">Ctrl / ⌘ + Enter</p>
    </div>
    {preview && <ModalSurface label={t('composer.preview')} onDismiss={() => setPreview(null)} className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-6">
      <div className="w-full max-w-2xl rounded-xl border border-border bg-popover p-6 shadow-2xl space-y-4">
        <h2 className="font-semibold text-base">{t('composer.preview')}</h2>
        <p className="text-[12px] text-muted-foreground">{sourceLabel(preview)} · {t('composer.included').replace('{n}', String(scope.files.length))}</p>
        <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed rounded-lg border border-border bg-muted/30 p-4">{preview.message}</pre>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setPreview(null)}>{t('composer.keepDraft')}</Button><Button onClick={() => { setMessage(preview.message); setOrigin(preview); setPreview(null); }}>{t(draft.current.trim() ? 'composer.replaceDraft' : 'composer.useMessage')}</Button></div>
      </div>
    </ModalSurface>}
  </div>;
}
