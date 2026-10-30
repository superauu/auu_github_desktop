export const diffHunkZh = {
  'diffHunk.old': '原 {lines} 行', 'diffHunk.new': '新 {lines} 行',
  'diffHunk.oldEmpty': '原文件无内容', 'diffHunk.newEmpty': '新文件无内容',
  'diffHunk.oldAfter': '原第 {n} 行后', 'diffHunk.newAfter': '新第 {n} 行后',
  'diffHunk.details': '代码块信息', 'diffHunk.inspect': '查看代码块信息：{range}',
  'diffHunk.added': '新增 {n} 行', 'diffHunk.removed': '删除 {n} 行',
  'diffHunk.explanation': '行号范围包含未修改的上下文；新增和删除数量按该块实际变更的行统计。',
  'diffHunk.context': '附近上下文（Git 自动提取）', 'diffHunk.original': 'Git 原始标记',
  'diffHunk.copy': '复制原始标记', 'diffHunk.copied': '原始标记已复制',
  'diffHunk.copyFailed': '复制失败，请选中上方原始标记手动复制。',
} as const;
export const diffHunkEn: Record<keyof typeof diffHunkZh, string> = {
  'diffHunk.old': 'Old lines {lines}', 'diffHunk.new': 'New lines {lines}',
  'diffHunk.oldEmpty': 'No original content', 'diffHunk.newEmpty': 'No new content',
  'diffHunk.oldAfter': 'After old line {n}', 'diffHunk.newAfter': 'After new line {n}',
  'diffHunk.details': 'Hunk information', 'diffHunk.inspect': 'Inspect hunk: {range}',
  'diffHunk.added': '{n} lines added', 'diffHunk.removed': '{n} lines removed',
  'diffHunk.explanation': 'Line ranges include unchanged context. Added and removed counts reflect the actual changed lines in this hunk.',
  'diffHunk.context': 'Nearby context (extracted by Git)', 'diffHunk.original': 'Original Git header',
  'diffHunk.copy': 'Copy original header', 'diffHunk.copied': 'Original header copied',
  'diffHunk.copyFailed': 'Could not copy. Select the original header above and copy it manually.',
};
