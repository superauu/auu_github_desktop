import { useShallow } from 'zustand/react/shallow';
import { confirmAction } from '@/stores/confirmStore';
import { ModalSurface } from '@/components/ui/ModalSurface';
import React, { useState, useEffect, useEffectEvent, useRef } from 'react';
import { GitPullRequest, X, Loader2, Check, Sparkles } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useRepoStore } from '@/stores/repoStore';
import { useGitHubStore } from '@/stores/githubStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { githubService } from '@/services/github/GitHubService';
import { gitService } from '@/services/git/GitService';
import { parseGitHubRemote } from '@/services/git/remoteIdentity';
import type { PushContext } from '@/services/git/types';
import { aiCommitService } from '@/services/ai/AiCommitService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/stores/toastStore';
import type { IssueReference } from '@/services/github/issueTypes';
import { IssuePicker } from '@/features/issues/IssuePicker';
import { withClosingIssues } from '@/features/issues/issueLogic';
import { useIssueWorkflowStore } from '@/stores/issueWorkflowStore';
import { useGitHubScope } from '@/features/issues/useGitHubScope';
import { issueKey } from '@/features/issues/issueLogic';
import { issuePRDraft, toIssueContext } from '@/services/ai/issueContext';

const sourceRepositories = (context: PushContext | null) => (context?.remotes || []).flatMap(remote => {
  const seen = new Set<string>();
  return (remote.pushUrl || remote.fetchUrl).split('\n').flatMap(url => {
    const identity = parseGitHubRemote(url);
    if (!identity) return [];
    const id = JSON.stringify([remote.name, identity.owner.toLowerCase(), identity.repo.toLowerCase()]);
    if (seen.has(id)) return [];
    seen.add(id);
    return [{ id, remote: remote.name, ...identity }];
  });
});

interface CreatePullRequestModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialIssue?: IssueReference;
  onCreated?: () => void;
}

export const CreatePullRequestModal: React.FC<CreatePullRequestModalProps> = ({
  open,
  onOpenChange,
  initialIssue,
  onCreated,
}) => {
  const { currentRepo, branches, commits, status } = useRepoStore(useShallow(state => ({ currentRepo: state.currentRepo, branches: state.branches, commits: state.commits, status: state.status })));
  const { currentOwner, currentRepoName, loadPullRequests, openPullRequest } = useGitHubStore(useShallow(state => ({ currentOwner: state.currentOwner, currentRepoName: state.currentRepoName, loadPullRequests: state.loadPullRequests, openPullRequest: state.openPullRequest })));
  const aiConfig = useSettingsStore(state => state.aiConfig);
  const { t } = useI18n();
  const githubScope = useGitHubScope();

  const currentBranch =
    currentRepo?.currentBranch ||
    status?.currentBranch ||
    branches.find((b) => b.isCurrent)?.name ||
    'main';

  const [headBranch, setHeadBranch] = useState(currentBranch);
  const [baseBranch, setBaseBranch] = useState('');
  const [defaultBase, setDefaultBase] = useState('');
  const [baseFor, setBaseFor] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingBase, setLoadingBase] = useState(false);
  const [isGeneratingDesc, setIsGeneratingDesc] = useState(false);
  const [sourceContext, setSourceContext] = useState<PushContext | null>(null);
  const [sourceFor, setSourceFor] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [publishedBranch, setPublishedBranch] = useState('');
  const [sourceError, setSourceError] = useState('');
  const [sourceAttempt, setSourceAttempt] = useState(0);
  const [linkedIssues, setLinkedIssues] = useState<IssueReference[]>([]);
  const [includeIssueContext, setIncludeIssueContext] = useState(false);
  const linkedKey = linkedIssues.map(issueKey).join('\0');
  const draftValue = useRef('');
  draftValue.current = JSON.stringify([title, body]);

  const targetKey = JSON.stringify([currentRepo?.path, currentRepo?.gitHubRemote, currentOwner, currentRepoName, githubScope.key]);
  const repoPath = currentRepo?.path, gitHubRemote = currentRepo?.gitHubRemote;
  const sourceKey = JSON.stringify([targetKey, headBranch]);
  const session = useRef(0);
  const descriptionRequest = useRef(0);
  useEffect(() => () => { session.current++; descriptionRequest.current++; }, []);
  useEffect(() => { descriptionRequest.current++; setIsGeneratingDesc(false); }, [open, targetKey, headBranch, baseBranch, linkedKey, includeIssueContext]);

  // Reset the draft only on opening or changing its target, never on a background refresh.
  const initializeDraft = useEffectEvent(() => {
    setHeadBranch(currentBranch);
    setTitle(commits[0]?.subject || '');
    setBody(commits[0]?.body || '');
    const linked = initialIssue || (currentRepo && useIssueWorkflowStore.getState().issueForBranch(currentRepo.path, currentBranch));
    setLinkedIssues(linked ? [linked] : []);
    setIncludeIssueContext(false);
  });
  useEffect(() => {
    session.current++;
    setIsSubmitting(false);
    if (!open) return;
    initializeDraft();
    setError(null);
    // The values above intentionally snapshot the draft at the start of this session.
  }, [open, targetKey]);

  const snapshotBaseCandidates = useEffectEvent(() => branches.filter(branch => branch.isRemote && branch.remoteName === gitHubRemote)
    .map(branch => branch.remoteBranch || branch.name.slice(branch.name.indexOf('/') + 1)));
  useEffect(() => {
    let active = true;
    setBaseBranch(''); setDefaultBase(''); setBaseFor(''); setLoadingBase(false);
    if (!open || !currentOwner || !currentRepoName) return;
    setLoadingBase(true);
    const candidates = snapshotBaseCandidates();
    void githubService.getRepositoryDefaultBranch(currentOwner, currentRepoName)
      .then(value => { if (active) { setBaseBranch(value); setDefaultBase(value); setBaseFor(targetKey); } })
      .catch(() => {
        if (!active) return;
        const fallback = candidates.includes('main') ? 'main' : candidates.includes('master') ? 'master' : candidates[0] || '';
        setBaseBranch(fallback); setDefaultBase(fallback); setBaseFor(targetKey);
      })
      .finally(() => { if (active) setLoadingBase(false); });
    return () => { active = false; };
    // Branches are a snapshot for the fallback; refreshing refs must not overwrite a chosen base.
  }, [open, targetKey, currentOwner, currentRepoName, gitHubRemote]);

  useEffect(() => {
    let active = true;
    setSourceContext(null); setSourceFor(''); setSourceId(''); setPublishedBranch(''); setSourceError('');
    if (!open || !repoPath || !headBranch) return;
    void gitService.getPushContext(repoPath, headBranch).then(context => {
      if (!active) return;
      const options = sourceRepositories(context);
      const preferred = options.filter(option => option.remote === context.remote);
      const selected = preferred.length === 1 ? preferred[0] : !context.remote && options.length === 1 ? options[0] : undefined;
      setSourceContext(context); setSourceFor(sourceKey); setSourceId(selected?.id || '');
      setPublishedBranch(selected?.remote === context.remote ? context.targetBranch : headBranch);
    }).catch(reason => { if (active) setSourceError(reason?.message || t('remote.loadFailed')); });
    return () => { active = false; };
    // sourceKey includes the target identity and local branch; old replies are discarded above.
  }, [open, sourceKey, sourceAttempt, t, repoPath, headBranch]);

  const sources = sourceFor === sourceKey ? sourceRepositories(sourceContext) : [];
  const source = sources.find(option => option.id === sourceId);
  const localBranchNames = branches.filter(branch => !branch.isRemote).map(branch => branch.name);
  const remoteBranchNames = Array.from(new Set([
    ...branches.filter(branch => branch.isRemote && branch.remoteName === currentRepo?.gitHubRemote)
      .map(branch => branch.remoteBranch || branch.name.slice(branch.name.indexOf('/') + 1)),
    ...(baseFor === targetKey && defaultBase ? [defaultBase] : []),
  ])).filter(name => name && name !== 'HEAD');
  const sameRepository = !!source && source.owner.toLowerCase() === currentOwner?.toLowerCase() && source.repo.toLowerCase() === currentRepoName?.toLowerCase();
  const sameBranch = sameRepository && publishedBranch.trim() === baseBranch;
  const ready = !!source && sourceFor === sourceKey && baseFor === targetKey && !loadingBase && !!publishedBranch.trim() && remoteBranchNames.includes(baseBranch);
  const isCurrentTarget = () => {
    const repo = useRepoStore.getState().currentRepo;
    const github = useGitHubStore.getState();
    return githubScope.isCurrent() && JSON.stringify([repo?.path, repo?.gitHubRemote, github.currentOwner, github.currentRepoName, githubScope.key]) === targetKey;
  };

  const handleGenerateDesc = async () => {
    if (!currentRepo || !headBranch || !baseBranch || !ready) return;
    const request = ++descriptionRequest.current;
    const currentSession = session.current;
    const originalDraft = draftValue.current;
    setIsGeneratingDesc(true);
    try {
      const issueContext = includeIssueContext ? await Promise.all(linkedIssues.slice(0, 5).map(async reference => toIssueContext(reference, await githubService.getIssue(reference.owner, reference.repo, reference.number)))) : undefined;
      if (request !== descriptionRequest.current || currentSession !== session.current || !isCurrentTarget()) return;
      const generated = await aiCommitService.generatePRDescriptionResult({
        repoPath: currentRepo.path,
        base: currentRepo.gitHubRemote ? `refs/remotes/${currentRepo.gitHubRemote}/${baseBranch}` : baseBranch,
        head: `refs/heads/${headBranch}`,
        aiConfig,
        issueContext,
      });
      if (request !== descriptionRequest.current || currentSession !== session.current || !isCurrentTarget()) return;
      if (generated.fallback) toast.warning(t('composer.fallbackTitle'), t('composer.fallbackDesc'));
      if (draftValue.current !== originalDraft) { toast.warning(t('issueFlow.draftChanged')); return; }
      if (await confirmAction({ title: t('composer.preview'), description: generated.source === 'llm' ? `AI · ${generated.model}` : t(generated.fallback ? 'composer.localFallback' : 'composer.localRules'), detail: withClosingIssues(generated.message, linkedIssues), confirmLabel: t('composer.useMessage'), danger: false }) && request === descriptionRequest.current && currentSession === session.current && isCurrentTarget() && draftValue.current === originalDraft) setBody(generated.message);
    } catch (err: any) {
      if (currentSession === session.current && isCurrentTarget()) toast.error(t('pr.aiGenerateFailed'), err?.message);
    } finally {
      if (request === descriptionRequest.current) setIsGeneratingDesc(false);
    }
  };

  const draftFromIssues = async () => {
    if (!linkedIssues.length || isGeneratingDesc || isSubmitting) return;
    const request = ++descriptionRequest.current, originalDraft = draftValue.current;
    setIsGeneratingDesc(true);
    try {
      const contexts = await Promise.all(linkedIssues.slice(0, 5).map(async reference => toIssueContext(reference, await githubService.getIssue(reference.owner, reference.repo, reference.number))));
      if (request !== descriptionRequest.current || !isCurrentTarget()) return;
      const result = issuePRDraft(contexts);
      if (draftValue.current !== originalDraft) { toast.warning(t('issueFlow.draftChanged')); return; }
      const accepted = await confirmAction({ title: t('issueFlow.draftPR'), description: t('issueFlow.previewHint'), detail: `${result.title}\n\n${withClosingIssues(result.body, linkedIssues)}`, confirmLabel: t('composer.useMessage'), danger: false });
      if (accepted && request === descriptionRequest.current && isCurrentTarget() && draftValue.current === originalDraft) { setTitle(result.title); setBody(result.body); }
    } catch (reason) { if (request === descriptionRequest.current && isCurrentTarget()) toast.error(t('pr.aiGenerateFailed'), reason instanceof Error ? reason.message : String(reason)); }
    finally { if (request === descriptionRequest.current) setIsGeneratingDesc(false); }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;
    if (!currentOwner || !currentRepoName) { setError(t('pr.needLogin')); return; }
    if (!title.trim()) { setError(t('pr.titleEmpty')); return; }
    if (!ready || !source) { setError(t('remote.prSourceMissing')); return; }
    if (sameBranch) { setError(t('pr.sameBranch')); return; }
    if (!isCurrentTarget()) { setError(t('remote.changed')); return; }
    const currentSession = session.current;
    setIsSubmitting(true); setError(null);
    try {
      const created = await githubService.createPullRequest(currentOwner, currentRepoName, {
        title: title.trim(),
        head: sameRepository ? publishedBranch.trim() : `${source.owner}:${publishedBranch.trim()}`,
        ...(!sameRepository ? { headRepo: source.repo } : {}),
        base: baseBranch,
        body: withClosingIssues(body, linkedIssues),
      });
      if (currentSession !== session.current || !isCurrentTarget()) return;
      toast.success(t('pr.created').replace('{n}', String(created.number)), created.html_url);
      await loadPullRequests();
      if (currentSession !== session.current || !isCurrentTarget()) return;
      const fresh = useGitHubStore.getState().pullRequests.find(pr => pr.number === created.number);
      openPullRequest(fresh || created);
      onOpenChange(false);
      onCreated?.();
    } catch (err: any) {
      if (currentSession !== session.current || !isCurrentTarget()) return;
      const message: string = err?.message || t('pr.createFailed');
      setError(/no commits between/i.test(message) ? t('pr.noCommitsDiff') : message);
    } finally {
      if (currentSession === session.current) setIsSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <ModalSurface onDismiss={() => onOpenChange(false)} dismissible={!isSubmitting} label={t('pr.createTitle')}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs animate-in fade-in-0 select-none"
    >
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-card shadow-2xl p-5 space-y-4 animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <GitPullRequest className="h-4 w-4" />
            </div>
            <div>
              <div className="font-semibold text-xs text-foreground">{t('pr.createTitle')}</div>
              <div className="text-[11px] text-muted-foreground">
                {currentOwner}/{currentRepoName || t('pr.noRepoBound')}
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            className="p-0 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* Branch flow: head → base */}
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 block">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                {t('remote.source')}
              </span>
              <select
                value={headBranch}
                disabled={isSubmitting}
                onChange={(e) => setHeadBranch(e.target.value)}
                className="w-full h-8 rounded-lg border border-input bg-background/80 px-2 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-ring"
              >
                {localBranchNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 block">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                {t('pr.targetBranch')}
              </span>
              <select
                value={baseBranch}
                onChange={(e) => setBaseBranch(e.target.value)}
                disabled={loadingBase || isSubmitting || baseFor !== targetKey}
                className="w-full h-8 rounded-lg border border-input bg-background/80 px-2 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-ring disabled:opacity-50"
              >
                {loadingBase ? (
                  <option value="">{t('pr.loadingBase')}</option>
                ) : (
                  remoteBranchNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))
                )}
              </select>
            </label>
          </div>

          <label className="block space-y-1 text-xs">
            <span>{t('remote.prSourceRepo')}</span>
            <select aria-label={t('remote.prSourceRepo')} value={sourceId} disabled={isSubmitting || sourceFor !== sourceKey} className="w-full rounded-lg border border-input bg-background p-2 text-xs" onChange={event => {
              const selected = sources.find(option => option.id === event.target.value);
              setSourceId(event.target.value);
              setPublishedBranch(selected?.remote === sourceContext?.remote ? sourceContext!.targetBranch : headBranch);
            }}>
              <option value="">{sourceFor !== sourceKey && !sourceError ? t('remote.prSourceLoading') : t('remote.select')}</option>
              {sources.map(option => <option key={option.id} value={option.id}>{option.remote} — {option.owner}/{option.repo}</option>)}
            </select>
            <p className="text-muted-foreground">{t('remote.prSourceHint')}</p>
          </label>
          {sourceError && <div role="alert" className="text-xs text-destructive">{sourceError} <Button type="button" variant="outline" size="xs" onClick={() => setSourceAttempt(value => value + 1)}>{t('remote.retry')}</Button></div>}
          <label className="block space-y-1 text-xs">
            <span>{t('remote.prSourceBranch')}</span>
            <Input aria-label={t('remote.prSourceBranch')} value={publishedBranch} disabled={isSubmitting || sourceFor !== sourceKey} onChange={event => setPublishedBranch(event.target.value)} />
          </label>
          {source && baseBranch && baseFor === targetKey && <p className="rounded-lg bg-muted p-2 text-xs break-all">{source.owner}/{source.repo}:{publishedBranch} → {currentOwner}/{currentRepoName}:{baseBranch}</p>}

          <IssuePicker selected={linkedIssues} onChange={setLinkedIssues} disabled={isSubmitting} />
          {!!linkedIssues.length && <div className="space-y-2 text-xs">
            <Button type="button" size="xs" variant="outline" disabled={isGeneratingDesc || isSubmitting} onClick={() => void draftFromIssues()}>{t('issueFlow.draftPR')}</Button>
            <label className="flex items-start gap-2"><input type="checkbox" checked={includeIssueContext} disabled={isGeneratingDesc || isSubmitting} onChange={event => setIncludeIssueContext(event.target.checked)} /><span>{t('issueFlow.includeContext')}</span></label>
            <p className="text-[11px] text-muted-foreground">{t('issueFlow.contextHint')}</p>
          </div>}
          {!!linkedIssues.length && baseBranch !== defaultBase && <p className="text-xs text-amber-600 dark:text-amber-400">{t('issues.nonDefaultBase')}</p>}

          {/* Title */}
          <label className="space-y-1 block">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              {t('pr.titleLabel')}
            </span>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('pr.titlePlaceholder')}
              className="h-8 text-xs"
            />
          </label>

          {/* Description */}
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                {t('pr.descLabel')}
              </span>
              <Button
                variant="outline"
                size="xs"
                type="button"
                onClick={handleGenerateDesc}
                disabled={isGeneratingDesc || isSubmitting || !ready || sameBranch}
                className="h-5 px-1.5 text-[11px] gap-1 border-git-branch/40 text-git-branch hover:bg-git-branch/10"
                title={t('pr.aiGenerateTitle')}
              >
                <Sparkles className="h-2.5 w-2.5" />
                <span>{isGeneratingDesc ? t('pr.aiGenerating') : t('pr.aiGenerate')}</span>
              </Button>
            </div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t('pr.descPlaceholder')}
              rows={4}
              className="w-full resize-none rounded-lg border border-input bg-background/80 p-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-ring transition-colors font-mono"
            />
          </div>

          {error && (
            <div className="px-2.5 py-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-500 dark:text-rose-300 text-[12px]">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              size="toolbar"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              className="text-muted-foreground hover:text-foreground"
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              size="toolbar"
              disabled={isSubmitting || !ready || sameBranch}
              className="gap-1.5"
            >
              {isSubmitting ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Check className="h-3 w-3" />
              )}
              <span>{isSubmitting ? t('pr.submitting') : t('pr.createTitle')}</span>
            </Button>
          </div>
        </form>
      </div>
    </ModalSurface>
  );
};
