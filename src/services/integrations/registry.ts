/** 核心定义工作域与能力词汇；Provider 只声明实际实现的贡献。 */
import type { ProviderConnection } from './connections';
export type { ProviderConnection, ConnectionHealth } from './connections';

export type DomainId = 'error-tracking' | 'code-hosting' | 'task-tracking' | 'ci-cd' | 'observability';
export type ErrorTrackingCapability =
  | 'error-tracking:list-issues' | 'error-tracking:issue-detail' | 'error-tracking:latest-event'
  | 'error-tracking:stacktrace' | 'error-tracking:suspect-commits' | 'error-tracking:resolve'
  | 'error-tracking:resolve-in-release' | 'error-tracking:ignore';
export type CodeHostingCapability =
  | 'code-hosting:list-pull-requests' | 'code-hosting:pull-request-detail'
  | 'code-hosting:create-pull-request' | 'code-hosting:merge-pull-request'
  | 'code-hosting:close-pull-request' | 'code-hosting:review-pull-request'
  /** @deprecated 使用 ci-cd:list-pipelines，保留旧 manifest 的兼容词汇。 */
  | 'code-hosting:pipelines';
export type TaskTrackingCapability =
  | 'task-tracking:list-issues' | 'task-tracking:issue-detail' | 'task-tracking:create-issue'
  | 'task-tracking:update-issue' | 'task-tracking:comment' | 'task-tracking:close-state-reason';
export type CiCdCapability =
  | 'ci-cd:list-pipelines' | 'ci-cd:commit-checks' | 'ci-cd:job-logs'
  | 'ci-cd:workflow-source' | 'ci-cd:dispatch' | 'ci-cd:rerun' | 'ci-cd:cancel';
export type DeclarableCapability = ErrorTrackingCapability | CodeHostingCapability | TaskTrackingCapability | CiCdCapability;
export interface DomainDefinition {
  id: DomainId;
  declarable: boolean;
  capabilities: readonly DeclarableCapability[];
}
export const DOMAIN_REGISTRY: Readonly<Record<DomainId, DomainDefinition>> = {
  'error-tracking': { id: 'error-tracking', declarable: true, capabilities: [
    'error-tracking:list-issues', 'error-tracking:issue-detail', 'error-tracking:latest-event',
    'error-tracking:stacktrace', 'error-tracking:suspect-commits', 'error-tracking:resolve',
    'error-tracking:resolve-in-release', 'error-tracking:ignore',
  ] },
  'code-hosting': { id: 'code-hosting', declarable: true, capabilities: [
    'code-hosting:list-pull-requests', 'code-hosting:pull-request-detail',
    'code-hosting:create-pull-request', 'code-hosting:merge-pull-request',
    'code-hosting:close-pull-request', 'code-hosting:review-pull-request', 'code-hosting:pipelines',
  ] },
  'task-tracking': { id: 'task-tracking', declarable: true, capabilities: [
    'task-tracking:list-issues', 'task-tracking:issue-detail', 'task-tracking:create-issue',
    'task-tracking:update-issue', 'task-tracking:comment', 'task-tracking:close-state-reason',
  ] },
  'ci-cd': { id: 'ci-cd', declarable: true, capabilities: [
    'ci-cd:list-pipelines', 'ci-cd:commit-checks', 'ci-cd:job-logs',
    'ci-cd:workflow-source', 'ci-cd:dispatch', 'ci-cd:rerun', 'ci-cd:cancel',
  ] },
  observability: { id: 'observability', declarable: false, capabilities: [] },
};
/** 同一贡献中的能力必须属于该域。 */
export type DomainContribution = {
  [D in DomainId]: { domain: D; capabilities: readonly Extract<DeclarableCapability, `${D}:${string}`>[] }
}[DomainId];
export interface ProviderManifest {
  id: string;
  name: string;
  domains: readonly DomainContribution[];
  /** 多域平台在集成选择器中只显示一张卡片。 */
  primaryDomain: DomainId;
  connectionKind: 'hosting-account' | 'error-token';
}
import { installedExternalPlugins } from './plugins';
export const PROVIDER_REGISTRY: readonly ProviderManifest[] = installedExternalPlugins().map(plugin => plugin.manifest);
export function providerDomains(manifest: ProviderManifest): DomainId[] { return manifest.domains.map(item => item.domain); }
export function getProviderManifest(id: string): ProviderManifest | null { return PROVIDER_REGISTRY.find(item => item.id === id) ?? null; }
/** 声明能力不代表当前凭证有权限，403 等仍由操作处理。 */
export function providerSupports(manifest: ProviderManifest, capability: DeclarableCapability): boolean {
  return manifest.domains.some(contribution => (contribution.capabilities as readonly DeclarableCapability[]).includes(capability));
}
export function shouldShowDomain(domain: DomainId, connections: readonly Pick<ProviderConnection, 'enabled' | 'domains'>[]): boolean {
  return connections.some(connection => connection.enabled && connection.domains.includes(domain));
}
