import type { CollaborationCheckRun } from './types';

export type CiCheckStatus = 'pending' | 'running' | 'success' | 'failed' | 'canceled' | 'skipped' | 'neutral' | 'unknown';
export interface CiCheck {
  id: string | number;
  name: string;
  status: CiCheckStatus;
  webUrl: string;
  createdAt: string;
}
/** 协作检查结论 → 展示状态；读取失败与未知结果不能显示为成功。 */
export function checkStatus(check: Pick<CollaborationCheckRun, 'status' | 'conclusion'>): CiCheckStatus {
  if (check.status !== 'completed') return check.status === 'in_progress' ? 'running' : 'pending';
  if (check.conclusion === 'success' || check.conclusion === 'neutral' || check.conclusion === 'skipped') return check.conclusion;
  if (check.conclusion === 'cancelled') return 'canceled';
  if (!check.conclusion) return 'unknown';
  return 'failed';
}
