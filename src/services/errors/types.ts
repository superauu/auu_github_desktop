/**
 * Errors（错误追踪集成）统一类型与域注册表 —— PRD docs/errors-integration-prd.md §4/§5。
 *
 * 治理规则（§3 原则 4/5、§4.3）：
 * - Domain 由核心注册表定义，Provider 只声明贡献（manifest），不得发明域或能力词汇。
 * - capability 强制 `domain:action` 命名空间，且为本文件的字面量联合——词汇表外字符串无法编译。
 * - 预留域（task-tracking / ci-cd / observability）仅占位：declarable=false、无词汇表，
 *   落地时在核心版本中补齐联合类型并放开声明。
 */

// ---------------------------------------------------------------------------
// 域注册表
// ---------------------------------------------------------------------------

export type DomainId = 'error-tracking' | 'task-tracking' | 'ci-cd' | 'observability';

export type ErrorTrackingCapability =
  | 'error-tracking:list-issues'
  | 'error-tracking:issue-detail'
  | 'error-tracking:latest-event'
  | 'error-tracking:stacktrace'
  | 'error-tracking:suspect-commits'
  | 'error-tracking:resolve'
  | 'error-tracking:resolve-in-release'
  | 'error-tracking:ignore';

/** Provider 可声明的能力词汇（新域落地时扩展此联合）。 */
export type DeclarableCapability = ErrorTrackingCapability;

export interface DomainDefinition {
  id: DomainId;
  /** 是否允许 Provider 声明贡献；预留域为 false，域视图与词汇表落地后才放开。 */
  declarable: boolean;
  capabilities: readonly DeclarableCapability[];
}

export const DOMAIN_REGISTRY: Readonly<Record<DomainId, DomainDefinition>> = {
  'error-tracking': {
    id: 'error-tracking',
    declarable: true,
    capabilities: [
      'error-tracking:list-issues',
      'error-tracking:issue-detail',
      'error-tracking:latest-event',
      'error-tracking:stacktrace',
      'error-tracking:suspect-commits',
      'error-tracking:resolve',
      'error-tracking:resolve-in-release',
      'error-tracking:ignore',
    ],
  },
  'task-tracking': { id: 'task-tracking', declarable: false, capabilities: [] },
  'ci-cd': { id: 'ci-cd', declarable: false, capabilities: [] },
  observability: { id: 'observability', declarable: false, capabilities: [] },
};

// ---------------------------------------------------------------------------
// Provider manifest（§4.2）
// ---------------------------------------------------------------------------

export interface DomainContribution {
  domain: DomainId;
  capabilities: readonly DeclarableCapability[];
}

export interface ProviderManifest {
  id: string;
  name: string;
  domains: readonly DomainContribution[];
}

export const SENTRY_PROVIDER: ProviderManifest = {
  id: 'sentry',
  name: 'Sentry',
  domains: [
    {
      domain: 'error-tracking',
      capabilities: DOMAIN_REGISTRY['error-tracking'].capabilities,
    },
  ],
};

/** v1 仅内置 Sentry；Rollbar/Bugsnag/声明式按 PRD §10 后续加入，不改域视图。 */
export const PROVIDER_REGISTRY: readonly ProviderManifest[] = [SENTRY_PROVIDER];

export function getProviderManifest(providerId: string): ProviderManifest | null {
  return PROVIDER_REGISTRY.find((provider) => provider.id === providerId) ?? null;
}

/** 声明能力 ≠ 生效能力（§4.3）：此函数只回答 manifest 是否声明；权限/状态在操作时判定。 */
export function providerSupports(manifest: ProviderManifest, capability: DeclarableCapability): boolean {
  return manifest.domains.some((contribution) => contribution.capabilities.includes(capability));
}

// ---------------------------------------------------------------------------
// 统一数据模型（§5）——所有字段允许缺失，缺失不影响基础渲染
// ---------------------------------------------------------------------------

export type NormalizedSeverity = 'critical' | 'error' | 'warning' | 'info';
export type NormalizedStatus = 'unresolved' | 'resolved' | 'ignored';

export interface StackFrame {
  file: string;
  line: number | null;
  col: number | null;
  func: string | null;
  /** 平台返回的上下文源码行（保持原文，不翻译——§7.5）。 */
  contextLines?: string[];
}

export interface CommitRef {
  sha: string;
  message?: string;
  author?: string;
  repository?: string;
}

export interface UnifiedErrorIssue {
  connectionId: string;
  providerId: string;
  externalProjectId: string;
  /** 平台聚合后的 issue/group 标识（非 event 级）。 */
  issueId: string;
  /** 平台短 ID（Sentry: `PROJ-ABC`），用于分支名与引用标记。 */
  shortId?: string;
  /** 平台聚合指纹，预留跨源去重（§7.3.4 只留口子）。 */
  fingerprint?: string;
  title: string;
  message?: string;
  severity: NormalizedSeverity;
  status: NormalizedStatus;
  /** 平台原始状态，详情页展示（reprocessing 等归一损失的语义在这里）。 */
  rawStatus?: string;
  /** ISO 8601。 */
  firstSeen?: string;
  lastSeen?: string;
  eventCount?: number;
  affectedUsers?: number;
  stacktrace?: StackFrame[];
  release?: string;
  suspectCommit?: CommitRef;
  environment?: string;
  externalUrl: string;
  /** 平台特有扩展数据，详情页折叠区展示。 */
  rawData?: unknown;
}

// ---------------------------------------------------------------------------
// 连接与映射（§6）
// ---------------------------------------------------------------------------

export type ConnectionHealth = 'connected' | 'error' | 'unverified';

export interface ProviderConnection {
  id: string;
  providerId: string;
  /** 用户自定义显示名——同平台多连接的消歧单位（"公司 Sentry"）。 */
  displayName: string;
  enabled: boolean;
  /** 自托管地址（默认官方云）；仅 http(s)，见 §6.4 请求目标限制。 */
  baseUrl?: string;
  orgId?: string;
  /** 重算结果（manifest 声明 ∩ 凭证实际可访问），仅在权限检查成功时更新（§4.4）。 */
  domains: DomainId[];
}

export interface ProjectMapping {
  connectionId: string;
  externalProjectId: string;
  externalProjectName: string;
  /** 堆栈路径 → 本地路径前缀映射（§8.4 高置信跳转）。 */
  sourcePathPrefixMap?: { from: string; to: string }[];
}

// ---------------------------------------------------------------------------
// Issue ↔ Git 持久化关联（§5.3）
// ---------------------------------------------------------------------------

export interface IssuePullRequestRef {
  provider: string;
  number: number;
  url: string;
}

export interface IssueGitLink {
  id: string;
  connectionId: string;
  providerId: string;
  externalProjectId: string;
  issueId: string;
  /** 平台短 ID（trailer/分支名引用它；缺失时消费方回落 issueId）。 */
  shortId?: string;
  /** 平台原始详情页（PR 引用块使用；记录链接时随 issue 快照）。 */
  externalUrl?: string;
  /** 仓库稳定标识：规范化 remote URL 优先，路径回退（repoIdentity.ts）。 */
  repoKey: string;
  branchNames: string[];
  commitShas: string[];
  pullRequests: IssuePullRequestRef[];
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// 导航显示逻辑（§4.4）——存在性与健康态分离
// ---------------------------------------------------------------------------

/**
 * 域菜单存在性只看"配置过且启用的连接"，不看实时健康状态：
 * 断网/token 失效由页内降级横幅处理，菜单不得消失（§7.1 状态机）。
 */
export function shouldShowDomain(
  domain: DomainId,
  connections: readonly Pick<ProviderConnection, 'enabled' | 'domains'>[],
): boolean {
  return connections.some((connection) => connection.enabled && connection.domains.includes(domain));
}
