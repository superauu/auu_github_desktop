import { ForgeApiError, type ForgePipeline, type ForgePipelineStatus, type ForgePullRequestDetail, type ForgePullRequest, type ForgePullState, type ForgeUser } from '@/services/forge/types';

/**
 * GitLab REST v4 服务（gitlab.com 与自建 CE/极狐同构）。
 *
 * 认证：PAT（PRIVATE-TOKEN 头），凭据经 keyring 槽位 gitlab_token 持有。
 * 项目路径需整体 URL 编码（group/subgroup/repo 形态）。
 */
const DEFAULT_SERVER = 'https://gitlab.com';
const PER_PAGE = 30;
const REQUEST_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_PAGES = 10;

/** GitLab API 的流水线状态 → 归一化状态。 */
export function mapPipelineStatus(raw: string): ForgePipelineStatus {
  switch (raw) {
    case 'running': return 'running';
    case 'success': return 'success';
    case 'failed':
    case 'failed_with_warnings': return 'failed';
    case 'canceled': return 'canceled';
    default: return 'pending';
  }
}

/** GitLab MR 的 state → 归一化状态。 */
export function mapPullState(state: string): ForgePullState {
  if (state === 'merged') return 'merged';
  if (state === 'closed' || state === 'locked') return 'closed';
  return 'open';
}

export class GitLabService {
  private token: string | null = null;
  private server = DEFAULT_SERVER;

  configure(token: string | null, serverUrl?: string) {
    this.token = token;
    this.server = (serverUrl?.trim() || DEFAULT_SERVER).replace(/\/+$/, '');
  }

  private api(path: string, params?: Record<string, string>): string {
    const url = new URL(`${this.server}/api/v4${path}`);
    for (const [key, value] of Object.entries(params || {})) url.searchParams.set(key, value);
    return url.toString();
  }

  private async request<T>(path: string, params?: Record<string, string>): Promise<T> {
    const headers: Record<string, string> = {};
    if (this.token) headers['PRIVATE-TOKEN'] = this.token;
    const res = await fetch(this.api(path, params), { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!res.ok) {
      throw new ForgeApiError(res.status, `GitLab API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    return res.json() as Promise<T>;
  }

  /** 列表分页聚合：不足一页即止，DEFAULT_MAX_PAGES 封顶（与 GitHubService 同约定）。 */
  private async pages<T>(path: string, params?: Record<string, string>): Promise<T[]> {
    const result: T[] = [];
    for (let page = 1; page <= DEFAULT_MAX_PAGES; page++) {
      const chunk = await this.request<T[]>(path, { ...params, page: String(page), per_page: String(PER_PAGE) });
      result.push(...chunk);
      if (chunk.length < PER_PAGE) return result;
    }
    return result;
  }

  /** 校验 PAT 并返回当前用户。 */
  async verifyToken(): Promise<ForgeUser> {
    const user = await this.request<{ username: string; name: string; avatar_url?: string }>('/user');
    return { login: user.username, name: user.name, avatarUrl: user.avatar_url };
  }

  /** group/subgroup/repo 形态整体编码为项目路径。 */
  private projectPath(ownerPath: string, repo: string): string {
    return encodeURIComponent(`${ownerPath}/${repo}`);
  }

  /** 解析项目数字 id（后续 MR/流水线接口用）。 */
  async projectId(ownerPath: string, repo: string): Promise<number> {
    const project = await this.request<{ id: number }>(`/projects/${this.projectPath(ownerPath, repo)}`);
    return project.id;
  }

  async listPullRequests(projectId: number, state: 'opened' | 'closed' | 'merged' | 'all' = 'opened'): Promise<ForgePullRequest[]> {
    const items = await this.pages<{
      iid: number; title: string; state: string; draft: boolean;
      source_branch: string; target_branch: string; created_at: string; updated_at: string; web_url: string;
      author: { username: string };
    }>(`/projects/${projectId}/merge_requests`, { state });
    return items.map((item) => ({
      number: item.iid,
      title: item.title,
      author: item.author?.username ?? '',
      state: mapPullState(item.state),
      draft: item.draft,
      sourceBranch: item.source_branch,
      targetBranch: item.target_branch,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
      webUrl: item.web_url,
    }));
  }

  async getPullRequest(projectId: number, number: number): Promise<ForgePullRequestDetail> {
    const [mr, discussions] = await Promise.all([
      this.request<{
        iid: number; title: string; state: string; draft: boolean; description: string;
        source_branch: string; target_branch: string; created_at: string; updated_at: string; web_url: string;
        author: { username: string };
      }>(`/projects/${projectId}/merge_requests/${number}`),
      this.pages<{ id: string; notes: Array<{ id: number; body: string; system: boolean; created_at: string; author: { username: string } }> }>(
        `/projects/${projectId}/merge_requests/${number}/discussions`,
      ).catch(() => []),
    ]);
    return {
      number: mr.iid,
      title: mr.title,
      author: mr.author?.username ?? '',
      state: mapPullState(mr.state),
      draft: mr.draft,
      sourceBranch: mr.source_branch,
      targetBranch: mr.target_branch,
      createdAt: mr.created_at,
      updatedAt: mr.updated_at,
      webUrl: mr.web_url,
      description: mr.description ?? '',
      comments: discussions
        .flatMap((discussion) => discussion.notes)
        .filter((note) => !note.system)
        .map((note) => ({ id: note.id, author: note.author?.username ?? '', body: note.body, createdAt: note.created_at })),
    };
  }

  async listPipelines(projectId: number, ref?: string): Promise<ForgePipeline[]> {
    const items = await this.pages<{
      id: number; status: string; ref: string; created_at: string; web_url: string;
    }>(`/projects/${projectId}/pipelines`, ref ? { ref } : {});
    return items.map((item) => ({
      id: item.id,
      name: item.ref,
      status: mapPipelineStatus(item.status),
      ref: item.ref,
      createdAt: item.created_at,
      webUrl: item.web_url,
    }));
  }
}

export const gitlabService = new GitLabService();
