/**
 * 「连接账号即启用」后平台归属以活跃账号为准。
 * 会话字段 providerId 在账号切换成功前、或 initAuth 失败（离线）时可能仍指向上一个平台，
 * 而视图读取的插件语义（mergeMethods / reviewEvents / supportsLiveJobLogs）必须跟随
 * 当前账号，否则用户会看到另一个平台的选项。
 */
export function activeProviderId(state: {
  providerId: string | null;
  activeProfileId: string | null;
  profiles: ReadonlyArray<{ id: string; providerId?: string }>;
}): string | null {
  return state.profiles.find(profile => profile.id === state.activeProfileId)?.providerId ?? state.providerId;
}
