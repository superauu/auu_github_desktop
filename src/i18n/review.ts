/**
 * 审查视图(AI 变更审查)文案。键名采用扁平命名空间风格,与 en.ts 一一对应。
 */
export const reviewZh = {
  // 导航与头部
  'review.title': '审查',
  'review.since': '自 {hash} 以来',
  'review.baseCurrent': '检查点:{hash}',
  'review.pendingCount': '{n} 个待审提交',
  'review.pendingTitle': '待审提交',
  'review.netChanges': '净变更',
  'review.statsFiles': '{n} 个文件',
  // 风险徽标
  'review.riskSecret': '疑似密钥',
  'review.riskEnv': '环境变量文件',
  'review.riskMassDeletion': '大量删除',
  'review.riskDependency': '依赖变更',
  'review.riskCi': 'CI 配置',
  'review.riskBinary': '二进制文件',
  // 动作
  'review.markReviewed': '标记已审查',
  'review.markReviewedDone': '已标记为已审查',
  'review.markReviewedDoneDesc': '检查点已推进到当前 HEAD',
  'review.markUndo': '撤销',
  'review.markUndone': '已恢复之前的检查点',
  'review.markFailed': '标记失败',
  'review.baseFailed': '设置检查点失败',
  'review.tidy': '整理提交',
  'review.linearWarn': '包含合并提交,历史整理不可用',
  'review.truncatedWarn': '提交较多,仅显示前 {n} 个',
  // 基准引导
  'review.bootstrapTitle': '建立审查基准',
  'review.bootstrapDesc': '审查视图展示检查点之后的提交:AI 产出的改动会聚合一处,标注风险,处理完可一键标记为已审查。',
  'review.baseUpstream': '跟踪分支的远程位置',
  'review.baseUpstreamNone': '当前分支没有跟踪分支',
  'review.baseRecent': '最近提交之前',
  'review.basePick': '从历史中选择提交',
  'review.basePickPlaceholder': '选择一个提交作为基准…',
  'review.bootstrapApply': '设为基准',
  // 检查点失效
  'review.staleTitle': '检查点已不在当前分支历史上',
  'review.staleDesc': '可能发生过变基或强制推送。请重建基准或重新选择起点。',
  'review.staleRebuild': '重建为当前 HEAD',
  'review.stalePick': '重新选择基准',
  // 空态与提示
  'review.emptyTitle': '没有待审查的提交',
  'review.emptyDesc': '检查点之后没有新提交;AI 产生新提交后这里会汇总展示。',
  'review.pickFile': '从上方选择文件查看差异',
  'review.emptyDiff': '该文件没有文本差异(可能是二进制或纯移动)',
  'review.files': '文件',
  // AI 摘要
  'review.aiSummary': 'AI 总结',
  'review.aiOverview': '这段时间的变更',
  'review.aiBadge': 'AI 参与',
  // 历史整理(内联)
  'review.tidyRangeHint': '正在整理检查点之后的 {n} 个提交',
  'review.tidyRangeTooLarge': '待整理提交超过 30 个,请在历史视图中分批整理',
  // 推送提醒
  'review.pushReminderTitle': '推送成功,还有未标记审查的提交',
  'review.pushReminderDesc': '可以在审查视图中检查这批改动,或直接标记为已审查。',
  // AI 摘要服务层
  'review.summaryInvalid': 'AI 返回的审查摘要格式无效,请重试',
  'review.summaryTimeout': 'AI 摘要请求超时,请重试',
};

export const reviewEn = {
  // Navigation & header
  'review.title': 'Review',
  'review.since': 'Since {hash}',
  'review.baseCurrent': 'Checkpoint: {hash}',
  'review.pendingCount': '{n} commits to review',
  'review.pendingTitle': 'To review',
  'review.netChanges': 'Net changes',
  'review.statsFiles': '{n} files',
  // Risk badges
  'review.riskSecret': 'Possible secrets',
  'review.riskEnv': 'Env files',
  'review.riskMassDeletion': 'Heavy deletions',
  'review.riskDependency': 'Dependency changes',
  'review.riskCi': 'CI config',
  'review.riskBinary': 'Binary files',
  // Actions
  'review.markReviewed': 'Mark reviewed',
  'review.markReviewedDone': 'Marked as reviewed',
  'review.markReviewedDoneDesc': 'The checkpoint moved to the current HEAD',
  'review.markUndo': 'Undo',
  'review.markUndone': 'The previous checkpoint was restored',
  'review.markFailed': 'Failed to mark as reviewed',
  'review.baseFailed': 'Failed to set the checkpoint',
  'review.tidy': 'Tidy commits',
  'review.linearWarn': 'Contains merge commits; history tidy is unavailable',
  'review.truncatedWarn': 'Many commits; showing the first {n}',
  // Baseline bootstrap
  'review.bootstrapTitle': 'Set a review baseline',
  'review.bootstrapDesc': 'The review view shows commits after your checkpoint: AI-produced changes are aggregated here with risk flags, and finished work can be marked as reviewed.',
  'review.baseUpstream': 'Remote position of the tracking branch',
  'review.baseUpstreamNone': 'This branch has no tracking branch',
  'review.baseRecent': 'Before recent commits',
  'review.basePick': 'Pick a commit from history',
  'review.basePickPlaceholder': 'Choose a commit as the baseline…',
  'review.bootstrapApply': 'Set baseline',
  // Stale checkpoint
  'review.staleTitle': 'The checkpoint is no longer on this branch history',
  'review.staleDesc': 'A rebase or force push may have happened. Rebuild the baseline or pick a new starting point.',
  'review.staleRebuild': 'Rebuild at current HEAD',
  'review.stalePick': 'Pick another baseline',
  // Empty states & hints
  'review.emptyTitle': 'Nothing to review',
  'review.emptyDesc': 'No new commits after the checkpoint; new AI commits will show up here.',
  'review.pickFile': 'Select a file above to view its diff',
  'review.emptyDiff': 'No text diff for this file (binary or pure move)',
  'review.files': 'Files',
  // AI summary
  'review.aiSummary': 'AI summary',
  'review.aiOverview': 'What changed in this range',
  'review.aiBadge': 'AI involved',
  // Inline history tidy
  'review.tidyRangeHint': 'Tidying the {n} commits after the review checkpoint',
  'review.tidyRangeTooLarge': 'More than 30 commits to tidy; batch them in the history view instead',
  // Push reminder
  'review.pushReminderTitle': 'Pushed; unreviewed commits remain',
  'review.pushReminderDesc': 'Check this batch in the review view, or mark it as reviewed.',
  // AI summary service layer
  'review.summaryInvalid': 'The AI review summary was malformed, please retry',
  'review.summaryTimeout': 'The AI summary request timed out, please retry',
};
