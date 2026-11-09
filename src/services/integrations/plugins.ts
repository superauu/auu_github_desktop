import { HOSTING_PLUGINS, ERROR_PLUGINS, TASK_PLUGINS, CI_PLUGINS } from '@/plugins';
import type { HostingPlugin, AuxPlugin, CiPlugin } from './plugin';
import type { ProviderManifest } from './registry';
const listeners = new Set<() => void>();
const disabled = new Set<string>();
let revision = 0;
export const getPluginRevision = () => revision;
// 「连接账号即启用」：插件启停不再是用户可配置项（设置页无入口），历史版本写入的
// 禁用标记在启动时清除。setPluginEnabled 仅保留内存态（隔离测试与故障注入），
// 不落存储——否则一次测试注入会在下次启动被误当作持久禁用。
try { localStorage.removeItem('auu_git_disabled_plugins'); } catch { /* storage unavailable */ }
// 各装配档的公共面只有 manifest（ERROR_PLUGINS 保持推断类型，勿收窄）。
const allPlugins = (): readonly { manifest: ProviderManifest }[] => [...HOSTING_PLUGINS, ...ERROR_PLUGINS, ...TASK_PLUGINS, ...CI_PLUGINS];
export const installedHostingPlugins = () => HOSTING_PLUGINS;
/** 独立任务系统与独立 CI 的装配档，各自拥有连接、凭证及 domain 绑定通道。 */
export const installedTaskPlugins = () => TASK_PLUGINS;
export const installedCiPlugins = () => CI_PLUGINS;
export const enabledHostingPlugins = () => HOSTING_PLUGINS.filter(plugin => !disabled.has(plugin.manifest.id));
export const getHostingPlugin = (id: string): HostingPlugin | null => enabledHostingPlugins().find(plugin => plugin.manifest.id === id) ?? null;
export function setPluginEnabled(id: string, enabled: boolean): void {
  if (!allPlugins().some(plugin => plugin.manifest.id === id)) throw new Error('Unknown plugin');
  if (enabled) disabled.delete(id); else disabled.add(id);
  revision++;
  listeners.forEach(listener => listener());
}
export function subscribePlugins(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }

/** 喂给 PROVIDER_REGISTRY 的全部外部插件；task/ci 装配档为空时注册表现状不变。 */
export const installedExternalPlugins = () => [...HOSTING_PLUGINS, ...ERROR_PLUGINS, ...TASK_PLUGINS, ...CI_PLUGINS];
export const getErrorPlugin = (id: string) => ERROR_PLUGINS.find(plugin => plugin.manifest.id === id && !disabled.has(id));
export const getTaskPlugin = (id: string): AuxPlugin | null => TASK_PLUGINS.find(plugin => plugin.manifest.id === id && !disabled.has(id)) ?? null;
export const getCiPlugin = (id: string): CiPlugin | null => CI_PLUGINS.find(plugin => plugin.manifest.id === id && !disabled.has(id)) ?? null;
