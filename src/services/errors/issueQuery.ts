/**
 * 列表查询与徽标口径（PRD §7.2/§7.3）：作用域、来源、严重级别、搜索的纯过滤逻辑。
 * 合并列表排序统一按 lastSeen 倒序（缺失排最后）。
 */
import type { DomainId, NormalizedSeverity, UnifiedErrorIssue } from './types';

export type ErrorsScope = 'repo' | 'all';

export interface IssueQueryOptions {
  scope: ErrorsScope;
  /** 当前仓库键；scope=repo 时用映射决定项目白名单。 */
  repoKey: string | null;
  /** repoKey → 该仓库映射的项目 id 集合。 */
  mappedProjectIds: ReadonlySet<string>;
  /** 来源筛选：null = 全部来源（合并）；否则限定单条连接。 */
  connectionId: string | null;
  severity: NormalizedSeverity | 'all';
  search: string;
}

function inScope(issue: UnifiedErrorIssue, options: IssueQueryOptions): boolean {
  // 两个作用域都只显示映射过的项目（§7.2）："全部"= 所有仓库映射的并集，
  // "本仓库"= 当前仓库映射；白名单由 scopeProjectIds 按作用域构建。
  if (options.scope === 'repo' && !options.repoKey) return false;
  return options.mappedProjectIds.has(issue.externalProjectId);
}

export function filterIssues(issues: readonly UnifiedErrorIssue[], options: IssueQueryOptions): UnifiedErrorIssue[] {
  const search = options.search.trim().toLowerCase();
  return issues
    .filter((issue) => inScope(issue, options))
    .filter((issue) => (options.connectionId ? issue.connectionId === options.connectionId : true))
    .filter((issue) => (options.severity === 'all' ? true : issue.severity === options.severity))
    .filter((issue) =>
      search
        ? issue.title.toLowerCase().includes(search) ||
          (issue.shortId ?? '').toLowerCase().includes(search) ||
          (issue.message ?? '').toLowerCase().includes(search)
        : true,
    )
    .sort((a, b) => (b.lastSeen ?? '').localeCompare(a.lastSeen ?? ''));
}

/** 徽标口径（§7.1）：当前作用域内 unresolved 总数，导航层负责 99+ 截断。 */
export function countUnresolved(issues: readonly UnifiedErrorIssue[], options: IssueQueryOptions): number {
  return filterIssues(issues, options).filter((issue) => issue.status === 'unresolved').length;
}

/** 作用域可见的项目白名单：scope=repo 时取当前仓库映射，scope=all 时取全部映射。 */
export function scopeProjectIds(
  scope: ErrorsScope,
  repoKey: string | null,
  mappingsByRepo: Readonly<Record<string, { connectionId: string; externalProjectId: string }[]>>,
  connectionId: string | null,
): Set<string> {
  const result = new Set<string>();
  const buckets = scope === 'repo' && repoKey ? [mappingsByRepo[repoKey] ?? []] : Object.values(mappingsByRepo);
  for (const bucket of buckets) {
    for (const mapping of bucket) {
      if (connectionId && mapping.connectionId !== connectionId) continue;
      result.add(mapping.externalProjectId);
    }
  }
  return result;
}

/** 域存在性的徽标前置判断：无启用连接时徽标为 0（菜单本身也不显示）。 */
export function hasEnabledDomain(connections: readonly { enabled: boolean; domains: DomainId[] }[], domain: DomainId): boolean {
  return connections.some((connection) => connection.enabled && connection.domains.includes(domain));
}
