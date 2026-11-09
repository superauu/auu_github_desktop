import type { CiCdClient } from '@/services/collaboration/CiCdClient';
import { OPERATION_CAPABILITIES, OPERATION_DOMAINS } from '@/services/collaboration/domainRouting';
import { collaborationClient } from '@/services/collaboration/CollaborationService';
import { getCiPlugin } from './plugins';
import { providerSupports } from './registry';
import { getIntegrationToken } from '@/services/errors/credentials';
import { useCiStore, type CiConnection } from '@/stores/ciStore';
import { LocalizedError } from '@/i18n';

export type CiOperation = keyof CiCdClient;
export interface CiChannel {
  client: CiCdClient;
  has(operation: CiOperation): boolean;
}

/** Separate ci-cd binding: never rebinds hosting or borrows a hosting account's credential/capabilities. */
export async function createCiChannel(connection: CiConnection, jobPaths: readonly string[]): Promise<CiChannel> {
  const plugin = getCiPlugin(connection.providerId);
  if (!connection.enabled || !connection.domains.includes('ci-cd') || !plugin) throw new LocalizedError('ciDomain.connectionUnavailable');
  const token = await getIntegrationToken(connection.id);
  if (!token) throw new LocalizedError('ciDomain.credentialMissing');
  const raw = plugin.createClient({ server: connection.baseUrl, username: connection.username, token, jobPaths });
  const permitted = (operation: CiOperation) => {
    const current = getCiPlugin(connection.providerId);
    const live = useCiStore.getState().connections.find(item => item.id === connection.id);
    const capability = OPERATION_CAPABILITIES[operation];
    return live === connection && live.enabled && live.domains.includes('ci-cd') && current === plugin && OPERATION_DOMAINS[operation] === 'ciCd'
      && typeof raw[operation as keyof typeof raw] === 'function' && !!capability && providerSupports(plugin.manifest, capability);
  };
  const governed = collaborationClient({ ciCd: raw, setToken: raw.setToken.bind(raw), verifyToken: raw.verifyToken.bind(raw) }, plugin.manifest);
  // Recheck plugin enablement on every invocation as well as when rendering controls.
  const client = new Proxy({} as CiCdClient, {
    get(_target, name: CiOperation) {
      return (...args: unknown[]) => {
        if (!permitted(name)) throw new LocalizedError('connections.errors.capabilityUnavailable', { op: name });
        const method = Reflect.get(governed, name);
        if (typeof method !== 'function') throw new LocalizedError('connections.errors.capabilityUnavailable', { op: name });
        return Reflect.apply(method, governed, args);
      };
    },
  });
  return { client, has: permitted };
}
