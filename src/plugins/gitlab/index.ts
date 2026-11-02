import { contributeAllDomains } from '@/services/collaboration/client';
import { parsePipelineInputs } from './inputs';
import { GITLAB_PROVIDER } from '../manifests';
import { GitLabClient } from './client';
import { createCredentialStorage } from '@/services/integrations/credentialStorage';
import type { HostingPlugin } from '@/services/integrations/plugin';
const storage = createCredentialStorage({ read: 'get_forge_token', write: 'store_forge_token', remove: 'delete_forge_token', args: { service: 'gitlab' } });
export const gitlabPlugin: HostingPlugin = {
  supportsLiveJobLogs: true,
  parseDispatchInputs: parsePipelineInputs,
  reviewEvents: ['APPROVE', 'COMMENT'], mergeMethods: ['merge', 'squash'],
  manifest: GITLAB_PROVIDER, defaultServer: 'https://gitlab.com', defaultProfileId: 'gitlab-default', publicHosts: ['gitlab.com'],
  credentials: {
    read: id => storage.read(id === 'gitlab-default' ? null : id),
    write: (token, id) => storage.write(token, id === 'gitlab-default' ? null : id),
    remove: id => storage.remove(id === 'gitlab-default' ? null : id),
  },
  createClient: (server, token) => contributeAllDomains(new GitLabClient(server, token)),
  pullRef: number => `refs/merge-requests/${number}/head`, issuePath: number => `/-/issues/${number}`, pullPath: number => `/-/merge_requests/${number}`,
  checkPath: sha => `/-/pipelines?sha=${encodeURIComponent(sha)}`,
  migrateAccounts() {
    try {
      const account = JSON.parse(localStorage.getItem('auu_git_forge_accounts') || '{}').gitlab;
      return account ? [{ id: 'gitlab-default', label: account.user?.login || 'GitLab', server: account.server,
        user: account.user ? { login: account.user.login, name: account.user.name ?? null, avatarUrl: account.user.avatarUrl ?? '' } : undefined }] : [];
    } catch { return []; }
  },
};
