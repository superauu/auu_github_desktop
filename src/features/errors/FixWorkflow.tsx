/**
 * 修复工作流区（PRD §8.1/§5.3，M4）：创建修复分支、IssueGitLink 展示（分支新鲜度/
 * 修复提交/关联 PR）、引用标记复制。挂载在 Errors 详情页。
 */
import React, { useMemo, useState } from 'react';
import { Copy, GitBranch, Plus } from 'lucide-react';
import { useErrorsStore } from '@/stores/errorsStore';
import { useRepoStore } from '@/stores/repoStore';
import { useI18n } from '@/i18n';
import { toast } from '@/stores/toastStore';
import { buildBranchName, BRANCH_NAME_TEMPLATE, buildCommitTrailer, buildPrReferenceBlock, splitBranchFreshness } from '@/services/errors/fixFlow';
import { getProviderManifest } from '@/services/integrations/registry';
import { openExternalUrl } from '@/utils/openExternal';
import type { UnifiedErrorIssue } from '@/services/errors/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ModalSurface } from '@/components/ui/ModalSurface';

const FixBranchDialog: React.FC<{
  issue: UnifiedErrorIssue;
  onDismiss: () => void;
}> = ({ issue, onDismiss }) => {
  const { t } = useI18n();
  const branches = useRepoStore((state) => state.branches);
  const createBranch = useRepoStore((state) => state.createBranch);
  const recordFixBranch = useErrorsStore((state) => state.recordFixBranch);
  const [name, setName] = useState(() =>
    buildBranchName(BRANCH_NAME_TEMPLATE, { providerId: issue.providerId, shortId: issue.shortId, issueId: issue.issueId, title: issue.title }),
  );
  const [busy, setBusy] = useState(false);

  const currentBranch = branches.find((branch) => branch.isCurrent && !branch.isRemote)?.name ?? '';
  const defaultRemote = branches.find((branch) => branch.isRemote && (branch.name === 'origin/main' || branch.name === 'origin/master'))?.name ?? '';
  const [base, setBase] = useState('');

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      await createBranch(trimmed, base || undefined, true);
      recordFixBranch(
        {
          connectionId: issue.connectionId,
          providerId: issue.providerId,
          externalProjectId: issue.externalProjectId,
          issueId: issue.issueId,
          shortId: issue.shortId,
          externalUrl: issue.externalUrl,
        },
        trimmed,
      );
      toast.success(t('errors.fix.created'), trimmed);
      onDismiss();
    } catch (error) {
      toast.error(t('errors.fix.createFailed'), String(error instanceof Error ? error.message : error));
      setBusy(false);
    }
  };

  return (
    <ModalSurface
      label={t('errors.fix.dialogTitle')}
      onDismiss={onDismiss}
      className="fixed inset-0 z-50 bg-background/80 backdrop-blur-xs flex items-center justify-center animate-in fade-in-0"
    >
      <div
        className="w-[420px] rounded-xl border border-border bg-card shadow-2xl p-4 space-y-2 animate-in zoom-in-95"
        onClick={(event) => event.stopPropagation()}
        data-testid="errors-fix-branch-dialog"
      >
        <span className="text-xs font-semibold">{t('errors.fix.dialogTitle')}</span>
        <label className="block space-y-1">
          <span className="text-[12px] font-medium">{t('errors.fix.branchName')}</span>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-label={t('errors.fix.branchName')}
            className="font-mono text-xs"
            autoFocus
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[12px] font-medium">{t('errors.fix.base')}</span>
          <select
            value={base}
            onChange={(event) => setBase(event.target.value)}
            aria-label={t('errors.fix.base')}
            className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs"
          >
            <option value="" className="bg-popover text-foreground">
              {t('errors.fix.base.current')}（{currentBranch}）
            </option>
            {defaultRemote && (
              <option value={defaultRemote} className="bg-popover text-foreground">
                {t('errors.fix.base.default')}（{defaultRemote}）
              </option>
            )}
          </select>
        </label>
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button variant="ghost" size="xs" onClick={onDismiss} disabled={busy}>{t('common.cancel')}</Button>
          <Button variant="outline" size="xs" onClick={() => void submit()} disabled={busy || !name.trim()} className="gap-1">
            <GitBranch className="h-3 w-3" />
            <span>{busy ? t('errors.fix.creating') : t('errors.fix.createBranch')}</span>
          </Button>
        </div>
      </div>
    </ModalSurface>
  );
};

export const FixWorkflowSection: React.FC<{ issue: UnifiedErrorIssue }> = ({ issue }) => {
  const { t } = useI18n();
  const currentRepo = useRepoStore((state) => state.currentRepo);
  const branches = useRepoStore((state) => state.branches);
  const checkoutBranch = useRepoStore((state) => state.checkoutBranch);
  const linksByRepo = useErrorsStore((state) => state.linksByRepo);
  const activeRepoKey = useErrorsStore((state) => state.activeRepoKey);
  const activeRepoPath = useErrorsStore((state) => state.activeRepoPath);
  const [dialogOpen, setDialogOpen] = useState(false);

  const link = activeRepoKey
    ? (linksByRepo[activeRepoKey] ?? []).find((item) => item.connectionId === issue.connectionId && item.issueId === issue.issueId) ?? null
    : null;
  const sameRepo = Boolean(currentRepo && activeRepoPath === currentRepo.path);
  const localNames = useMemo(() => branches.filter((branch) => !branch.isRemote).map((branch) => branch.name), [branches]);
  const freshness = useMemo(
    () => (link ? splitBranchFreshness(link.branchNames, localNames) : { active: [], stale: [] }),
    [link, localNames],
  );

  const shortId = issue.shortId || issue.issueId.split('/').pop() || issue.issueId;
  const providerName = getProviderManifest(issue.providerId)?.name ?? issue.providerId;
  const trailer = buildCommitTrailer(issue.providerId, shortId);
  const prBlock = buildPrReferenceBlock({ providerName, shortId, externalUrl: issue.externalUrl });

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t('errors.fix.copied'));
    } catch {
      toast.error(text);
    }
  };

  return (
    <section className="space-y-2 rounded-lg border border-border p-2.5" data-testid="errors-fix-workflow">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('errors.fix.section')}</h3>
        {sameRepo && (
          <Button variant="outline" size="xs" className="gap-1" onClick={() => setDialogOpen(true)}>
            <Plus className="h-3 w-3" />
            <span>{t('errors.fix.createBranch')}</span>
          </Button>
        )}
      </div>

      {link && (
        <div className="space-y-2 text-[12px]">
          {(freshness.active.length > 0 || freshness.stale.length > 0) && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-muted-foreground">{t('errors.fix.linkedBranches')}</span>
              {freshness.active.map((name) => (
                <Badge key={name} variant="outline" className="h-4 gap-0.5 px-1 text-[10px] font-mono">
                  <GitBranch className="h-2.5 w-2.5" />
                  {name}
                  {sameRepo && name !== currentRepo?.currentBranch && (
                    <button
                      className="ml-0.5 text-primary hover:underline"
                      onClick={() => void checkoutBranch(name)}
                      aria-label={`${t('errors.fix.checkout')}: ${name}`}
                    >
                      {t('errors.fix.checkout')}
                    </button>
                  )}
                </Badge>
              ))}
              {freshness.stale.map((name) => (
                <Badge key={name} variant="outline" className="h-4 px-1 text-[10px] font-mono text-muted-foreground line-through" title={t('errors.fix.staleBranch')}>
                  {name}
                </Badge>
              ))}
            </div>
          )}
          {link.commitShas.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-muted-foreground">{t('errors.fix.commits')}</span>
              {link.commitShas.slice(-5).map((sha) => (
                <span key={sha} className="rounded bg-accent/40 px-1 py-0.5 font-mono text-[11px] select-text">{sha.slice(0, 10)}</span>
              ))}
            </div>
          )}
          {link.pullRequests.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-muted-foreground">{t('errors.fix.pullRequests')}</span>
              {link.pullRequests.map((pr) => (
                <button
                  key={pr.url}
                  className="text-primary hover:underline"
                  aria-label={`${t('errors.fix.pullRequests')} #${pr.number}`}
                  onClick={() => void openExternalUrl(pr.url)}
                >
                  #{pr.number}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="space-y-1">
        <span className="text-[12px] text-muted-foreground">{t('errors.fix.reference')}</span>
        <div className="flex items-center gap-1.5">
          <code className="min-w-0 flex-1 truncate rounded bg-accent/40 px-1.5 py-1 font-mono text-[11px] select-text">{trailer}</code>
          <Button variant="ghost" size="icon-xs" aria-label={t('errors.fix.copyTrailer')} onClick={() => void copy(trailer)}>
            <Copy className="h-3 w-3" />
          </Button>
        </div>
        <div className="flex items-center gap-1.5">
          <code className="min-w-0 flex-1 truncate rounded bg-accent/40 px-1.5 py-1 font-mono text-[11px] select-text">
            {t('errors.fix.prBlockLabel')}
          </code>
          <Button variant="ghost" size="icon-xs" aria-label={t('errors.fix.copyPrBlock')} onClick={() => void copy(prBlock)}>
            <Copy className="h-3 w-3" />
          </Button>
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">{t('errors.fix.hint')}</p>
      </div>

      {dialogOpen && <FixBranchDialog issue={issue} onDismiss={() => setDialogOpen(false)} />}
    </section>
  );
};
