/**
 * 系统通知（CI 完成提醒）（第二梯队功能）。
 * 键名采用扁平命名空间风格，与 en.ts 一一对应。
 *
 * 文案消费方：src/services/notifications/NotificationService.ts
 * - ciSuccess/ciFailure Desc 的 {repo} = owner/repo，{summary} = 短 sha + 检查统计
 *   （统计部分由 ciSummaryPassed / ciSummaryFailedNames / ciSummaryMore 拼装）。
 */
export const notificationsZh = {
  'notifications.ciSuccessTitle': 'CI 检查全部通过',
  'notifications.ciSuccessDesc': '仓库 {repo} 的监听检查已完成：{summary}',
  'notifications.ciFailureTitle': 'CI 检查失败',
  'notifications.ciFailureDesc': '仓库 {repo} 的监听检查未全部通过：{summary}',
  'notifications.ciSummaryPassed': '通过 {passed}/{total}',
  'notifications.ciSummaryFailedNames': '失败：{names}',
  'notifications.ciSummaryMore': '其余 {count} 项',
} as const;

export const notificationsEn = {
  'notifications.ciSuccessTitle': 'All CI checks passed',
  'notifications.ciSuccessDesc': 'Watched checks finished for {repo}: {summary}',
  'notifications.ciFailureTitle': 'CI checks failed',
  'notifications.ciFailureDesc': 'Not all watched checks passed for {repo}: {summary}',
  'notifications.ciSummaryPassed': 'passed {passed}/{total}',
  'notifications.ciSummaryFailedNames': 'failed: {names}',
  'notifications.ciSummaryMore': '{count} more',
} as const;
