import { ForgeApiError, type ForgePipeline, type ForgePipelineStatus, type ForgePullRequestDetail, type ForgePullRequest, type ForgePullState, type ForgeUser } from '@/services/forge/types';

/**
 * Gitea / Forgejo API v1 服务（API 形态接近 GitHub）。
 *
 * 认证：PAT（Authorization: token <PAT>）；服务器地址必填（自建为主）。
 * CI 状态走 commit combined status（Gitea Actions 的 runs API 版本差异大，
 * combined status 在各版本稳定可用）。
 */
const PER_PAGE = 30;

export function mapPipelineStatus(raw: string): ForgePipelineStatus {
  switch (raw) {
    case 'pending': return 'pending';
    case 'success': return 'success';
    case 'failure':
    case 'error': return 'failed';
    default: return 'running';
  }
}

export function mapPullState(state: string, merged: boolean): ForgePullState {
  if (merged) return 'merged';
  if (state === 'closed') return 'closed';
  return 'open';
}

export class GiteaService {
  private token: string | null = null;
  private server = '';

  configure(token: string | null, serverUrl: string) {
    this.token = token;
    this.server = serverUrl.trim().replace(/\/+$/, '');
  }

  private async request<T>(path: string, params?: Record<string, string>): Promise<T> {
    if (!this.server) throw new ForgeApiError(0, 'Gitea server URL is not configured');
    const url = new URL(`${this.server}/api/v1${path}`);
    for (const [key, value] of Object.entries(params || {})) url.searchParams.set(key, value);
    const headers: Record<string, string> = {};
    if (this.token) headers.Authorization = `token ${this.token}`;
    const res = await fetch(url.toString(), { headers });
    if (!res.ok) {
      throw new ForgeApiError(res.status, `Gitea API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    return res.json() as Promise<T>;
  }

  async verifyToken(): Promise<ForgeUser> {
    const user = await this.request<{ login: string; full_name?: string; avatar_url?: string }>('/user');
    return { login: user.login, name: user.full_name || user.login, avatarUrl: user.avatar_url };
  }

  async listPullRequests(owner: string, repo: string, state: 'open' | 'closed' | 'all' = 'open'): Promise<ForgePullRequest[]> {
    const items = await this.request<Array<{
      number: number; title: string; state: string; merged: boolean; draft?: boolean;
      base?: { ref?: string }; head?: { ref?: string };
      created_at: string; updated_at: string; html_url: string;
      user: { login: string };
    }>>(`/repos/${owner}/${repo}/pulls`, { state, limit: String(PER_PAGE) });
    return items.map((item) => ({
      number: item.number,
      title: item.title,
      author: item.user?.login ?? '',
      state: mapPullState(item.state, item.merged),
      draft: item.draft === true,
      sourceBranch: item.head?.ref ?? '',
      targetBranch: item.base?.ref ?? '',
      createdAt: item.created_at,
      updatedAt: item.updated_at,
      webUrl: item.html_url,
    }));
  }

  async getPullRequest(owner: string, repo: string, number: number): Promise<ForgePullRequestDetail> {
    const [pr, comments] = await Promise.all([
      this.request<{
        number: number; title: string; state: string; merged: boolean; draft?: boolean; body?: string;
        base?: { ref?: string }; head?: { ref?: string };
        created_at: string; updated_at: string; html_url: string;
        user: { login: string };
      }>(`/repos/${owner}/${repo}/pulls/${number}`),
      this.request<Array<{ id: number; body: string; created_at: string; user: { login: string } }>>(
        `/repos/${owner}/${repo}/issues/${number}/comments`,
        { limit: String(PER_PAGE) },
      ).catch(() => []),
    ]);
    return {
      number: pr.number,
      title: pr.title,
      author: pr.user?.login ?? '',
      state: mapPullState(pr.state, pr.merged),
      draft: pr.draft === true,
      sourceBranch: pr.head?.ref ?? '',
      targetBranch: pr.base?.ref ?? '',
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
      webUrl: pr.html_url,
      description: pr.body ?? '',
      comments: comments.map((comment) => ({ id: comment.id, author: comment.user?.login ?? '', body: comment.body, createdAt: comment.created_at })),
    };
  }

  /** 某个 ref 的 CI 状态（commit combined status：Gitea Actions / Drone / 其它 CI 汇聚点）。 */
  async listPipelines(owner: string, repo: string, ref: string): Promise<ForgePipeline[]> {
    const combined = await this.request<{
      statuses: Array<{ id?: number; context?: string; state: string; target_url?: string; created_at?: string }>;
    }>(`/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}/status`).catch(() => ({ statuses: [] }));
    return combined.statuses.map((status, index) => ({
      id: status.id ?? index,
      name: status.context ?? '',
      status: mapPipelineStatus(status.state),
      ref,
      createdAt: status.created_at ?? '',
      webUrl: status.target_url ?? '',
    }));
  }
}

export const giteaService = new GiteaService();
