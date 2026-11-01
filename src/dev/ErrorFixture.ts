/**
 * Development-only adapter for the Errors 页（?errors=1）。
 * 双连接场景：A 正常、B 同步失败（演示 §7.3.2 按连接降级横幅）；映射指向 fixture repoKey。
 * sync/loadRepoContext 打桩为同步注入；fetch 仅放行 Sentry 详情/堆栈/嫌疑提交的只读形状，
 * 其余一律回落原 fetch（外层 UiVisualFixture 已禁网）。
 */
import { useErrorsStore } from '@/stores/errorsStore';
import { useRepoStore } from '@/stores/repoStore';
import { storeIntegrationToken } from '@/services/errors/credentials';
import type { RepositoryInfo } from '@/services/git/types';
import type { UnifiedErrorIssue } from '@/services/errors/types';

const CONN_A = 'fixture-conn-alpha';
const CONN_B = 'fixture-conn-beta';
const REPO_KEY = 'fixture.com/auugit/demo';

function issue(partial: Partial<UnifiedErrorIssue> & { issueId: string; title: string; connectionId: string }): UnifiedErrorIssue {
  const base: UnifiedErrorIssue = {
    providerId: 'sentry',
    externalProjectId: partial.connectionId === CONN_A ? '101' : '201',
    severity: 'error',
    status: 'unresolved',
    eventCount: 1,
    externalUrl: `https://sentry.fixture.com/acme/demo/issues/${partial.issueId}/`,
    rawData: { fixture: true, id: partial.issueId },
    ...partial,
  };
  return base;
}

export function prepareErrorsFixture(repository: RepositoryInfo) {
  const minute = 60 * 1000;
  const iso = (offsetMs: number) => new Date(Date.now() - offsetMs).toISOString();
  const issues: UnifiedErrorIssue[] = [
    issue({ connectionId: CONN_A, issueId: '42', shortId: 'FRONTEND-ABC', title: 'TypeError: Cannot read properties of undefined (reading "id")', severity: 'critical', eventCount: 128, affectedUsers: 23, lastSeen: iso(2 * minute), firstSeen: iso(3 * 24 * 60 * minute), message: 'Cannot read properties of undefined' }),
    issue({ connectionId: CONN_A, issueId: '41', shortId: 'FRONTEND-A9', title: 'Unhandled promise rejection in fetchCheckoutSession', severity: 'error', eventCount: 46, lastSeen: iso(26 * minute), firstSeen: iso(2 * 24 * 60 * minute) }),
    issue({ connectionId: CONN_A, issueId: '40', shortId: 'FRONTEND-Z1', title: 'Warning: each child in a list should have a unique key', severity: 'warning', eventCount: 12, lastSeen: iso(5 * 60 * minute), firstSeen: iso(6 * 24 * 60 * minute) }),
    issue({ connectionId: CONN_A, issueId: '39', shortId: 'FRONTEND-K0', title: 'ResizeObserver loop limit exceeded', severity: 'info', status: 'resolved', rawStatus: 'resolved', eventCount: 3, lastSeen: iso(30 * 60 * minute) }),
    issue({ connectionId: CONN_B, issueId: '77', shortId: 'BACKEND-Q3', title: 'TimeoutError: waiting for db pool after 5000ms', severity: 'critical', eventCount: 301, affectedUsers: 57, lastSeen: iso(8 * minute), firstSeen: iso(10 * 24 * 60 * minute) }),
    issue({ connectionId: CONN_B, issueId: '76', shortId: 'BACKEND-D2', title: 'NullReferenceException in BillingService.charge', severity: 'error', eventCount: 88, lastSeen: iso(27 * 60 * minute), firstSeen: iso(4 * 24 * 60 * minute) }),
  ];

  const originalFetch = window.fetch;
  window.fetch = async (input, init) => {
    // git ls-files 桩：给堆栈跳转提供工作区文件清单（唯一/择优档可走通）
    if (input === '/api/git' && init?.method === 'POST' && typeof init.body === 'string') {
      const data = JSON.parse(init.body) as { cwd?: string; args?: string[] };
      if (data.cwd === repository.path && Array.isArray(data.args) && data.args.includes('ls-files')) {
        const files = ['package.json', 'src/lib/utils.ts', 'src/services/errors/types.ts', 'src/services/git/types.ts', 'other/utils.ts'];
        return new Response(JSON.stringify({ stdout: files.join('\n'), stderr: '', exitCode: 0 }), { headers: { 'Content-Type': 'application/json' } });
      }
    }
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const suspect = url.match(/\/api\/0\/issues\/[^/]+\/suspect-commits\/$/);
    if (suspect) {
      return new Response(
        JSON.stringify([{ commitId: 'c1', commit: { id: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', message: 'fix(billing): guard missing order data before charge', author: { name: 'Alice Dev' } }, repository: { name: 'acme/backend' } }]),
        { headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (/\/api\/0\/issues\/[^/]+\/events\/latest\/$/.test(url)) {
      return new Response(
        JSON.stringify({
          entries: [
            { type: 'exception', data: { values: [{ type: 'TypeError', value: 'boom', stacktrace: { frames: [
              { function: 'main', filename: 'package.json', lineno: 1, colno: 1 },
              { function: 'mapSentryIssue', filename: 'src/services/errors/types.ts', lineno: 96, colno: 3, context: [[95, '// 域注册表'], [96, 'export type DomainId'], [97, 'export interface DomainDefinition']] },
            ] } } ] } },
          ],
        }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    }
    return originalFetch(input, init);
  };

  useErrorsStore.setState({
    restored: true,
    connections: [
      { id: CONN_A, providerId: 'sentry', displayName: '公司 Sentry', enabled: true, orgId: 'acme', domains: ['error-tracking'] },
      { id: CONN_B, providerId: 'sentry', displayName: '个人 Sentry', enabled: true, orgId: 'personal', domains: ['error-tracking'] },
    ],
    runtime: {
      [CONN_A]: { health: 'connected', statusMessage: '' },
      [CONN_B]: { health: 'error', statusMessage: 'Internal Server Error' },
    },
    mappingsByRepo: {
      [REPO_KEY]: [
        { connectionId: CONN_A, externalProjectId: '101', externalProjectName: 'frontend' },
        { connectionId: CONN_B, externalProjectId: '201', externalProjectName: 'backend' },
      ],
    },
    // 预置一条链接：分支在 fixture 分支列表中不存在 → 演示 stale 展示（§5.3）
    linksByRepo: {
      [REPO_KEY]: [
        {
          id: 'fixture-link-1', connectionId: CONN_A, providerId: 'sentry', externalProjectId: '101',
          issueId: '42', shortId: 'FRONTEND-ABC', externalUrl: 'https://sentry.fixture.com/acme/demo/issues/42/',
          repoKey: REPO_KEY, branchNames: ['fix/sentry-FRONTEND-ABC-typeerror'],
          commitShas: ['a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'],
          pullRequests: [{ provider: 'github', number: 12, url: 'https://github.com/acme/demo/pull/12' }],
          createdAt: iso(24 * 60 * minute), updatedAt: iso(30 * minute),
        },
      ],
    },
    activeRepoKey: REPO_KEY,
    scope: 'repo',
    issues,
    nextCursors: { [CONN_A]: null, [CONN_B]: null },
    syncing: false,
    lastSyncedAt: Date.now(),
    syncErrors: { [CONN_B]: 'Internal Server Error' },
    sync: async () => {},
    loadMore: async () => {},
    // AppLayout 启动时也会调 restoreConnections——打桩避免覆盖注入的连接
    restoreConnections: () => {},
    loadRepoContext: () => useErrorsStore.setState({ activeRepoKey: REPO_KEY, activeRepoPath: repository.path }),
  });
  // dev 凭证（内存 Map）：详情窗格的堆栈/嫌疑提交请求需要它走 fetch 桩
  void storeIntegrationToken(CONN_A, 'fixture-token-a');
  void storeIntegrationToken(CONN_B, 'fixture-token-b');
  // 仅供 devtools/冒烟脚本检查状态（fixture 入口独有，不影响生产构建）
  (window as unknown as { __errorsStore?: typeof useErrorsStore }).__errorsStore = useErrorsStore;
  useRepoStore.setState({ activeTab: 'errors' });
}
