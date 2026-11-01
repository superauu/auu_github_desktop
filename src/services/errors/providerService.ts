/**
 * Provider 运行时抽象（PRD §4.2/§10.1）：域视图与连接管理只面向本接口，
 * 平台语义在各 provider 文件内封装。新增 provider = 一个文件 + 注册到工厂。
 */
import { SentryClient } from './providers/sentry';
import type { CommitRef, StackFrame, UnifiedErrorIssue } from './types';

export interface ExternalOrg {
  id: string;
  slug: string;
  name: string;
}

export interface ExternalProject {
  id: string;
  slug: string;
  name: string;
  platform?: string;
}

export interface ListIssuesParams {
  orgId: string;
  /** 外部项目 id；缺省 = 该组织全部项目。 */
  projectIds?: string[];
  /** 平台原生查询串（如 `is:unresolved`）；缺省由 provider 决定。 */
  query?: string;
  cursor?: string | null;
}

export interface IssuePage {
  issues: UnifiedErrorIssue[];
  /** 分页游标（多源增量合并的按连接独立 cursor，§7.2）；null = 已到当前条件末尾。 */
  nextCursor: string | null;
}

/** 错误分类（§8.3）：auth/network/server 为连接级；其余为操作级（不劣化连接健康态）。 */
export type ProviderErrorKind = 'auth' | 'forbidden' | 'notFound' | 'rateLimited' | 'network' | 'server' | 'unknown';

export class ProviderRequestError extends Error {
  readonly kind: ProviderErrorKind;
  readonly status?: number;

  constructor(kind: ProviderErrorKind, message: string, status?: number) {
    super(message);
    this.name = 'ProviderRequestError';
    this.kind = kind;
    this.status = status;
  }
}

export function isConnectionLevelError(error: unknown): boolean {
  if (!(error instanceof ProviderRequestError)) return true; // 未知错误保守按连接级处理
  return error.kind === 'auth' || error.kind === 'network' || error.kind === 'server';
}

export interface ErrorProviderClient {
  readonly providerId: string;
  /** 凭证有效性检查（最小成本调用）。 */
  verify(): Promise<void>;
  listOrganizations(): Promise<ExternalOrg[]>;
  listProjects(orgId: string): Promise<ExternalProject[]>;
  listIssues(params: ListIssuesParams): Promise<IssuePage>;
  getIssue(issueId: string): Promise<UnifiedErrorIssue>;
  /** 获取单个代表性事件（latest event）的堆栈帧——与"不做事件级管理"非目标不冲突（§1）。 */
  getLatestEventStacktrace(issueId: string): Promise<StackFrame[]>;
  /** 嫌疑 commit（平台支持才有意义，capability `error-tracking:suspect-commits`）。 */
  listSuspectCommits(issueId: string): Promise<CommitRef[]>;
  /** 状态回写（§8.3）：返回归一后的最新 issue（列表即时更新用）；权限不足等操作级错误向上抛。 */
  updateStatus(issueId: string, action: 'resolve' | 'resolveInNextRelease' | 'ignore' | 'unresolve'): Promise<UnifiedErrorIssue>;
}

export function createProviderClient(
  providerId: string,
  credentials: { token: string; baseUrl?: string },
): ErrorProviderClient {
  switch (providerId) {
    case 'sentry':
      return new SentryClient(credentials);
    default:
      throw new Error(`Unsupported provider: ${providerId}`);
  }
}
