import { create } from 'zustand';
import { getCiPlugin, subscribePlugins } from '@/services/integrations/plugins';
import { normalizeServerUrl } from '@/services/integrations/serverUrl';
import { deleteIntegrationToken, getIntegrationToken, storeIntegrationToken } from '@/services/errors/credentials';
import type { ConnectionHealth, ProviderConnection } from '@/services/integrations/registry';
import { LocalizedError } from '@/i18n';

export interface CiConnection extends ProviderConnection { baseUrl: string; username: string }
export interface CiBinding { connectionId: string; jobPaths: string[] }
interface CiState {
  connections: CiConnection[];
  bindings: Record<string, CiBinding[]>;
  sources: Record<string, string>;
  runtime: Record<string, { health: ConnectionHealth; statusMessage: string }>;
  restored: boolean;
  revision: number;
  restoreConnections(): void;
  connect(input: { providerId: string; displayName: string; baseUrl: string; username: string; token: string; repoPath: string; jobPaths: string[] }): Promise<CiConnection>;
  bindRepository(repoPath: string, connectionId: string, jobPaths: string[]): Promise<void>;
  setSource(repoPath: string, source: string): void;
  updateConnection(id: string, enabled: boolean): void;
  retestConnection(id: string): Promise<void>;
  removeConnection(id: string): Promise<void>;
}
const STORAGE_KEY = 'auu_git_ci_connections';
const validPaths = (paths: unknown): paths is string[] => Array.isArray(paths) && paths.every(path => typeof path === 'string' && path.length > 0);

export const useCiStore = create<CiState>((set, get) => {
  const persist = () => {
    const { connections, bindings, sources } = get();
    // Credentials never enter localStorage. Write only the explicit non-secret schema.
    const safe = connections.map(({ id, providerId, displayName, enabled, baseUrl, username, domains }) => ({ id, providerId, displayName, enabled, baseUrl, username, domains }));
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ connections: safe, bindings, sources })); } catch { /* unavailable storage */ }
  };
  const health = (id: string, value: ConnectionHealth, statusMessage = '') => set({ runtime: { ...get().runtime, [id]: { health: value, statusMessage } } });
  return {
    connections: [], bindings: {}, sources: {}, runtime: {}, restored: false, revision: 0,
    restoreConnections() {
      if (get().restored) return;
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        const connections: CiConnection[] = (Array.isArray(saved.connections) ? saved.connections : []).flatMap((item: any) => {
          if (typeof item?.id !== 'string' || typeof item.providerId !== 'string' || typeof item.displayName !== 'string'
            || typeof item.username !== 'string' || typeof item.baseUrl !== 'string' || typeof item.enabled !== 'boolean') return [];
          try {
            return [{ id: item.id, providerId: item.providerId, displayName: item.displayName, username: item.username,
              baseUrl: normalizeServerUrl(item.baseUrl), enabled: item.enabled,
              domains: getCiPlugin(item.providerId)?.manifest.domains.map(item => item.domain) ?? [] }];
          } catch { return []; }
        });
        const bindings: Record<string, CiBinding[]> = Object.fromEntries(Object.entries(saved.bindings || {}).map(([path, items]) => [path,
          (Array.isArray(items) ? items : []).filter(item => connections.some(connection => connection.id === item?.connectionId) && validPaths(item.jobPaths))
            .map(item => ({ connectionId: item.connectionId, jobPaths: item.jobPaths })),
        ]));
        const sources: Record<string, string> = Object.fromEntries(Object.entries(saved.sources || {}).filter(([, value]) => typeof value === 'string')) as Record<string, string>;
        set({ connections, bindings, sources, restored: true });
      } catch { set({ restored: true }); }
    },
    async connect(input) {
      if (!input.repoPath || !input.jobPaths.length) throw new LocalizedError('ciDomain.mappingRequired');
      const plugin = getCiPlugin(input.providerId);
      if (!plugin) throw new LocalizedError('ciDomain.connectionUnavailable');
      const server = normalizeServerUrl(input.baseUrl.trim());
      const username = input.username.trim(), token = input.token.trim();
      if (!token) throw new LocalizedError('errors.connect.needToken');
      const paths = [...new Set(input.jobPaths.map(path => path.trim()).filter(Boolean))];
      const raw = plugin.createClient({ server, username, token, jobPaths: paths });
      await raw.verifyToken(token);
      const workflows = await raw.getWorkflows?.('', '');
      if (!workflows?.length) throw new LocalizedError('ciDomain.mappingRequired');
      if (getCiPlugin(input.providerId) !== plugin) throw new LocalizedError('ciDomain.connectionUnavailable');
      const existing = get().connections.find(connection => connection.providerId === input.providerId && connection.baseUrl === server && connection.username === username);
      const id = existing?.id ?? crypto.randomUUID();
      await storeIntegrationToken(id, token);
      const connection: CiConnection = { id, providerId: input.providerId, displayName: input.displayName.trim() || plugin.manifest.name,
        enabled: true, baseUrl: server, username, domains: plugin.manifest.domains.map(item => item.domain) };
      set({ connections: [...get().connections.filter(item => item.id !== id), connection], revision: get().revision + 1,
        bindings: { ...get().bindings, [input.repoPath]: [...(get().bindings[input.repoPath] ?? []).filter(item => item.connectionId !== id), { connectionId: id, jobPaths: paths }] },
        sources: { ...get().sources, [input.repoPath]: id } });
      health(id, 'connected'); persist(); return connection;
    },
    async bindRepository(repoPath, connectionId, jobPaths) {
      if (!repoPath || !jobPaths.length) throw new LocalizedError('ciDomain.mappingRequired');
      const connection = get().connections.find(item => item.id === connectionId && item.enabled);
      const plugin = connection && getCiPlugin(connection.providerId);
      const token = await getIntegrationToken(connectionId);
      if (!connection || !plugin || !token) throw new LocalizedError('ciDomain.connectionUnavailable');
      const paths = [...new Set(jobPaths.map(path => path.trim()).filter(Boolean))];
      if (!paths.length) throw new LocalizedError('ciDomain.mappingRequired');
      const client = plugin.createClient({ server: connection.baseUrl, username: connection.username, token, jobPaths: paths });
      if (!(await client.getWorkflows?.('', ''))?.length) throw new LocalizedError('ciDomain.mappingRequired');
      if (!get().connections.some(item => item === connection && item.enabled) || getCiPlugin(connection.providerId) !== plugin) return;
      set({ bindings: { ...get().bindings, [repoPath]: [...(get().bindings[repoPath] ?? []).filter(item => item.connectionId !== connectionId), { connectionId, jobPaths: paths }] },
        sources: { ...get().sources, [repoPath]: connectionId }, revision: get().revision + 1 }); persist();
    },
    setSource(repoPath, source) { set({ sources: { ...get().sources, [repoPath]: source } }); persist(); },
    updateConnection(id, enabled) {
      set({ connections: get().connections.map(item => item.id === id ? { ...item, enabled } : item), revision: get().revision + 1 }); persist();
    },
    async retestConnection(id) {
      const connection = get().connections.find(item => item.id === id);
      if (!connection) return;
      try {
        const plugin = getCiPlugin(connection.providerId), token = await getIntegrationToken(id);
        if (!plugin || !token) throw new LocalizedError('ciDomain.credentialMissing');
        const jobPaths = [...new Set(Object.values(get().bindings).flat().filter(binding => binding.connectionId === id).flatMap(binding => binding.jobPaths))];
        const client = plugin.createClient({ server: connection.baseUrl, username: connection.username, token, jobPaths });
        await client.verifyToken(token);
        if (jobPaths.length) await client.getWorkflows?.('', '');
        if (get().connections.includes(connection)) health(id, 'connected');
      } catch (error) { if (get().connections.includes(connection)) health(id, 'error', String(error instanceof Error ? error.message : error)); }
    },
    async removeConnection(id) {
      // Fail visibly if keyring deletion fails; do not leave a live credential with no manageable connection.
      await deleteIntegrationToken(id);
      set({ connections: get().connections.filter(item => item.id !== id),
        bindings: Object.fromEntries(Object.entries(get().bindings).map(([path, list]) => [path, list.filter(item => item.connectionId !== id)])),
        sources: Object.fromEntries(Object.entries(get().sources).map(([path, source]) => [path, source === id ? 'hosting' : source])),
        runtime: Object.fromEntries(Object.entries(get().runtime).filter(([key]) => key !== id)), revision: get().revision + 1 }); persist();
    },
  };
});

subscribePlugins(() => {
  useCiStore.setState(state => ({ revision: state.revision + 1, connections: state.connections.map(connection => ({ ...connection,
    domains: getCiPlugin(connection.providerId)?.manifest.domains.map(item => item.domain) ?? [] })) }));
});
