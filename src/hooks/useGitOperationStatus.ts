import { useEffect, useState } from 'react';
import { useI18n } from '@/i18n';
import { useGitWriteActivity } from './useGitActivity';

export function useGitOperationStatus(repoPath: string) {
  const activity = useGitWriteActivity(repoPath);
  const { t } = useI18n();
  const [now, setNow] = useState(Date.now);
  const startedAt = activity?.phaseStartedAt ?? activity?.startedAt;
  useEffect(() => {
    if (startedAt == null) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);
  const elapsed = startedAt != null ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
  const operation = activity ? t(`activity.command.${activity.command}`) : '';
  const operationLabel = operation.startsWith('activity.command.') ? t('changes.processing') : operation;
  const waitHint = elapsed >= 15 && activity?.command === 'commit' ? t('activity.commitHint')
    : elapsed >= 15 && activity?.command === 'push' ? t('activity.pushHint') : '';
  return { activity, elapsed, operationLabel, waitHint };
}
