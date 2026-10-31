// 崩溃报告（严格 opt-in）设置文案。
export const crashReportingZh = {
  'crashReports.setting': '崩溃报告',
  'crashReports.settingDesc': '默认关闭。开启后，应用出错时仅上传错误堆栈、应用版本与系统类型（本地路径已替换为占位符），不包含仓库内容或个人信息；可随时在此关闭。',
  'crashReports.sendTest': '发送测试事件验证链路',
  'crashReports.testSent': '测试事件已发送，一两分钟后可在 Sentry 控制台的项目 Issues（问题）页看到。',
  'crashReports.testUnavailable': '当前构建未接入上报端点（DSN 缺失），发布版构建才可用。',
} as const;

export type CrashReportingKeys = keyof typeof crashReportingZh;

export const crashReportingEn: Record<CrashReportingKeys, string> = {
  'crashReports.setting': 'Crash reports',
  'crashReports.settingDesc': 'Off by default. When enabled, crashes upload only the error stack, app version, and OS type (local paths are replaced), never repository contents or personal data. You can turn this off here at any time.',
  'crashReports.sendTest': 'Send a test event to verify the pipeline',
  'crashReports.testSent': 'Test event sent — it should appear on the Issues page of your project in the Sentry console within a minute or two.',
  'crashReports.testUnavailable': 'This build has no reporting endpoint configured (DSN missing); test events are available in release builds only.',
};
