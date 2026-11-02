import { HOSTING_PLUGINS, ERROR_PLUGINS } from '@/plugins';
import type { HostingPlugin } from './plugin';
const listeners = new Set<() => void>();
const disabled = new Set<string>();
let revision = 0;
export const getPluginRevision = () => revision;
try { for (const id of JSON.parse(localStorage.getItem('auu_git_disabled_plugins') || '[]')) disabled.add(id); } catch { /* empty */ }
export const installedHostingPlugins = () => HOSTING_PLUGINS;
export const enabledHostingPlugins = () => HOSTING_PLUGINS.filter(plugin => !disabled.has(plugin.manifest.id));
export const getHostingPlugin = (id: string): HostingPlugin | null => enabledHostingPlugins().find(plugin => plugin.manifest.id === id) ?? null;
export function setPluginEnabled(id: string, enabled: boolean): void {
  if (![...HOSTING_PLUGINS, ...ERROR_PLUGINS].some(plugin => plugin.manifest.id === id)) throw new Error('Unknown plugin');
  if (enabled) disabled.delete(id); else disabled.add(id);
  try { localStorage.setItem('auu_git_disabled_plugins', JSON.stringify([...disabled])); } catch { /* storage unavailable */ }
  revision++;
  listeners.forEach(listener => listener());
}
export function subscribePlugins(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }

export const installedExternalPlugins = () => [...HOSTING_PLUGINS, ...ERROR_PLUGINS];
export const isPluginEnabled = (id: string) => !disabled.has(id);
export const getErrorPlugin = (id: string) => ERROR_PLUGINS.find(plugin => plugin.manifest.id === id && !disabled.has(id));
