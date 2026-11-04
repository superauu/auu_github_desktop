import { useIntegrationStore } from '@/stores/integrationStore';
import { LocalizedError } from '@/i18n';
import { getHostingPlugin, getTaskPlugin } from './plugins';
import type { IssueReference } from '@/services/collaboration/issueTypes';
import { instanceRelativePath } from './serverUrl';
export function scopeIssueReference(reference: IssueReference): IssueReference {
  // 显式携带 providerId 的引用（独立任务系统）归属明确，不再套托管绑定；
  // 托管引用维持既有行为：以当前 Git remote 绑定落款。
  if (reference.providerId) return reference;
  const binding = useIntegrationStore.getState().binding;
  return binding ? { providerId: binding.providerId, server: binding.server, ...reference } : reference;
}
export function externalIssueUrl(reference: IssueReference): string {
  const scoped = scopeIssueReference(reference);
  // 独立任务系统：URL 由插件给出（Linear 以 identifier 为键，如 linear.app/issue/ENG-12）。
  const taskPlugin = getTaskPlugin(scoped.providerId ?? '');
  if (taskPlugin?.issueUrl) return taskPlugin.issueUrl(scoped);
  const plugin = getHostingPlugin(scoped.providerId ?? '');
  if (!plugin?.issuePath || !scoped.server) return '';
  try { const url = new URL(scoped.server); if (!/^https?:$/.test(url.protocol) || url.username || url.password) return ''; } catch { return ''; }
  return `${scoped.server}/${scoped.owner}/${scoped.repo}${plugin.issuePath(scoped.number)}`;
}
export function getPullCheckoutRef(number: number): string {
  const binding = useIntegrationStore.getState().binding, plugin = binding && getHostingPlugin(binding.providerId);
  if (!plugin?.pullRef) throw new LocalizedError('connections.errors.noPluginBound');
  return plugin.pullRef(number);
}
export function isCurrentPlatformUrl(url: string): boolean {
  return currentPlatformPath(url) !== null;
}
export function currentPlatformPath(url: string): string | null {
  const binding = useIntegrationStore.getState().binding;
  return binding ? instanceRelativePath(url, binding.server) : null;
}
