import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { BatchCaptureProgress } from '@/services/git/CommitBatchService';

export interface PlanningTiming { startedAt: number; collectedAt?: number; finishedAt?: number }

export function CommitPlanningProgress({ phase, progress, timing }: {
  phase: string; progress: BatchCaptureProgress; timing: PlanningTiming | null;
}) {
  const { t } = useI18n();
  const [now, setNow] = useState(Date.now);
  const running = phase === 'collecting' || phase === 'analyzing';
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [running, timing?.startedAt]);
  if (!timing || (!running && timing.collectedAt === undefined)) return null;
  const end = timing.finishedAt ?? Math.max(now, timing.collectedAt ?? timing.startedAt);
  const collectingMs = (timing.collectedAt ?? end) - timing.startedAt;
  const aiMs = timing.collectedAt === undefined ? null : Math.max(0, end - timing.collectedAt);
  const seconds = (milliseconds: number) => (Math.max(0, milliseconds) / 1000).toFixed(1);
  const label = phase === 'analyzing' ? t('batch.analyzing') : t(progress.stage === 'waiting' ? 'batch.waiting' : progress.stage === 'checking' ? 'batch.checking' : 'batch.collecting');
  return <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
    {running && <p role="status" className="flex items-center gap-2 text-sm">
      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
      <span className="flex-1">{label}</span>
      <span aria-hidden="true" className="shrink-0 text-xs text-muted-foreground tabular-nums">{seconds(phase === 'analyzing' ? aiMs ?? 0 : collectingMs)}s</span>
    </p>}
    {phase === 'collecting' && progress.stage === 'reading' && progress.total > 0 && <div className="space-y-1">
      <progress className="h-1 w-full accent-primary" value={progress.completed} max={progress.total} aria-label={t('batch.fileProgress')} />
      <p className="text-xs text-muted-foreground">{t('batch.fileProgress')} {progress.completed} / {progress.total}</p>
    </div>}
    {timing.collectedAt !== undefined && <p className="text-xs text-muted-foreground tabular-nums">
      {t('batch.collectDuration').replace('{seconds}', seconds(collectingMs))}
      {timing.finishedAt !== undefined && aiMs !== null && <> · {t('batch.aiDuration').replace('{seconds}', seconds(aiMs))}</>}
    </p>}
    {phase === 'analyzing' && (aiMs ?? 0) >= 10000 && <p className="text-xs text-muted-foreground">{t('batch.waitingAi')}</p>}
  </div>;
}
