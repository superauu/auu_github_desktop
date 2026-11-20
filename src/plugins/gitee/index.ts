import { parseWorkflowInputs } from '../shared/dispatchInputs';
import { GITEE_PROVIDER } from '../manifests';
import { GiteeClient } from './client';
import { createCredentialStorage } from '@/services/integrations/credentialStorage';
import type { HostingPlugin } from '@/services/integrations/plugin';
const storage = createCredentialStorage({ read: 'get_forge_token', write: 'store_forge_token', remove: 'delete_forge_token', args: { service: 'gitee' } });
export const giteePlugin: HostingPlugin = {
  parseDispatchInputs: parseWorkflowInputs,
  // Gitee 评审只有"通过"语义（无 request_changes）；合并支持 merge/squash/rebase。
  reviewEvents: ['APPROVE', 'COMMENT'], mergeMethods: ['merge', 'squash', 'rebase'],
  manifest: GITEE_PROVIDER, defaultServer: 'https://gitee.com', defaultProfileId: 'gitee-default', publicHosts: ['gitee.com'],
  credentials: {
    read: id => storage.read(id === 'gitee-default' ? null : id), write: (token, id) => storage.write(token, id === 'gitee-default' ? null : id), remove: id => storage.remove(id === 'gitee-default' ? null : id),
  },
  // Gitee Go 无公开契约，不贡献 ci-cd 域（ProviderClient 的域字段可选）。
  createClient: (server, token) => {
    const client = new GiteeClient(server, token);
    return Object.assign(client, { repository: client, taskTracking: client, codeHosting: client });
  },
  pullRef: number => `refs/pull/${number}/head`,
  issuePath: number => `/issues/${number}`, pullPath: number => `/pulls/${number}`, checkPath: sha => `/commit/${sha}`,
};
