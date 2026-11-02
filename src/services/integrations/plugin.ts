import type { ProviderClient } from '@/services/collaboration/client';
import type { ProviderManifest } from './registry';
import type { CredentialStorage } from './credentialStorage';
export interface HostingPlugin {
  manifest: ProviderManifest;
  defaultServer: string;
  defaultProfileId: string;
  publicHosts: readonly string[];
  caseInsensitivePaths?: boolean;
  supportsLiveJobLogs?: boolean;
  parseDispatchInputs?(content: string): import('@/services/collaboration/WorkflowInputs').WorkflowInput[];
  reviewEvents?: readonly ('APPROVE' | 'COMMENT' | 'REQUEST_CHANGES')[];
  mergeMethods?: readonly ('merge' | 'squash' | 'rebase')[];
  credentials: CredentialStorage;
  createClient(server: string, token: string | null): ProviderClient;
  pullRef?(number: number): string;
  issuePath?(number: number): string;
  pullPath?(number: number): string;
  checkPath?(sha: string): string;
  legacyRepositoryRemote?(repo: unknown): import('@/services/git/types').GitRemote | undefined;
  preferredProfileId?(): string | null;
  migrateIssueReference?(reference: import('@/services/collaboration/issueTypes').IssueReference): import('@/services/collaboration/issueTypes').IssueReference;
  migrateAccounts?(): { id: string; label: string; server: string; user?: { login: string; name: string | null; avatarUrl: string } }[];
}
