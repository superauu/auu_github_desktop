/**
 * Sentry Provider（PRD §10.2，P0）：Bearer 认证、官方云/自托管 baseUrl、组织/项目/issue
 * 语义映射到统一模型。endpoint 为参考实现，平台响应字段按 best-effort 容错（§5 字段可缺失）。
 * 堆栈帧映射为"最新调用在前"（平台原始顺序的逆序，与 Sentry UI 一致）。
 */
import { normalizeSeverity, normalizeStatus } from '@/services/errors/normalize';
import {
  providerHttpRequest,
  ProviderRequestError,
  type ErrorProviderClient,
  type ExternalOrg,
  type ExternalProject,
  type IssuePage,
  type ListIssuesParams,
  type ProviderErrorKind,
  type ProviderHttpResponse,
} from '@/services/errors/providerService';
import type { CommitRef, StackFrame, UnifiedErrorIssue } from '@/services/errors/types';

const DEFAULT_BASE_URL = 'https://sentry.io';

export function normalizeBaseUrl(url?: string): string {
  const candidate = (url ?? '').trim().replace(/\/+$/, '') || DEFAULT_BASE_URL;
  // §6.4 请求目标限制：仅 http(s)（http 保留给本地自托管调试）
  if (!/^https?:\/\//i.test(candidate)) {
    throw new ProviderRequestError('unknown', 'Base URL must start with http:// or https://');
  }
  return candidate;
}

// ---------------------------------------------------------------------------
// 语义映射（导出供 fixture 单测作为契约）
// ---------------------------------------------------------------------------

/** eslint-disable @typescript-eslint/no-explicit-any —— 平台响应按 best-effort 容错读取 */
export function mapSentryIssue(raw: any): UnifiedErrorIssue {
  const eventCount = toCount(raw?.count);
  const affectedUsers = toCount(raw?.userCount);
  const metadataValue = typeof raw?.metadata?.value === 'string' ? raw.metadata.value : undefined;
  return {
    connectionId: '',
    providerId: 'sentry',
    externalProjectId: String(raw?.project?.id ?? ''),
    issueId: String(raw?.id ?? ''),
    shortId: typeof raw?.shortId === 'string' ? raw.shortId : undefined,
    title: typeof raw?.title === 'string' && raw.title ? raw.title : metadataValue ?? String(raw?.id ?? 'Unknown issue'),
    message: metadataValue,
    severity: normalizeSeverity('sentry', raw?.level),
    status: normalizeStatus('sentry', raw?.status),
    rawStatus: typeof raw?.status === 'string' ? raw.status : undefined,
    firstSeen: raw?.firstSeen,
    lastSeen: raw?.lastSeen,
    eventCount,
    affectedUsers,
    release: undefined,
    externalUrl: typeof raw?.permalink === 'string' ? raw.permalink : '',
    rawData: raw,
  };
}

function toCount(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number.parseInt(value, 10) : Number.NaN;
  // 平台用 -1 表示"未知"（如无用户统计权限），视为缺失
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

/**
 * latest event → 堆栈帧。exception entry 的 values 按异常链展开、帧逆序
 * （平台原始顺序为最外层在前，展示按 Sentry UI 习惯：抛出点在前）。
 */
export function mapSentryEventFrames(raw: any): StackFrame[] {
  const entries: any[] = Array.isArray(raw?.entries) ? raw.entries : [];
  const frames: StackFrame[] = [];
  for (const entry of entries) {
    if (entry?.type !== 'exception') continue;
    const values: any[] = Array.isArray(entry?.data?.values) ? entry.data.values : [];
    for (const value of values) {
      const rawFrames: any[] = Array.isArray(value?.stacktrace?.frames) ? value.stacktrace.frames : [];
      for (const frame of rawFrames) {
        frames.push({
          file: typeof frame?.filename === 'string' ? frame.filename : typeof frame?.absPath === 'string' ? frame.absPath : '',
          line: typeof frame?.lineno === 'number' ? frame.lineno : null,
          col: typeof frame?.colno === 'number' ? frame.colno : null,
          func: typeof frame?.function === 'string' ? frame.function : null,
          contextLines: Array.isArray(frame?.context) ? frame.context.map((pair: any) => String(pair?.[1] ?? '')) : undefined,
        });
      }
    }
  }
  return frames.reverse();
}

/** Link 头 rel="next" 段落里的 cursor 游标；无下一页返回 null。 */
export function parseLinkCursor(linkHeader: string | null | undefined): string | null {
  if (!linkHeader) return null;
  for (const segment of linkHeader.split(',')) {
    const match = segment.match(/<([^>]+)>\s*;\s*rel="next"/);
    if (!match) continue;
    try {
      return new URL(match[1], 'https://sentry.invalid').searchParams.get('cursor');
    } catch {
      return null;
    }
  }
  return null;
}

export function buildStatusUpdate(action: 'resolve' | 'resolveInNextRelease' | 'ignore' | 'unresolve'): Record<string, unknown> {
  switch (action) {
    case 'resolve':
      return { status: 'resolved' };
    case 'resolveInNextRelease':
      return { status: 'resolved', statusDetails: { inNextRelease: true } };
    case 'ignore':
      return { status: 'ignored' };
    case 'unresolve':
      return { status: 'unresolved' };
  }
}

// ---------------------------------------------------------------------------
// HTTP 封装与客户端
// ---------------------------------------------------------------------------

function httpError(status: number, message: string): ProviderRequestError {
  const kind: ProviderErrorKind =
    status === 401 ? 'auth'
    : status === 403 ? 'forbidden'
    : status === 404 ? 'notFound'
    : status === 429 ? 'rateLimited'
    : status >= 500 ? 'server'
    : 'unknown';
  return new ProviderRequestError(kind, message || `HTTP ${status}`, status);
}

export class SentryClient implements ErrorProviderClient {
  readonly providerId = 'sentry';
  private readonly token: string;
  private readonly baseUrl: string;

  constructor(credentials: { token: string; baseUrl?: string }) {
    this.token = credentials.token;
    this.baseUrl = normalizeBaseUrl(credentials.baseUrl);
  }

  private async request<T>(path: string, init?: RequestInit): Promise<{ data: T; headers: { get(key: string): string | null } }> {
    const method = (init?.method ?? 'GET').toUpperCase();
    const headers: Record<string, string> = { Authorization: `Bearer ${this.token}` };
    if (init?.headers) Object.assign(headers, init.headers as Record<string, string>);
    let result: ProviderHttpResponse;
    try {
      result = await providerHttpRequest(method, `${this.baseUrl}${path}`, headers, typeof init?.body === 'string' ? init.body : undefined);
    } catch (cause) {
      throw new ProviderRequestError('network', String(cause instanceof Error ? cause.message : cause));
    }
    if (result.status < 200 || result.status >= 300) {
      let detail = '';
      try {
        const parsed = JSON.parse(result.body) as { detail?: unknown };
        detail = typeof parsed?.detail === 'string' ? parsed.detail : '';
      } catch {
        /* 非 JSON 错误体：保留状态码 */
      }
      throw httpError(result.status, detail);
    }
    let data: T;
    try {
      data = JSON.parse(result.body) as T;
    } catch {
      throw new ProviderRequestError('unknown', 'Provider returned invalid JSON');
    }
    return { data, headers: { get: (key) => result.headers[key.toLowerCase()] ?? null } };
  }

  private orgIssuesPath(params: ListIssuesParams): string {
    const query = new URLSearchParams();
    if (params.projectIds?.length) query.set('project', params.projectIds.join(','));
    query.set('query', params.query ?? 'is:unresolved');
    if (params.cursor) query.set('cursor', params.cursor);
    return `/api/0/organizations/${encodeURIComponent(params.orgId)}/issues/?${query.toString()}`;
  }

  async verify(): Promise<void> {
    await this.request<unknown[]>('/api/0/organizations/');
  }

  async listOrganizations(): Promise<ExternalOrg[]> {
    const { data } = await this.request<any[]>('/api/0/organizations/');
    return (Array.isArray(data) ? data : []).map((org) => ({
      id: String(org?.id ?? ''),
      slug: String(org?.slug ?? ''),
      name: String(org?.name ?? org?.slug ?? ''),
    }));
  }

  async listProjects(orgId: string): Promise<ExternalProject[]> {
    const { data } = await this.request<any[]>(`/api/0/organizations/${encodeURIComponent(orgId)}/projects/`);
    return (Array.isArray(data) ? data : []).map((project) => ({
      id: String(project?.id ?? ''),
      slug: String(project?.slug ?? ''),
      name: String(project?.name ?? project?.slug ?? ''),
      platform: typeof project?.platform === 'string' ? project.platform : undefined,
    }));
  }

  async listIssues(params: ListIssuesParams): Promise<IssuePage> {
    const { data, headers } = await this.request<any[]>(this.orgIssuesPath(params));
    const issues = (Array.isArray(data) ? data : []).map(mapSentryIssue);
    return { issues, nextCursor: parseLinkCursor(headers.get('Link')) };
  }

  async getIssue(issueId: string): Promise<UnifiedErrorIssue> {
    const { data } = await this.request<any>(`/api/0/issues/${encodeURIComponent(issueId)}/`);
    return mapSentryIssue(data);
  }

  async getLatestEventStacktrace(issueId: string): Promise<StackFrame[]> {
    const { data } = await this.request<any>(`/api/0/issues/${encodeURIComponent(issueId)}/events/latest/`);
    return mapSentryEventFrames(data);
  }

  async listSuspectCommits(issueId: string): Promise<CommitRef[]> {
    const { data } = await this.request<any[]>(`/api/0/issues/${encodeURIComponent(issueId)}/suspect-commits/`);
    return (Array.isArray(data) ? data : [])
      .map((row) => ({
        sha: String(row?.commit?.id ?? row?.commitId ?? ''),
        message: typeof row?.commit?.message === 'string' ? row.commit.message : undefined,
        author: typeof row?.commit?.author?.name === 'string' ? row.commit.author.name : undefined,
        repository: typeof row?.repository?.name === 'string' ? row.repository.name : undefined,
      }))
      .filter((commit) => commit.sha);
  }

  async updateStatus(issueId: string, action: 'resolve' | 'resolveInNextRelease' | 'ignore' | 'unresolve'): Promise<UnifiedErrorIssue> {
    const { data } = await this.request<any>(`/api/0/issues/${encodeURIComponent(issueId)}/`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildStatusUpdate(action)),
    });
    return mapSentryIssue(data);
  }
}
