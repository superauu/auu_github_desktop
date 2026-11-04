/** Linear GraphQL API 到工作域任务契约的唯一转换边界。 */
import { providerHttpRequest } from '@/services/http/providerHttp';
import { ProviderApiError } from '@/services/collaboration/client';
import type { CollaborationUser } from '@/services/collaboration/types';
import type {
  CollaborationIssue, CollaborationLabel, IssueInput, IssueListOptions,
  IssueSearchResult, IssueTimelineEvent, IssueUser,
} from '@/services/collaboration/issueTypes';
import type { CollaborationIssueComment } from '@/services/collaboration/reviewTypes';

const API_URL = 'https://api.linear.app/graphql';
const PAGE_SIZE = 30;
const MAX_PAGES = 10;

/** Linear 的 id 是 UUID，工作域契约用数字 id：对 uuid 取稳定正整数哈希即可，展示键由 identifier 承担。 */
function numericId(uuid: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < uuid.length; index++) {
    hash ^= uuid.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 1;
}

const person = (raw: any): IssueUser => ({ login: raw?.displayName || raw?.name || '', avatar_url: raw?.avatarUrl ?? '' });
const bareColor = (color: string | null | undefined) => (color ?? '808080').replace(/^#/, '');

const ISSUE_FIELDS = `
  id identifier number title description url createdAt updatedAt completedAt canceledAt
  state { type name }
  creator { displayName name avatarUrl }
  labels { nodes { id name color } }
  assignees { nodes { displayName name avatarUrl } }
  comments(first: 50) { nodes { id } }
`;
const stateReason = (type: string | null | undefined) =>
  type === 'canceled' ? 'not_planned' : type === 'completed' ? 'completed' : null;

function issue(raw: any): CollaborationIssue {
  const stateType: string | undefined = raw?.state?.type;
  return {
    id: numericId(raw.id), number: raw.number, identifier: raw.identifier,
    title: raw.title, body: raw.description ?? null,
    state: stateType === 'completed' || stateType === 'canceled' ? 'closed' : 'open',
    state_reason: stateReason(stateType), html_url: raw.url ?? '',
    user: person(raw.creator), labels: (raw.labels?.nodes ?? []).map((label: any) => ({ id: numericId(label.id), name: label.name, color: bareColor(label.color) })),
    assignees: (raw.assignees?.nodes ?? []).map(person),
    comments: raw.comments?.nodes?.length ?? 0,
    created_at: raw.createdAt, updated_at: raw.updatedAt, closed_at: raw.completedAt ?? raw.canceledAt ?? null,
    locked: false,
  };
}

export class LinearClient {
  constructor(private token: string | null = null) { }
  setToken(token: string | null) { this.token = token; }

  private async request<T = any>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const response = await providerHttpRequest('POST', API_URL, {
      ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}), 'Content-Type': 'application/json',
    }, JSON.stringify({ query, variables: variables ?? {} }));
    if (response.status < 200 || response.status >= 300) {
      // GraphQL 网关的鉴权失败以 HTTP 状态区分；其余非 2xx 原样透出状态码。
      throw new ProviderApiError(response.status, `Linear ${response.status}: ${response.body.slice(0, 300)}`);
    }
    let payload: any;
    try { payload = JSON.parse(response.body); } catch { throw new ProviderApiError(500, 'Linear API returned non-JSON body'); }
    if (payload.errors?.length) {
      const message = String(payload.errors[0]?.message ?? 'Unknown GraphQL error');
      // 令牌失效/撤销在 GraphQL 层以 UNAUTHORIZED 报告，统一按 401 交给上层触发刷新。
      const unauthorized = /unauthorized|invalid.*token|expired/i.test(message) || payload.errors[0]?.extensions?.code === 'UNAUTHORIZED';
      throw new ProviderApiError(unauthorized ? 401 : 400, `Linear: ${message}`);
    }
    return payload.data as T;
  }

  async verifyToken(token: string): Promise<CollaborationUser> {
    const previous = this.token; this.token = token;
    try {
      const raw = (await this.request('query { viewer { id name displayName email avatarUrl url } }')).viewer;
      return { login: raw.displayName || raw.name || 'linear', id: numericId(raw.id), avatar_url: raw.avatarUrl ?? '',
        name: raw.displayName || raw.name, email: raw.email ?? null, bio: null, public_repos: 0, html_url: raw.url ?? 'https://linear.app' };
    } finally { this.token = previous; }
  }

  private async teams(): Promise<{ id: string; key: string; name: string }[]> {
    const raw = await this.request('query { teams(first: 50) { nodes { id key name } } }');
    return raw.teams?.nodes ?? [];
  }

  private async labelsByTeam(name: string): Promise<string | null> {
    const raw = await this.request('query { issueLabels(first: 100) { nodes { id name } } }');
    return raw.issueLabels?.nodes?.find((label: any) => label.name === name)?.id ?? null;
  }

  private async userId(displayName: string): Promise<string | null> {
    // organization.users 是 UserConnection：接受 first，但不接受 enabled（曾误报 Unknown argument）。
    const raw = await this.request('query { organization { users(first: 100) { nodes { id displayName name } } } }');
    return raw.organization?.users?.nodes?.find((member: any) => (member.displayName || member.name) === displayName)?.id ?? null;
  }

  async searchIssues(owner: string, _repo: string, options: IssueListOptions): Promise<IssueSearchResult> {
    // Linear 是工作区作用域：owner 若是已知团队键则收窄到团队，否则全工作区。
    const stateFilter = options.state === 'open' ? { state: { type: { nin: ['completed', 'canceled'] } } }
      : options.state === 'closed' ? { state: { type: { in: ['completed', 'canceled'] } } } : {};
    const query = options.query ? { or: [
      { title: { contains: options.query } }, { description: { contains: options.query } },
      { identifier: { eq: options.query.toUpperCase() } },
    ] } : {};
    const filter = {
      ...stateFilter, ...query,
      ...(owner && owner !== 'all' ? { team: { key: { eq: owner } } } : {}),
      ...(options.label ? { labels: { name: { eq: options.label } } } : {}),
      ...(options.assignee === '@me' ? { assignee: { isMe: { eq: true } } }
        : options.assignee ? { assignee: { displayName: { eq: options.assignee } } } : {}),
    };
    // 光标分页：按页号一次性取到 30×page 条再切片，页深以 MAX_PAGES 兜底。
    const wanted = Math.min(options.page, MAX_PAGES) * PAGE_SIZE;
    const raw = await this.request(
      `query ($filter: IssueFilter, $first: Int!) { issues(filter: $filter, first: $first, orderBy: updatedAt) {
        nodes { ${ISSUE_FIELDS} } pageInfo { hasNextPage } } }`,
      { filter, first: wanted },
    );
    const nodes: any[] = raw.issues?.nodes ?? [];
    const start = (options.page - 1) * PAGE_SIZE;
    const items = nodes.slice(start, start + PAGE_SIZE).map(issue);
    const hasNext = raw.issues?.pageInfo?.hasNextPage ?? false;
    return { items, total_count: start + items.length + (hasNext && items.length === PAGE_SIZE ? 1 : 0), incomplete_results: false };
  }

  private async rawIssue(owner: string, number: number): Promise<any> {
    const raw = await this.request(
      `query ($filter: IssueFilter) { issues(filter: $filter, first: 1) { nodes { ${ISSUE_FIELDS} } } }`,
      { filter: { number: { eq: number }, ...(owner && owner !== 'all' ? { team: { key: { eq: owner } } } : {}) } },
    );
    const found = raw.issues?.nodes?.[0];
    if (!found) throw new ProviderApiError(404, `Linear issue ${owner}#${number} not found`);
    return found;
  }

  async getIssue(owner: string, _repo: string, number: number): Promise<CollaborationIssue> {
    return issue(await this.rawIssue(owner, number));
  }

  async createIssue(owner: string, _repo: string, input: IssueInput): Promise<CollaborationIssue> {
    // MVP 限制：未选择团队时建到 owner 团队（未知则第一个团队），文档已注明。
    const teams = await this.teams();
    const team = teams.find(item => item.key === owner) ?? teams[0];
    if (!team) throw new ProviderApiError(400, 'Linear workspace has no teams');
    const labelIds: string[] = [];
    for (const name of input.labels ?? []) {
      const id = await this.labelsByTeam(name); if (id) labelIds.push(id);
    }
    const assigneeId = input.assignees?.[0] ? await this.userId(input.assignees[0]) : null;
    const raw = await this.request(
      `mutation ($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { ${ISSUE_FIELDS} } lastSyncId } }`,
      { input: { teamId: team.id, title: input.title, description: input.body ?? '', ...(labelIds.length ? { labelIds } : {}), ...(assigneeId ? { assigneeId } : {}) } },
    );
    if (!raw.issueCreate?.success || !raw.issueCreate.issue) throw new ProviderApiError(400, 'Linear issueCreate failed');
    return issue(raw.issueCreate.issue);
  }

  async updateIssue(owner: string, _repo: string, number: number, input: Partial<IssueInput> & { state?: 'open' | 'closed'; state_reason?: 'completed' | 'not_planned' | 'reopened' }): Promise<CollaborationIssue> {
    const current = await this.rawIssue(owner, number);
    const patch: Record<string, unknown> = {};
    if (input.title !== undefined) patch.title = input.title;
    if (input.body !== undefined) patch.description = input.body;
    if (input.state !== undefined || input.state_reason !== undefined) {
      // 状态迁移按状态类型选目标：completed/not_planned→completed/canceled 档，
      // open/reopened 回到首个未开始档（Linear 状态由工作区自定义，类型是稳定锚点）。
      const wantedType = input.state === 'closed'
        ? (input.state_reason === 'not_planned' ? 'canceled' : 'completed') : 'unstarted';
      const raw = await this.request(
        'query ($team: String!) { workflowStates(filter: { team: { key: { eq: $team } } }, first: 50) { nodes { id type name } } }',
        { team: current.team?.key ?? owner },
      );
      const states: any[] = raw.workflowStates?.nodes ?? [];
      const target = states.find(state => state.type === wantedType)
        ?? (input.state === 'closed' ? states.find(state => state.type === 'canceled' || state.type === 'completed') : null);
      if (!target) throw new ProviderApiError(400, `Linear team has no ${wantedType} state`);
      patch.stateId = target.id;
    }
    if (input.labels) {
      const labelIds: string[] = [];
      for (const name of input.labels) { const id = await this.labelsByTeam(name); if (id) labelIds.push(id); }
      patch.labelIds = labelIds;
    }
    if (input.assignees) {
      const assigneeId = input.assignees[0] ? await this.userId(input.assignees[0]) : null;
      patch.assigneeId = assigneeId;
    }
    if (Object.keys(patch).length) {
      await this.request('mutation ($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success } }',
        { id: current.id, input: patch });
    }
    return this.getIssue(owner, '', number);
  }

  async getIssueComments(owner: string, _repo: string, number: number): Promise<CollaborationIssueComment[]> {
    const raw = await this.request(
      `query ($filter: IssueFilter) { issues(filter: $filter, first: 1) { nodes {
        comments(first: 50, orderBy: createdAt) { nodes { id body createdAt updatedAt user { displayName name avatarUrl } } } } } }`,
      { filter: { number: { eq: number }, ...(owner && owner !== 'all' ? { team: { key: { eq: owner } } } : {}) } },
    );
    return (raw.issues?.nodes?.[0]?.comments?.nodes ?? []).map((comment: any) => ({
      id: numericId(comment.id), user: person(comment.user), body: comment.body,
      created_at: comment.createdAt, updated_at: comment.updatedAt,
    }));
  }

  async createIssueComment(owner: string, _repo: string, number: number, body: string): Promise<CollaborationIssueComment> {
    const current = await this.rawIssue(owner, number);
    const raw = await this.request(
      'mutation ($input: CommentCreateInput!) { commentCreate(input: $input) { success comment { id body createdAt updatedAt user { displayName name avatarUrl } } } }',
      { input: { issueId: current.id, body } },
    );
    if (!raw.commentCreate?.success || !raw.commentCreate.comment) throw new ProviderApiError(400, 'Linear commentCreate failed');
    const comment = raw.commentCreate.comment;
    return { id: numericId(comment.id), user: person(comment.user), body: comment.body, created_at: comment.createdAt, updated_at: comment.updatedAt };
  }

  /** Linear 无时间线实体：跨引用事件留空，评论走独立接口（MVP 已知限制）。 */
  async getIssueTimeline(_owner: string, _repo: string, _number: number): Promise<IssueTimelineEvent[]> { return []; }

  async getIssueLabels(_owner: string, _repo: string): Promise<CollaborationLabel[]> {
    const raw = await this.request('query { issueLabels(first: 100) { nodes { id name color description } } }');
    return (raw.issueLabels?.nodes ?? []).map((label: any) => ({ id: numericId(label.id), name: label.name, color: bareColor(label.color), description: label.description ?? null }));
  }

  async getIssueAssignees(owner: string, _repo: string): Promise<IssueUser[]> {
    // 团队键已知时收窄到团队成员，否则回组织全量用户。
    if (owner && owner !== 'all') {
      const raw = await this.request(
        'query ($key: String!) { team(key: $key) { members(first: 100) { nodes { displayName name avatarUrl } } } }',
        { key: owner },
      );
      if (raw.team) return (raw.team.members?.nodes ?? []).map(person);
    }
    const raw = await this.request('query { organization { users(first: 100) { nodes { displayName name avatarUrl } } } }');
    return (raw.organization?.users?.nodes ?? []).map(person);
  }
}
