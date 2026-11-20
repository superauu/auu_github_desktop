import { normalizeServerUrl } from '@/services/integrations/serverUrl';
import { providerHttpRequest } from '@/services/http/providerHttp';
import { tNow } from '@/i18n';
import type { CollaborationIssue, CollaborationLabel, IssueInput, IssueListOptions, IssueSearchResult, IssueTimelineEvent, IssueUser } from '@/services/collaboration/issueTypes';
import type { CollaborationPullRequest, CollaborationRepoDetails, CollaborationUser } from '@/services/collaboration/types';
import { ProviderApiError } from '@/services/collaboration/client';
import type { CreateReviewParams, CollaborationPullRequestFilesResult, CollaborationPullRequestReview, CollaborationReviewComment, CollaborationIssueComment } from '@/services/collaboration/reviewTypes';

/** 上限保护：巨型仓库的列表接口不能无限翻页拖垮 UI */
const DEFAULT_MAX_PAGES = 10;
/** Gitee v5 分页每页上限 100；PR files 最多返回 300 条 diff（官方注释） */
const PER_PAGE = 100;

function normalizePull(raw: any): CollaborationPullRequest {
  return { ...raw, merged_at: raw.merged_at ?? (raw.merged ? raw.updated_at : null), draft: raw.draft ?? /^(WIP|Draft|\[WIP\])/i.test(raw.title ?? '') };
}

/**
 * Gitee（码云）v5 客户端：GitHub v3 同构但差异多（真机调研 2026-11）——
 * 鉴权是 access_token query 参数；PR 合并 PUT；评审只有通过+重置（无 request_changes）；
 * Issue 更新走 owner 级路径（PATCH /repos/{owner}/issues/{n}，body 带 repo）；state 有 progressing。
 * 本客户端只实现 hosting / task-tracking / repository 域；Gitee Go 无公开契约，不实现 ci-cd。
 */
export class GiteeClient {
  constructor(private server: string, private token: string | null = null) { this.server = normalizeServerUrl(server); }

  setToken(token: string | null) {
    this.token = token;
  }

  /** 统一请求：路径以 / 开头（不含 /api/v5 前缀）；鉴权用官方文档形态的 access_token query 参数 */
  private async request<T>(path: string, method = 'GET', body?: unknown, query?: Record<string, string>, tokenOverride?: string | null): Promise<T> {
    const url = new URL(`${this.server}/api/v5${path}`);
    Object.entries(query ?? {}).forEach(([key, value]) => url.searchParams.set(key, value));
    const token = tokenOverride ?? this.token;
    if (token) url.searchParams.set('access_token', token);
    const response = await providerHttpRequest(method, url.toString(), {
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    }, body === undefined ? undefined : JSON.stringify(body));
    if (response.status < 200 || response.status >= 300) {
      let detail = response.body.slice(0, 500);
      try { detail = JSON.stringify(JSON.parse(response.body).message); } catch { /* text response */ }
      throw new ProviderApiError(response.status, `Gitee ${response.status}: ${detail}`);
    }
    if (!response.body) return null as T;
    return JSON.parse(response.body);
  }

  /** 显式翻页：Gitee v5 不保证 Link 头，按 page 递增直到不足一页 */
  private async pages<T>(path: string, maxPages: number = DEFAULT_MAX_PAGES, query?: Record<string, string>): Promise<T[]> {
    const result: T[] = [];
    for (let page = 1; page <= maxPages; page++) {
      const items = await this.request<any[]>(path, 'GET', undefined, { ...query, page: String(page), per_page: String(PER_PAGE) });
      result.push(...(Array.isArray(items) ? items : []));
      if (!Array.isArray(items) || items.length < PER_PAGE) break;
    }
    return result;
  }

  async verifyToken(token: string): Promise<CollaborationUser> {
    try {
      const raw = await this.request<any>('/user', 'GET', undefined, {}, token);
      return { ...raw, name: raw.name || raw.login, bio: raw.bio ?? null, public_repos: raw.public_repos ?? 0 };
    } catch (err) {
      if (err instanceof ProviderApiError && err.status === 401) throw new ProviderApiError(401, tNow('err.ghBadCredentials'));
      throw new Error(tNow('err.ghAuthFailed').replace('{s}', err instanceof ProviderApiError ? String(err.status) : 'unknown'), { cause: err });
    }
  }

  async getRepository(owner: string, repo: string): Promise<CollaborationRepoDetails> {
    return this.request<CollaborationRepoDetails>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
  }

  async getRepositoryDefaultBranch(owner: string, repo: string): Promise<string> {
    const details = await this.getRepository(owner, repo);
    return details.default_branch || 'master';
  }

  // ---------- Issues（task-tracking 域） ----------

  async searchIssues(owner: string, repo: string, options: IssueListOptions): Promise<IssueSearchResult> {
    // v5 仓库 Issue 列表无确认的 q 参数：state/assignee/labels 服务端过滤，query 本地按标题/正文过滤。
    const serverQuery: Record<string, string> = { state: options.state };
    if (options.assignee) serverQuery.assignee = options.assignee;
    if (options.label) serverQuery.labels = options.label;
    const items = await this.pages<any>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`, undefined, { ...serverQuery, per_page: String(PER_PAGE) });
    const q = options.query?.trim().toLowerCase();
    const filtered = (!q ? items : items.filter(item => `${item.title ?? ''}\n${item.body ?? ''}`.toLowerCase().includes(q)))
      .slice((options.page - 1) * 30, (options.page - 1) * 30 + 30);
    return { items: filtered, total_count: items.length, incomplete_results: items.length >= PER_PAGE };
  }

  async getIssue(owner: string, repo: string, number: number): Promise<CollaborationIssue> {
    // Gitee 的 Issue 与 Pull Request 编号空间独立，无需 gitea 式的 pull_request 判别。
    return this.request<CollaborationIssue>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${number}`);
  }

  async createIssue(owner: string, repo: string, input: IssueInput): Promise<CollaborationIssue> {
    // 创建走 owner 级路径，repo 放 body（Gitee 特有）。
    return this.request<CollaborationIssue>(`/repos/${encodeURIComponent(owner)}/issues`, 'POST', {
      repo, title: input.title, body: input.body ?? '',
      ...(input.labels?.length ? { labels: input.labels.join(',') } : {}),
      ...(input.assignees?.length ? { assignee: input.assignees[0] } : {}),
    });
  }

  async updateIssue(owner: string, repo: string, number: number, input: Partial<IssueInput> & { state?: 'open' | 'closed' }): Promise<CollaborationIssue> {
    // 更新同样走 owner 级路径；state 取值 open/progressing/closed，应用语义 open/closed 直接透传。
    return this.request<CollaborationIssue>(`/repos/${encodeURIComponent(owner)}/issues/${number}`, 'PATCH', {
      repo, ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.body !== undefined ? { body: input.body } : {}),
      ...(input.state !== undefined ? { state: input.state } : {}),
      ...(input.labels?.length ? { labels: input.labels.join(',') } : {}),
      ...(input.assignees?.length ? { assignee: input.assignees[0] } : {}),
    });
  }

  async getIssueComments(owner: string, repo: string, number: number): Promise<CollaborationIssueComment[]> {
    return this.pages<CollaborationIssueComment>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${number}/comments`);
  }

  async createIssueComment(owner: string, repo: string, number: number, body: string): Promise<CollaborationIssueComment> {
    return this.request<CollaborationIssueComment>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${number}/comments`, 'POST', { body });
  }

  /** Gitee v5 的 operate_logs 契约未在官方 spec 给出结构，首版返回空（同 Linear timeline 的 MVP 限制注释） */
  async getIssueTimeline(_owner: string, _repo: string, _number: number): Promise<IssueTimelineEvent[]> {
    return [];
  }

  async getIssueLabels(owner: string, repo: string): Promise<CollaborationLabel[]> {
    return this.pages<CollaborationLabel>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/labels`);
  }

  /** 仓库可指派负责人端点未在官方 v5 spec 确认，首版返回空；写路径仍可用 updateIssue 的 assignee 用户名 */
  async getIssueAssignees(_owner: string, _repo: string): Promise<IssueUser[]> {
    return [];
  }

  // ---------- Pull Requests（code-hosting 域） ----------

  async getPullRequests(owner: string, repo: string, state: 'open' | 'closed' | 'all' = 'all', maxPages?: number): Promise<CollaborationPullRequest[]> {
    return (await this.pages<CollaborationPullRequest>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?state=${state}`, maxPages)).map(normalizePull);
  }

  async getPullRequest(owner: string, repo: string, number: number): Promise<CollaborationPullRequest> {
    return normalizePull(await this.request<any>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${number}`));
  }

  /** Gitee 的评审只有"通过"语义（POST review），无列出评审记录的公开端点——首版返回空数组降级 */
  async getPullRequestReviews(_owner: string, _repo: string, _pullNumber: number): Promise<CollaborationPullRequestReview[]> {
    return [];
  }

  /**
   * PR 变更文件：真机实测（2026-11-20）与官方 spec 不符——patch 是对象 { diff, new_path, old_path,
   * renamed_file, deleted_file }（GitLab 形）而非字符串；additions/deletions 是字符串数字；
   * status 非变更文件时为 null。映射为应用契约：patch 取 diff 文本、增删转数字、null 态归 modified。
   */
  async getPullRequestFiles(owner: string, repo: string, pullNumber: number): Promise<CollaborationPullRequestFilesResult> {
    const files = await this.pages<any>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${pullNumber}/files`);
    return {
      files: files.map(raw => {
        const patchIsObject = raw.patch !== null && typeof raw.patch === 'object'; const patchInfo = (patchIsObject ? raw.patch : {}) ?? {};
        const renamed = !!patchInfo.renamed_file && patchInfo.old_path !== patchInfo.new_path;
        return {
          sha: raw.sha ?? '', filename: patchInfo.new_path ?? raw.filename, previous_filename: renamed ? patchInfo.old_path : undefined,
          status: patchInfo.deleted_file || raw.status === 'deleted' ? 'removed' : patchInfo.new_file || raw.status === 'added' ? 'added' : renamed ? 'renamed' : 'modified',
          additions: Number(raw.additions ?? 0) || 0, deletions: Number(raw.deletions ?? 0) || 0,
           changes: (Number(raw.additions ?? 0) || 0) + (Number(raw.deletions ?? 0) || 0),
          patch: patchIsObject ? (typeof patchInfo.diff === 'string' ? patchInfo.diff : undefined) : (typeof raw.patch === 'string' ? raw.patch : undefined),
        };
      }),
      truncated: files.length >= 300,
    };
  }

  /** Gitee 的 PR 评论都在同一列表：带 position 的是行内评论，不带的是对话区评论 */
  private async pullComments(owner: string, repo: string, number: number): Promise<any[]> {
    return this.pages<any>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${number}/comments`);
  }

  /** 行内评审评论（锚定在 diff 行上的那些） */
  async getPullRequestReviewComments(owner: string, repo: string, number: number): Promise<CollaborationReviewComment[]> {
    return (await this.pullComments(owner, repo, number)).filter(raw => raw.position).map(raw => ({
      ...raw, path: raw.path, side: 'RIGHT', line: raw.position || null, original_line: raw.position || null,
    }));
  }

  /** PR 对话区评论（无 position 的那些） */
  async getPullRequestIssueComments(owner: string, repo: string, pullNumber: number): Promise<CollaborationIssueComment[]> {
    return (await this.pullComments(owner, repo, pullNumber)).filter(raw => !raw.position);
  }

  /**
   * 提交评审：Gitee 无 request_changes（manifest 未声明，前端不会发）；
   * APPROVE 走 POST review；行内评论先逐条落到 PR comments，再提交审查通过。
   */
  async createPullRequestReview(owner: string, repo: string, number: number, params: CreateReviewParams): Promise<CollaborationPullRequestReview> {
    if (params.event === 'REQUEST_CHANGES') throw new Error('Gitee does not support request-changes reviews');
    for (const comment of params.comments ?? []) {
      await this.request<any>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${number}/comments`, 'POST', {
        body: comment.body, path: comment.path, position: comment.line,
      });
    }
    if (params.event === 'APPROVE') {
      await this.request<any>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${number}/review`, 'POST', params.body ? { body: params.body } : {});
    } else if (params.body) {
      await this.request<any>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${number}/comments`, 'POST', { body: params.body });
    }
    return { id: Date.now(), user: { login: '' }, state: params.event === 'APPROVE' ? 'APPROVED' : 'COMMENTED', body: params.body || '', submitted_at: new Date().toISOString() };
  }

  async createPullRequest(owner: string, repo: string, params: { title: string; head: string; headRepo?: string; base: string; body?: string; draft?: boolean }): Promise<CollaborationPullRequest> {
    return normalizePull(await this.request<any>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`, 'POST', {
      title: params.title, head: params.head, base: params.base, body: params.body ?? '',
    }));
  }

  /** Gitee 合并是 PUT（非 GitHub 的 POST）；支持 merge/squash/rebase */
  async mergePullRequest(owner: string, repo: string, number: number, options?: { mergeMethod?: 'merge' | 'squash' | 'rebase'; expectedHeadSha?: string; commitTitle?: string; commitMessage?: string }) {
    const response = await this.request<any>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${number}/merge`, 'PUT', {
      merge_method: options?.mergeMethod ?? 'merge',
      ...(options?.commitTitle ? { title: options.commitTitle } : {}),
      ...(options?.commitMessage ? { description: options.commitMessage } : {}),
    });
    return { merged: true, message: typeof response === 'string' ? response : 'Merged' };
  }

  async updatePullRequestState(owner: string, repo: string, pullNumber: number, state: 'closed' | 'open'): Promise<CollaborationPullRequest> {
    return normalizePull(await this.request<any>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${pullNumber}`, 'PATCH', { state }));
  }
}
