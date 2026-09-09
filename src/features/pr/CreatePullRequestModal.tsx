import React, { useState, useEffect } from 'react';
import { GitPullRequest, X, Loader2, Check, Sparkles } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useRepoStore } from '@/stores/repoStore';
import { useGitHubStore } from '@/stores/githubStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { githubService } from '@/services/github/GitHubService';
import { aiCommitService } from '@/services/ai/AiCommitService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/stores/toastStore';

interface CreatePullRequestModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const CreatePullRequestModal: React.FC<CreatePullRequestModalProps> = ({
  open,
  onOpenChange,
}) => {
  const { currentRepo, branches, commits, status } = useRepoStore();
  const { currentOwner, currentRepoName, loadPullRequests, selectPR } = useGitHubStore();
  const { aiConfig } = useSettingsStore();
  const { t } = useI18n();

  const currentBranch =
    branches.find((b) => b.isCurrent)?.name ||
    status?.currentBranch ||
    currentRepo?.currentBranch ||
    'main';

  const [headBranch, setHeadBranch] = useState(currentBranch);
  const [baseBranch, setBaseBranch] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingBase, setLoadingBase] = useState(false);
  const [isGeneratingDesc, setIsGeneratingDesc] = useState(false);

  // 每次打开时重置：源分支默认当前分支，标题预填最新提交主题，异步取仓库默认分支作为目标
  useEffect(() => {
    if (!open) return;
    setHeadBranch(currentBranch);
    setTitle(commits[0]?.subject || '');
    setBody(commits[0]?.body || '');
    setError(null);
    if (currentOwner && currentRepoName) {
      setLoadingBase(true);
      githubService
        .getRepositoryDefaultBranch(currentOwner, currentRepoName)
        .then((def) => setBaseBranch((prev) => prev || def))
        .catch(() => {
          // 未登录/网络受限时取不到默认分支：优先 master，其次列表第一个远程分支
          setBaseBranch((prev) => {
            if (prev) return prev;
            const candidates = Array.from(
              new Set(
                branches
                  .filter((b) => b.isRemote)
                  .map((b) => b.name.replace(/^origin\//, ''))
                  .filter((n) => n && n !== 'HEAD')
              )
            );
            return candidates.includes('master') ? 'master' : candidates[0] || 'main';
          });
        })
        .finally(() => setLoadingBase(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  // 目标分支可选远程分支（去掉 origin/ 前缀并过滤 HEAD 别名）；源分支可选本地分支
  const localBranchNames = branches.filter((b) => !b.isRemote).map((b) => b.name);
  const remoteBranchNames = Array.from(
    new Set(
      branches
        .filter((b) => b.isRemote)
        .map((b) => b.name.replace(/^origin\//, ''))
        .filter((n) => n && n !== 'HEAD')
    )
  );

  const handleGenerateDesc = async () => {
    if (!currentRepo || !headBranch || !baseBranch) return;
    setIsGeneratingDesc(true);
    try {
      const generated = await aiCommitService.generatePRDescription({
        repoPath: currentRepo.path,
        base: baseBranch,
        head: headBranch,
        aiConfig,
      });
      setBody(generated);
      if (!aiConfig.apiKey || !aiConfig.apiKey.trim()) {
        toast.info(t('pr.aiFallbackUsed'));
      }
    } catch (err: any) {
      toast.error(t('pr.aiGenerateFailed'), err?.message);
    } finally {
      setIsGeneratingDesc(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOwner || !currentRepoName) {
      setError(t('pr.needLogin'));
      return;
    }
    if (!title.trim()) {
      setError(t('pr.titleEmpty'));
      return;
    }
    if (!headBranch || !baseBranch) {
      setError(t('pr.branchMissing'));
      return;
    }
    if (headBranch === baseBranch) {
      setError(t('pr.sameBranch'));
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const created = await githubService.createPullRequest(currentOwner, currentRepoName, {
        title: title.trim(),
        head: headBranch,
        base: baseBranch,
        body: body.trim(),
      });
      toast.success(
        t('pr.created').replace('{n}', String(created.number)),
        created.html_url
      );
      await loadPullRequests();
      // 列表刷新后选中新 PR
      const fresh = useGitHubStore.getState().pullRequests.find((p) => p.number === created.number);
      if (fresh) selectPR(fresh);
      onOpenChange(false);
    } catch (err: any) {
      const msg: string = err?.message || t('pr.createFailed');
      // GitHub 对“两分支无差异”返回 422 Validation Failed，给出可读提示
      if (/validation|no commits|422/i.test(msg)) {
        setError(t('pr.noCommitsDiff'));
      } else {
        setError(msg);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in-0 select-none"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-border bg-card shadow-2xl p-5 space-y-4 animate-in zoom-in-95"
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
              <div className="text-[10px] text-muted-foreground">
                {currentOwner}/{currentRepoName || t('pr.noRepoBound')}
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => onOpenChange(false)}
            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* Branch flow: head → base */}
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 block">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                {t('pr.sourceBranch')}
              </span>
              <select
                value={headBranch}
                onChange={(e) => setHeadBranch(e.target.value)}
                className="w-full h-8 rounded-lg border border-input bg-background/80 px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {localBranchNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 block">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                {t('pr.targetBranch')}
              </span>
              <select
                value={baseBranch}
                onChange={(e) => setBaseBranch(e.target.value)}
                disabled={loadingBase}
                className="w-full h-8 rounded-lg border border-input bg-background/80 px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
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

          {/* Title */}
          <label className="space-y-1 block">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
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
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                {t('pr.descLabel')}
              </span>
              <Button
                variant="outline"
                size="xs"
                onClick={handleGenerateDesc}
                disabled={isGeneratingDesc || !headBranch || !baseBranch || headBranch === baseBranch}
                className="h-5 px-1.5 text-[10px] gap-1 border-sky-500/40 text-sky-300 hover:bg-sky-500/15"
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
              className="w-full resize-none rounded-lg border border-input bg-background/80 p-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-colors font-mono"
            />
          </div>

          {error && (
            <div className="px-2.5 py-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-500 dark:text-rose-300 text-[11px]">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => onOpenChange(false)}
              className="h-7 text-xs text-muted-foreground hover:text-foreground"
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              size="xs"
              disabled={isSubmitting || loadingBase}
              className="h-7 text-xs gap-1.5 btn-neon dark:btn-neon"
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
    </div>
  );
};
