/**
 * 外部 diff/merge 工具集成（第一梯队功能 F4）。
 * 键名采用扁平命名空间风格，与 en.ts 一一对应。
 * zh/en 键集合与 {placeholder} 占位符必须完全一致（tests/i18n-integrity.test.mjs 把关）。
 */
export const externalToolsZh = {
  // 设置区（Git 页）
  'externalTools.title': "外部对比/合并工具",
  'externalTools.description': "登记本机已安装的对比或合并工具（如 VSCode、Beyond Compare），保存后可在文件右键菜单中直接调用。配置仅保存在本机。",
  'externalTools.empty': "尚未配置外部工具",
  'externalTools.add': "新增工具",
  'externalTools.edit': "编辑",
  'externalTools.delete': "删除",
  'externalTools.deleteTitle': "删除外部工具",
  'externalTools.deleteDesc': "确定要删除 {name} 吗？",
  'externalTools.formTitle': "工具配置",
  'externalTools.name': "名称",
  'externalTools.namePlaceholder': "例如 VSCode",
  'externalTools.program': "程序完整路径",
  'externalTools.programPlaceholder': "例如 C:\\Program Files\\...\\Code.exe",
  'externalTools.args': "参数模板",
  'externalTools.argsPlaceholder': "$LOCAL $REMOTE",
  'externalTools.argsHint': "占位符：$LOCAL 本地/当前版本，$REMOTE 远端/HEAD 或 theirs，$BASE 冲突基线（可能缺省），$MERGED 冲突工作区文件。参数不经 shell、按字面传入，禁止引号与分号。",
  'externalTools.mode': "工具类型",
  'externalTools.mode.diff': "对比 (diff)",
  'externalTools.mode.merge': "合并 (merge)",
  'externalTools.save': "保存",
  'externalTools.saved': "外部工具已保存",
  'externalTools.deleted': "外部工具已删除",
  'externalTools.loadFailed': "外部工具配置加载失败",
  'externalTools.saveFailed': "外部工具保存失败",
  'externalTools.deleteFailed': "外部工具删除失败",

  // 工作区右键菜单
  'externalTools.diffWith': "用 {name} 对比",
  'externalTools.mergeWith': "用 {name} 合并",
  'externalTools.launched': "已调用外部工具",
  'externalTools.launchFailed': "外部工具启动失败",
} as const;

export const externalToolsEn = {
  // Settings section (Git tab)
  'externalTools.title': "External diff/merge tools",
  'externalTools.description': "Register locally installed diff or merge tools (VSCode, Beyond Compare, ...), then launch them from file context menus. Configuration stays on this machine.",
  'externalTools.empty': "No external tools configured",
  'externalTools.add': "Add tool",
  'externalTools.edit': "Edit",
  'externalTools.delete': "Delete",
  'externalTools.deleteTitle': "Delete external tool",
  'externalTools.deleteDesc': "Delete {name}?",
  'externalTools.formTitle': "Tool configuration",
  'externalTools.name': "Name",
  'externalTools.namePlaceholder': "e.g. VSCode",
  'externalTools.program': "Program full path",
  'externalTools.programPlaceholder': "e.g. C:\\Program Files\\...\\Code.exe",
  'externalTools.args': "Arguments template",
  'externalTools.argsPlaceholder': "$LOCAL $REMOTE",
  'externalTools.argsHint': "Placeholders: $LOCAL local/current version, $REMOTE remote/HEAD or theirs, $BASE conflict base (may be absent), $MERGED conflicted working file. Arguments are passed literally without a shell; quotes and semicolons are not allowed.",
  'externalTools.mode': "Tool type",
  'externalTools.mode.diff': "Diff",
  'externalTools.mode.merge': "Merge",
  'externalTools.save': "Save",
  'externalTools.saved': "External tool saved",
  'externalTools.deleted': "External tool deleted",
  'externalTools.loadFailed': "Failed to load external tools",
  'externalTools.saveFailed': "Failed to save external tool",
  'externalTools.deleteFailed': "Failed to delete external tool",

  // Working tree context menu
  'externalTools.diffWith': "Diff with {name}",
  'externalTools.mergeWith': "Merge with {name}",
  'externalTools.launched': "Launched external tool",
  'externalTools.launchFailed': "Failed to launch external tool",
} as const;
