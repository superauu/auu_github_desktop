/**
 * 多账号 Profile 管理（第二梯队功能）。
 * 键名采用扁平命名空间风格，与 en.ts 一一对应。
 */
export const profilesZh = {
  'profiles.menuTitle': 'GitHub 账号',
  'profiles.accountMenuLabel': '切换 GitHub 账号',
  'profiles.addAccount': '添加账号',
  'profiles.manage': '管理账号…',
  'profiles.addingHint': '正在添加新账号，登录成功后凭据将保存在新账号下；取消则返回原账号',
  'profiles.defaultLabel': '账号 {n}',
  'profiles.addCancelled': '已取消添加新账号，已返回原账号',
  'profiles.switchedTo': '已切换到 {label}',
} as const;

export const profilesEn = {
  'profiles.menuTitle': 'GitHub accounts',
  'profiles.accountMenuLabel': 'Switch GitHub account',
  'profiles.addAccount': 'Add account',
  'profiles.manage': 'Manage accounts…',
  'profiles.addingHint': 'Adding a new account: credentials will be stored under it once you sign in; cancelling returns to the previous account',
  'profiles.defaultLabel': 'Account {n}',
  'profiles.addCancelled': 'New account sign-in cancelled, returned to the previous account',
  'profiles.switchedTo': 'Switched to {label}',
} as const;
