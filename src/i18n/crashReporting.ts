// 崩溃报告（严格 opt-in）设置文案。
export const crashReportingZh = {
  'crashReports.setting': '崩溃报告',
  'crashReports.settingDesc': '默认关闭。开启后，应用出错时仅上传错误堆栈、应用版本与系统类型（本地路径已替换为占位符），不包含仓库内容或个人信息；可随时在此关闭。',
} as const;

export type CrashReportingKeys = keyof typeof crashReportingZh;

export const crashReportingEn: Record<CrashReportingKeys, string> = {
  'crashReports.setting': 'Crash reports',
  'crashReports.settingDesc': 'Off by default. When enabled, crashes upload only the error stack, app version, and OS type (local paths are replaced), never repository contents or personal data. You can turn this off here at any time.',
};
