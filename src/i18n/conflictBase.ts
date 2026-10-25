/**
 * 冲突解决器三方对照（基线/我方/对方）（第一梯队功能 F3）。
 * 键名采用扁平命名空间风格，与 en.ts 一一对应。
 */
export const conflictBaseZh = {
  'conflictBase.toggle': '三方对照',
  'conflictBase.toggleTitle': '整文件三方对照：基线 / 我方 / 对方 并排显示，点击高亮区域跳转到对应冲突块',
  'conflictBase.columnBase': '基线（只读）',
  'conflictBase.columnOurs': '我方',
  'conflictBase.columnTheirs': '对方',
  'conflictBase.blockCompare': '对比三方',
  'conflictBase.blockCompareTitle': '展开该冲突块的三方对照（基线 / 我方 / 对方）',
  'conflictBase.blockCollapse': '收起对照',
  'conflictBase.blockBase': '基线',
  'conflictBase.blockOurs': '我方 · {name}',
  'conflictBase.blockTheirs': '对方 · {name}',
  'conflictBase.baseMissing': '基线版本不存在（常见于双方各自新增同一文件）',
  'conflictBase.sideMissing': '该版本暂不可用',
  'conflictBase.loading': '正在读取三方版本…',
  'conflictBase.loadFailed': '三方版本读取失败',
  'conflictBase.retry': '重试',
  'conflictBase.approxRegion': '未能精确匹配，按位置推算',
  'conflictBase.clickHint': '点击高亮区域可跳转到对应冲突块',
  'conflictBase.emptyRegion': '（此处为空）',
} as const;

export const conflictBaseEn = {
  'conflictBase.toggle': '3-way compare',
  'conflictBase.toggleTitle': 'Whole-file three-way compare: base / ours / theirs side by side. Click a highlighted region to jump to its conflict block.',
  'conflictBase.columnBase': 'Base (read-only)',
  'conflictBase.columnOurs': 'Ours',
  'conflictBase.columnTheirs': 'Theirs',
  'conflictBase.blockCompare': 'Compare sides',
  'conflictBase.blockCompareTitle': 'Expand a three-way comparison of this block (base / ours / theirs)',
  'conflictBase.blockCollapse': 'Collapse',
  'conflictBase.blockBase': 'Base',
  'conflictBase.blockOurs': 'Ours · {name}',
  'conflictBase.blockTheirs': 'Theirs · {name}',
  'conflictBase.baseMissing': 'No base version (typical for add/add conflicts)',
  'conflictBase.sideMissing': 'This version is unavailable',
  'conflictBase.loading': 'Loading the three versions…',
  'conflictBase.loadFailed': 'Failed to load the three versions',
  'conflictBase.retry': 'Retry',
  'conflictBase.approxRegion': 'No exact match; estimated by position',
  'conflictBase.clickHint': 'Click a highlighted region to jump to its conflict block',
  'conflictBase.emptyRegion': '(empty here)',
} as const;
