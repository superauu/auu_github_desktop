/**
 * 每提交仓库快照文件树（第一梯队功能 F1）。
 * 键名采用扁平命名空间风格，与 en.ts 一一对应。
 */
export const fileTreeZh = {
  // 弹窗模式切换
  'fileTree.modeChanges': '变更文件',
  'fileTree.modeSnapshot': '仓库快照',
  'fileTree.backToOriginal': '返回原文件差异',
  // 快照树
  'fileTree.snapshotLoading': '正在加载仓库快照…',
  'fileTree.snapshotEmpty': '该提交的仓库快照为空',
  'fileTree.snapshotError': '加载仓库快照失败：{m}',
  'fileTree.retry': '重试',
  'fileTree.filterPlaceholder': '按路径筛选…',
  'fileTree.noMatch': '没有匹配的文件',
  'fileTree.entryCount': '{count} 个条目',
  'fileTree.treeViewLabel': '快照文件树',
  'fileTree.changedInCommit': '本次提交已变更',
  // 内容查看器
  'fileTree.selectFileHint': '从左侧选择文件，查看该提交时点的内容',
  'fileTree.contentViewLabel': '快照文件内容',
  'fileTree.contentLoading': '正在加载文件内容…',
  'fileTree.contentError': '读取文件内容失败：{m}',
  'fileTree.emptyFile': '（空文件）',
  'fileTree.lineCount': '{count} 行',
  'fileTree.binaryFile': '二进制文件，无法预览内容',
  'fileTree.tooLargeFile': '文件大小 {size}，超过预览上限 {limit}',
  'fileTree.submodule': '子模块引用，内容保存在其自身仓库中',
  'fileTree.viewDiff': '查看本次提交的差异',
} as const;

export const fileTreeEn = {
  // Dialog mode switch
  'fileTree.modeChanges': 'Changed files',
  'fileTree.modeSnapshot': 'Repository snapshot',
  'fileTree.backToOriginal': 'Back to the original file diff',
  // Snapshot tree
  'fileTree.snapshotLoading': 'Loading repository snapshot…',
  'fileTree.snapshotEmpty': 'This commit has an empty repository snapshot',
  'fileTree.snapshotError': 'Failed to load repository snapshot: {m}',
  'fileTree.retry': 'Retry',
  'fileTree.filterPlaceholder': 'Filter by path…',
  'fileTree.noMatch': 'No matching files',
  'fileTree.entryCount': '{count} entries',
  'fileTree.treeViewLabel': 'Snapshot file tree',
  'fileTree.changedInCommit': 'Changed in this commit',
  // Content viewer
  'fileTree.selectFileHint': 'Pick a file on the left to view its content at this commit',
  'fileTree.contentViewLabel': 'Snapshot file content',
  'fileTree.contentLoading': 'Loading file content…',
  'fileTree.contentError': 'Failed to read file content: {m}',
  'fileTree.emptyFile': '(empty file)',
  'fileTree.lineCount': '{count} lines',
  'fileTree.binaryFile': 'Binary file; its content cannot be previewed',
  'fileTree.tooLargeFile': 'File is {size}, above the {limit} preview limit',
  'fileTree.submodule': 'Submodule reference; its content lives in its own repository',
  'fileTree.viewDiff': 'View diff in this commit',
} as const;
