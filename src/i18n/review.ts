/**
 * 审查视图(AI 变更审查)文案。键名采用扁平命名空间风格,与 en.ts 一一对应。
 */
export const reviewZh = {
  // AI 摘要服务层
  'review.summaryInvalid': 'AI 返回的审查摘要格式无效,请重试',
  'review.summaryTimeout': 'AI 摘要请求超时,请重试',
  // 历史整理(内联)
  'review.tidyRangeHint': '正在整理检查点之后的 {n} 个提交',
  'review.tidyRangeTooLarge': '待整理提交超过 30 个,请在历史视图中分批整理',
};

export const reviewEn = {
  // AI summary service layer
  'review.summaryInvalid': 'The AI review summary was malformed, please retry',
  'review.summaryTimeout': 'The AI summary request timed out, please retry',
  // Inline history tidy
  'review.tidyRangeHint': 'Tidying the {n} commits after the review checkpoint',
  'review.tidyRangeTooLarge': 'More than 30 commits to tidy; batch them in the history view instead',
};
