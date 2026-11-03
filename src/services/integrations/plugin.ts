import type { ProviderClient } from '@/services/collaboration/client';
import type { AuthenticationClient } from '@/services/collaboration/AuthenticationClient';
import type { TaskTrackingClient } from '@/services/collaboration/TaskTrackingClient';
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
 * 独立单域插件（task / ci 装配档）的装配契约。Linear 定型了 task 档：
 * 客户端工厂只收令牌（无 server——独立 SaaS 无自建实例），返回实现认证契约
 * 与所声明域方法的客户端；域能力仍由 manifest 声明、经能力双检网关执行。
 * 与 DOMAIN_REGISTRY「只声明实际实现的能力」同一纪律，ci 档接入时再收敛其词汇。
 */
export interface AuxTokenSet { accessToken: string; refreshToken: string; expiresAt: number; scope?: string }
export interface AuxPlugin {
  manifest: ProviderManifest;
  createClient(credentials: { token: string }): AuthenticationClient & Partial<TaskTrackingClient>;
  /** OAuth 插件才提供：轮转刷新令牌。调用方必须原子持久化返回的新 refresh token。 */
  oauthRefresh?(refreshToken: string): Promise<AuxTokenSet>;
  /** OAuth 插件才提供：打开系统浏览器完成授权并取回令牌集（PKCE 免 secret）。 */
  oauth?: { authorize(): Promise<AuxTokenSet> };
}
