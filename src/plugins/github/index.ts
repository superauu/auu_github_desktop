import { contributeAllDomains } from '@/services/collaboration/client';
import { normalizeServerUrl } from '@/services/integrations/serverUrl';
import { parseWorkflowInputs } from '../shared/dispatchInputs';
import { GITHUB_PROVIDER } from '../manifests';
import { GitHubService } from './client';
import { createCredentialStorage } from '@/services/integrations/credentialStorage';
import type { HostingPlugin } from '@/services/integrations/plugin';
export const githubPlugin: HostingPlugin = {
  parseDispatchInputs: parseWorkflowInputs,
  reviewEvents: ['APPROVE', 'COMMENT', 'REQUEST_CHANGES'], mergeMethods: ['merge', 'squash', 'rebase'], caseInsensitivePaths: true,
  manifest: GITHUB_PROVIDER, defaultServer: 'https://github.com', defaultProfileId: 'default', publicHosts: ['github.com'],
  credentials: createCredentialStorage({ read: 'get_github_token', write: 'store_github_token', remove: 'delete_github_token', legacyKey: 'auu_github_token' }),
  createClient: (server, token) => { if (normalizeServerUrl(server) !== 'https://github.com') throw new Error('This plugin supports https://github.com'); const client = new GitHubService(); client.setToken(token); return contributeAllDomains(client); },
  pullRef: number => `refs/pull/${number}/head`, issuePath: number => `/issues/${number}`, pullPath: number => `/pull/${number}`,
  checkPath: sha => `/commit/${sha}/checks`,
  legacyRepositoryRemote(value) {
    const repo = value as { gitHubOwner?: string; gitHubRepo?: string; gitHubRemote?: string };
    if (!repo.gitHubOwner || !repo.gitHubRepo) return undefined;
    const url = `https://github.com/${repo.gitHubOwner}/${repo.gitHubRepo}`;
    return { name: repo.gitHubRemote || 'origin', fetchUrl: url, pushUrl: url };
  },
  preferredProfileId() { try { return JSON.parse(localStorage.getItem('auu_git_profiles') || '{}').activeProfileId ?? null; } catch { return null; } },
  migrateIssueReference(reference) { return { ...reference, providerId: 'github', server: 'https://github.com' }; },
  migrateAccounts() {
    try {
      const stored = JSON.parse(localStorage.getItem('auu_git_profiles') || '{}');
      return Array.isArray(stored.profiles) ? stored.profiles.filter((profile: any) => profile && typeof profile.id === 'string' && profile.id.trim()).map((profile: any) => ({ id: profile.id, label: typeof profile.label === 'string' && profile.label.trim() ? profile.label : profile.id, server: 'https://github.com', ...(profile.user && typeof profile.user.login === 'string' && profile.user.login && typeof profile.user.avatarUrl === 'string' && profile.user.avatarUrl ? { user: profile.user } : {}) })) : [];
    } catch { return []; }
  },
};
