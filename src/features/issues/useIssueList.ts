import { useCallback, useEffect, useRef, useState } from 'react';
import type { CollaborationIssue, IssueListOptions } from '@/services/collaboration/issueTypes';
import { issueClientFor } from '@/services/integrations/taskService';
import type { IssueSourceScope } from './useIssueSource';

const PAGE_SIZE = 30;
const SEARCH_LIMIT = 1000;
interface SourcePage {
  scope: IssueSourceScope;
  items: CollaborationIssue[];
  total: number;
  nextPage: number;
  hasMore: boolean;
  incomplete: boolean;
  error?: string;
}
type Filters = Omit<IssueListOptions, 'page'>;
const emptyPage = (scope: IssueSourceScope): SourcePage => ({ scope, items: [], total: 0, nextPage: 1, hasMore: false, incomplete: false });

async function readPage(previous: SourcePage, filters: Filters): Promise<SourcePage> {
  const { scope, nextPage: page } = previous;
  try {
    const result = await issueClientFor(scope.providerId).searchIssues(scope.owner, scope.repo, { ...filters, page });
    // A source can move an issue between pages while it is being updated.
    // Replace repeated issues in place instead of adding a second selectable row.
    const items = [...new Map([...previous.items, ...result.items].map(issue => [issue.number, issue])).values()].slice(0, SEARCH_LIMIT);
    return { scope, items, total: Math.max(items.length, result.total_count), nextPage: page + 1,
      hasMore: result.items.length > 0 && page * PAGE_SIZE < Math.min(result.total_count, SEARCH_LIMIT),
      incomplete: result.incomplete_results || result.total_count > SEARCH_LIMIT };
  } catch (reason) {
    // Retain this source's page number so retry cannot skip the failed page.
    return { ...previous, error: String((reason as Error)?.message || reason) };
  }
}

/** Append pages independently for repository and task sources, like the errors list. */
export function useIssueList(scopes: IssueSourceScope[], { state, query, label, assignee }: Filters, refresh: number) {
  const [pages, setPages] = useState<SourcePage[]>([]);
  const [loading, setLoading] = useState(true);
  const current = useRef<SourcePage[]>([]);
  const generation = useRef(0);
  const busy = useRef(true);

  useEffect(() => {
    const request = ++generation.current;
    busy.current = true;
    setLoading(true);
    current.current = [];
    setPages([]);
    const timer = setTimeout(() => {
      void Promise.all(scopes.map(scope => readPage(emptyPage(scope), { state, query, label, assignee }))).then(result => {
        if (request !== generation.current || !scopes.every(scope => scope.isCurrent())) return;
        current.current = result;
        setPages(result);
        busy.current = false;
        setLoading(false);
      });
    }, 350);
    return () => { generation.current = request + 1; clearTimeout(timer); };
  }, [scopes, state, query, label, assignee, refresh]);

  const load = useCallback(async (onlyFailed: boolean) => {
    if (busy.current || !scopes.every(scope => scope.isCurrent())) return;
    const previous = current.current;
    const pending = previous.filter(page => onlyFailed ? !!page.error : page.hasMore || !!page.error);
    if (!pending.length) return;
    const request = generation.current;
    busy.current = true;
    setLoading(true);
    const result = await Promise.all(pending.map(page => readPage(page, { state, query, label, assignee })));
    if (request !== generation.current || !scopes.every(scope => scope.isCurrent())) return;
    const updates = new Map(result.map(page => [page.scope.key, page]));
    const next = previous.map(page => updates.get(page.scope.key) ?? page);
    current.current = next;
    setPages(next);
    busy.current = false;
    setLoading(false);
  }, [scopes, state, query, label, assignee]);

  return { pages, loading, hasMore: pages.some(page => page.hasMore), incomplete: pages.some(page => page.incomplete),
    loadMore: () => load(false), retryFailed: () => load(true) };
}
