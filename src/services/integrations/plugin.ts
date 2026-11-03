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
/**
 * 独立单域插件（task / ci 装配档）的最小装配契约：现阶段只要求 manifest。
 * 凭证形态与客户端接口随首个独立任务/CI 插件落地时在此收敛——与 DOMAIN_REGISTRY
 * 「只声明实际实现的能力」同一纪律，不为未接入的系统预造客户端词汇。
 */
export interface AuxPlugin {
  manifest: ProviderManifest;
}
