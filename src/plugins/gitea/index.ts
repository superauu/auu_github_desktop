import { contributeAllDomains } from '@/services/collaboration/client';
import { parseWorkflowInputs } from '../shared/dispatchInputs';
import { GITEA_PROVIDER } from '../manifests';
import { GiteaClient } from './client';
import { createCredentialStorage } from '@/services/integrations/credentialStorage';
import type { HostingPlugin } from '@/services/integrations/plugin';
const storage = createCredentialStorage({ read: 'get_forge_token', write: 'store_forge_token', remove: 'delete_forge_token', args: { service: 'gitea' } });
export const giteaPlugin: HostingPlugin = {
  parseDispatchInputs: parseWorkflowInputs,
  reviewEvents: ['APPROVE', 'COMMENT', 'REQUEST_CHANGES'], mergeMethods: ['merge', 'squash', 'rebase'],
  manifest: GITEA_PROVIDER, defaultServer: '', defaultProfileId: 'gitea-default', publicHosts: [],
  credentials: {
    read: id => storage.read(id === 'gitea-default' ? null : id), write: (token, id) => storage.write(token, id === 'gitea-default' ? null : id), remove: id => storage.remove(id === 'gitea-default' ? null : id),
  },
  createClient: (server, token) => contributeAllDomains(new GiteaClient(server, token)), pullRef: number => `refs/pull/${number}/head`,
  issuePath: number => `/issues/${number}`, pullPath: number => `/pulls/${number}`, checkPath: sha => `/commit/${sha}`,
  migrateAccounts() {
    try {
      const account = JSON.parse(localStorage.getItem('auu_git_forge_accounts') || '{}').gitea;
      return account ? [{ id: 'gitea-default', label: account.user?.login || 'Gitea', server: account.server,
        user: account.user ? { login: account.user.login, name: account.user.name ?? null, avatarUrl: account.user.avatarUrl ?? '' } : undefined }] : [];
    } catch { return []; }
  },
};
