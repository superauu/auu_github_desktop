import { contributeAllDomains, type CollaborationClient, type ProviderClient } from './client';
import { OPERATION_DOMAINS, OPERATION_CAPABILITIES, type ClientDomain } from './domainRouting';
import { LocalizedError } from '@/i18n';
import type { ProviderManifest } from '@/services/integrations/registry';
export { ProviderApiError as CollaborationApiError } from './client';
export * from './reviewTypes';

let activeClient: ProviderClient | null = null;
let activeManifest: ProviderManifest | undefined;
export function bindCollaborationClient(client: ProviderClient | CollaborationClient | null, manifest?: ProviderManifest): void {
  activeManifest = manifest;
  activeClient = client && !Object.keys(client).some(key => ['repository', 'taskTracking', 'codeHosting', 'ciCd'].includes(key))
    && Object.keys(OPERATION_DOMAINS).some(key => OPERATION_DOMAINS[key as keyof CollaborationClient] !== 'auth' && key in client)
    ? contributeAllDomains(client as CollaborationClient) : client as ProviderClient | null;
}
export function currentCollaborationClient(): ProviderClient | null { return activeClient; }
export function hasCollaborationDomain(domain: ClientDomain): boolean {
  // 域存在性只由当前绑定客户端决定；OPERATION_DOMAINS 的再查子句对空 target 恒为假，已移除。
  return !!activeClient?.[domain];
}
export function hasCollaborationOperation(name: keyof CollaborationClient): boolean {
  if (Object.hasOwn(collaborationService, name)) return true;
  if (!activeClient || !permitted(activeManifest, name)) return false;
  const domain = OPERATION_DOMAINS[name], target = domain === 'auth' ? activeClient : activeClient[domain];
  return !!target && typeof Reflect.get(target, name) === 'function';
}
export function collaborationClient(client: ProviderClient, manifest?: ProviderManifest): CollaborationClient {
  return new Proxy({} as CollaborationClient, { get(_target, name: keyof CollaborationClient) { return operation(client, name, manifest); } });
}
function permitted(manifest: ProviderManifest | undefined, name: keyof CollaborationClient) {
  const capability = OPERATION_CAPABILITIES[name];
  return !manifest || !capability || manifest.domains.some(item => (item.capabilities as readonly string[]).includes(capability));
}
function operation(client: ProviderClient, name: keyof CollaborationClient, manifest?: ProviderManifest) {
  return (...args: unknown[]) => {
    const domain = OPERATION_DOMAINS[name];
    const target = domain === 'auth' ? client : client[domain];
    const method = target && Reflect.get(target, name);
    if (typeof method !== 'function' || !permitted(manifest, name)) throw new LocalizedError('connections.errors.capabilityUnavailable', { op: String(name) });
    return method.apply(target, args);
  };
}
export const collaborationService = new Proxy({} as CollaborationClient, {
  get(target, name: keyof CollaborationClient) {
    if (Reflect.has(target, name)) return Reflect.get(target, name);
    return (...args: unknown[]) => {
      const client = activeClient;
      if (!client) throw new LocalizedError('connections.errors.noPluginConnected');
      return operation(client, name, activeManifest)(...args);
    };
  },
});
