import React, { useEffect, useState } from 'react';
import { ModalSurface } from '@/components/ui/ModalSurface';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/i18n';
import { useForgeStore } from '@/stores/forgeStore';
import type { ForgePipeline, ForgePipelineStatus, ForgePullRequest, ForgePullRequestDetail } from '@/services/forge/types';
import { X, Loader2, ExternalLink } from 'lucide-react';

const PIPELINE_VARIANTS: Record<ForgePipelineStatus, { variant: 'info' | 'success' | 'destructive' | 'outline' | 'warning'; key: string }> = {
  running: { variant: 'info', key: 'forge.pipeline.running' },
  success: { variant: 'success', key: 'forge.pipeline.success' },
  failed: { variant: 'destructive', key: 'forge.pipeline.failed' },
  canceled: { variant: 'outline', key: 'forge.pipeline.canceled' },
  pending: { variant: 'warning', key: 'forge.pipeline.pending' },
};

/** MR 详情：描述 + 评论时间线 + 源分支流水线状态。 */
export const ForgePullDetailDialog: React.FC<{ pull: ForgePullRequest; onClose: () => void }> = ({ pull, onClose }) => {
  const { t } = useI18n();
  const loadDetail = useForgeStore((state) => state.loadDetail);
  const loadPipelines = useForgeStore((state) => state.loadPipelines);
  const pipelines = useForgeStore((state) => state.pipelines);
  const pipelinesLoading = useForgeStore((state) => state.pipelinesLoading);
  const [detail, setDetail] = useState<ForgePullRequestDetail | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    loadDetail(pull.number)
      .then((result) => { if (alive) setDetail(result); })
      .catch((cause: unknown) => { if (alive) setError(cause instanceof Error ? cause.message : String(cause)); });
    loadPipelines(pull.sourceBranch).catch(() => {});
    return () => { alive = false; };
  }, [pull.number, pull.sourceBranch, loadDetail, loadPipelines]);

  return (
    <ModalSurface
      onDismiss={onClose}
      dismissible
      label={t('forge.title')}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs animate-in fade-in-0 select-none"
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] rounded-xl border border-border bg-card shadow-2xl flex flex-col animate-in zoom-in-95"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between px-5 pt-4 pb-2 border-b border-border gap-2">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-foreground truncate">
              <span className="font-mono text-muted-foreground mr-1">!{pull.number}</span>
              {pull.title}
            </h2>
            <p className="text-[12px] text-muted-foreground mt-0.5 font-mono truncate">
              {pull.sourceBranch} → {pull.targetBranch} · {pull.author}
            </p>
          </div>
          <button type="button" className="text-muted-foreground hover:text-foreground transition-colors shrink-0" aria-label="close" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 px-5 py-1.5 border-b border-border">
          {pull.webUrl && (
            <Button variant="ghost" size="xs" onClick={() => void window.open(pull.webUrl, '_blank', 'noopener')}>
              <ExternalLink className="h-3 w-3" />
              <span>{t('forge.detail.openInBrowser')}</span>
            </Button>
          )}
          <span className="flex-1" />
          {error && <span className="text-[11px] text-git-deleted truncate max-w-60" title={error}>{error}</span>}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-3 space-y-4">
          <section className="space-y-1.5">
            <h3 className="text-[12px] font-semibold text-foreground">{t('forge.detail.description')}</h3>
            <pre className="rounded border border-border bg-accent/10 px-3 py-2 text-[12px] text-muted-foreground whitespace-pre-wrap wrap-break-word max-h-48 overflow-y-auto">
              {detail?.description || '—'}
            </pre>
          </section>

          <section className="space-y-1.5">
            <h3 className="text-[12px] font-semibold text-foreground">{t('forge.detail.comments')}</h3>
            {!detail || detail.comments.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">{detail ? t('forge.detail.commentsEmpty') : '…'}</p>
            ) : (
              <ul className="space-y-1.5">
                {detail.comments.map((comment) => (
                  <li key={comment.id} className="rounded border border-border bg-accent/10 px-3 py-2">
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="font-mono">{comment.author}</span>
                      <span>{new Date(comment.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="text-[12px] text-foreground whitespace-pre-wrap wrap-break-word mt-1">{comment.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-1.5">
            <div className="flex items-center gap-2">
              <h3 className="text-[12px] font-semibold text-foreground">{t('forge.detail.pipelines')}</h3>
              {pipelinesLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
            </div>
            {pipelines.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">{t('forge.detail.pipelinesEmpty')}</p>
            ) : (
              <ul className="space-y-1">
                {pipelines.map((pipeline: ForgePipeline) => {
                  const meta = PIPELINE_VARIANTS[pipeline.status];
                  return (
                    <li key={`${pipeline.id}`} className="rounded border border-border bg-accent/10 px-3 py-1.5 flex items-center gap-2">
                      <Badge variant={meta.variant} className="text-[10px] shrink-0">{t(meta.key)}</Badge>
                      <span className="font-mono text-[12px] text-foreground truncate flex-1" title={pipeline.name}>{pipeline.name || `#${pipeline.id}`}</span>
                      {pipeline.webUrl && (
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-primary transition-colors shrink-0"
                          aria-label="pipeline-link"
                          onClick={() => void window.open(pipeline.webUrl, '_blank', 'noopener')}
                        >
                          <ExternalLink className="h-3 w-3" />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </ModalSurface>
  );
};
