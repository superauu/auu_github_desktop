import { CheckCircle2, Circle, CircleDot, Loader2, MessageSquare } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { WorkingFileReviewState } from './useWorkingReviewFileList';

export function workingFileReviewLabel(state: WorkingFileReviewState, t: (key: string) => string) {
  if (state.failed) return `${t('workingReview.pending')} · ${t('workingReview.loadFailed')}`;
  if (state.kind === 'partial') return t('workingReview.listPartial').replace('{n}', String(state.approvedHunks)).replace('{total}', String(state.totalHunks));
  if (state.kind === 'issues') return t('workingReview.unresolvedCount').replace('{n}', String(state.unresolved));
  return t(state.kind === 'approved' ? 'workingReview.approved' : state.kind === 'checking' ? 'workingReview.listChecking' : 'workingReview.pending');
}

export function WorkingReviewFileStatus({ state }: { state: WorkingFileReviewState }) {
  const { t } = useI18n();
  const approved = state.kind === 'approved', issues = state.kind === 'issues', checking = state.kind === 'checking';
  const Icon = approved ? CheckCircle2 : issues ? MessageSquare : checking ? Loader2 : state.kind === 'partial' ? CircleDot : Circle;
  const label = workingFileReviewLabel(state, t);
  return <span data-working-review-state={state.kind} title={label} aria-label={label} className={`ml-1 shrink-0 inline-flex items-center gap-1 rounded px-1 py-0.5 text-[11px] whitespace-nowrap ${approved ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : issues ? 'bg-destructive/10 text-destructive' : checking ? 'text-muted-foreground' : 'bg-amber-500/8 text-amber-700 dark:text-amber-400'}`}>
    <Icon aria-hidden="true" className={`h-3 w-3 shrink-0 ${checking ? 'animate-spin' : ''}`} />
    <span>{state.kind === 'partial' ? `${state.approvedHunks}/${state.totalHunks}` : issues ? t('workingReview.listIssues').replace('{n}', String(state.unresolved)) : label}</span>
  </span>;
}
