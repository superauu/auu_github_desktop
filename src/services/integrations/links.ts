import { useIntegrationStore } from '@/stores/integrationStore';
import { LocalizedError } from '@/i18n';
import { getHostingPlugin } from './plugins';
import type { IssueReference } from '@/services/collaboration/issueTypes';
import { instanceRelativePath } from './serverUrl';
export function scopeIssueReference(reference: IssueReference): IssueReference {
  const binding = useIntegrationStore.getState().binding;
  return binding ? { providerId: binding.providerId, server: binding.server, ...reference } : reference;
}
export function externalIssueUrl(reference: IssueReference): string {
  const scoped = scopeIssueReference(reference), plugin = getHostingPlugin(scoped.providerId ?? '');
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
