/**
 * PR Review 流测试（T2）：
 * (a) getPullRequestFiles 分页聚合与 >300 截断标记；
 * (b) createPullRequestReview 请求体（event 枚举、comments 的 path/side/line/body）
 *     与 REQUEST_CHANGES 缺 body 的前端校验拒绝（不发请求）；
 * (c) 401/403 权限降级（纯函数 resolveReviewCapability/isAuthDeniedError + 服务错误归一 + 组件降级渲染）；
 * (d) 时间线合并排序纯函数 mergeTimeline；
 * (e) patch 文本解析纯函数 parsePatch（add/del/context/hunk 头/+++ ---/No newline）。
 * 组件测试用 react-test-renderer（ModalSurface/Radix Tabs/ScrollArea 以 test-stub 替换）。
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import React from 'react';
import { create, act } from 'react-test-renderer';

const root = process.cwd(), originalFetch = globalThis.fetch;
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
let app, tmp;

const TABS_STUB = `
const React = require('react');
const Ctx = React.createContext(null);
exports.Root = ({ value, onValueChange, children }) => React.createElement(Ctx.Provider, { value: { value, onValueChange } }, children);
exports.List = ({ children, ...rest }) => React.createElement('div', { ...rest, role: 'tablist' }, children);
exports.Trigger = ({ value, children, ...rest }) => {
  const ctx = React.useContext(Ctx);
  return React.createElement('button', { ...rest, type: 'button', 'data-state': ctx && ctx.value === value ? 'active' : 'inactive', onClick: () => ctx && ctx.onValueChange(value) }, children);
};
exports.Content = ({ value, children, ...rest }) => {
  const ctx = React.useContext(Ctx);
  if (!ctx || ctx.value !== value) return null;
  return React.createElement('div', { ...rest, role: 'tabpanel', 'data-state': 'active' }, children);
};
`;

before(async () => {
  tmp = await fs.mkdtemp(path.join(root, '.test-tmp-pr-review-'));
  const bundle = path.join(tmp, 'pr-review.cjs');
  await build({
    stdin: {
      contents: [
        `export { githubService, GitHubApiError, PR_FILES_SOFT_LIMIT } from './src/services/github/GitHubService';`,
        `export { parsePatch, mergeTimeline, validateReviewSubmission, resolveReviewCapability, isAuthDeniedError } from './src/features/pr/prReviewLogic';`,
        `export { PullRequestDetailModal } from './src/features/pr/PullRequestDetailModal';`,
        `export { useToastStore } from './src/stores/toastStore';`,
      ].join('\n'),
      resolveDir: root,
    },
    bundle: true, platform: 'node', format: 'cjs', outfile: bundle,
    external: ['react', 'react-dom'],
    alias: { '@': path.join(root, 'src') }, logLevel: 'silent',
    plugins: [{
      name: 'headless-pr-review',
      setup(build) {
        build.onResolve({ filter: /^@radix-ui\/react-tabs$/ }, () => ({ path: 'tabs', namespace: 'test-tabs' }));
        build.onLoad({ filter: /.*/, namespace: 'test-tabs' }, () => ({ contents: TABS_STUB, loader: 'js' }));
        build.onLoad({ filter: /ModalSurface\.tsx$/ }, () => ({ contents: 'export function ModalSurface({ children }) { return children; }', loader: 'jsx' }));
        build.onLoad({ filter: /scroll-area\.tsx$/ }, () => ({ contents: 'import React from "react"; export function ScrollArea({ children }) { return <div>{children}</div>; }', loader: 'jsx' }));
      },
    }],
  });
  app = createRequire(import.meta.url)(bundle);
});

after(async () => {
  globalThis.fetch = originalFetch; delete globalThis.window;
  if (tmp && path.dirname(tmp) === root && path.basename(tmp).startsWith('.test-tmp-pr-review-')) await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5 });
});

const flush = () => new Promise(resolve => setImmediate(resolve));
const textOf = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(textOf).join('') : node && node.props ? textOf(node.props.children) : '';

/** 模拟分页响应的服务器：pages 为每页文件数组 */
const serveFilePages = pages => {
  const calls = [];
  globalThis.fetch = async url => {
    calls.push(String(url));
    const page = Number(new URL(url).searchParams.get('page') || 1);
    const link = page < pages.length ? `<https://api.github.com/repos/o/r/pulls/7/files?per_page=100&page=${page + 1}>; rel="next"` : '';
    return new Response(JSON.stringify(pages[page - 1].map(i => ({ sha: `s${page}-${i}`, filename: `f${page}-${i}.ts`, status: 'modified', additions: 1, deletions: 0, changes: 1 }))), { headers: link ? { link } : {} });
  };
  return calls;
};

const range = n => [...Array(n).keys()];

// ---------------------------------------------------------------------------
// (a) files 分页聚合与 >300 截断标记
// ---------------------------------------------------------------------------

test('getPullRequestFiles aggregates pages and flags more than 300 files as truncated', async () => {
  try {
    let calls = serveFilePages([range(100), range(100)]);
    let result = await app.githubService.getPullRequestFiles('o', 'r', 7);
    assert.equal(result.files.length, 200);
    assert.equal(result.truncated, false, '200 files is within the soft limit');
    assert.equal(result.files[0].filename, 'f1-0.ts');
    assert.equal(result.files[199].filename, 'f2-99.ts', 'pages are concatenated in order');
    assert.equal(calls.length, 2);
    assert.ok(calls[0].includes('/pulls/7/files?per_page=100'));
    assert.ok(calls[1].includes('page=2'), 'follows the link header');
    for (const call of calls) assert.ok(call.startsWith('https://api.github.com/'), call);

    calls = serveFilePages([range(100), range(100), range(100), range(100)]);
    result = await app.githubService.getPullRequestFiles('o', 'r', 7);
    assert.equal(result.files.length, 400);
    assert.equal(result.truncated, true, 'more than 300 files must be flagged as truncated');
  } finally { globalThis.fetch = originalFetch; }
});

test('getPullRequestFiles stops at the caller page cap (consistent pagination convention)', async () => {
  try {
    const calls = serveFilePages(range(20).map(() => range(100)));
    const result = await app.githubService.getPullRequestFiles('o', 'r', 7, 3);
    assert.equal(calls.length, 3);
    assert.equal(result.files.length, 300);
    assert.equal(result.truncated, false, 'exactly 300 files is not beyond the soft limit');
  } finally { globalThis.fetch = originalFetch; }
});

// ---------------------------------------------------------------------------
// (b) createPullRequestReview 请求体与前端校验
// ---------------------------------------------------------------------------

test('createPullRequestReview posts the event, body and anchored comments', async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ id: 9, user: { login: 'r' }, state: 'APPROVED', body: 'ship it', submitted_at: '2026-01-04T00:00:00Z' }));
  };
  try {
    await app.githubService.createPullRequestReview('o', 'r', 7, {
      event: 'APPROVE',
      body: 'ship it',
      comments: [
        { path: 'src/a.ts', side: 'RIGHT', line: 12, body: 'rename this' },
        { path: 'src/b.ts', side: 'LEFT', line: 3, body: 'why removed' },
        { path: 'src/c.ts', body: 'general note' },
      ],
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].init.method, 'POST');
    assert.match(calls[0].url, /\/repos\/o\/r\/pulls\/7\/reviews$/);
    assert.ok(calls[0].init.signal instanceof AbortSignal, '20s timeout signal required');
    const body = JSON.parse(calls[0].init.body);
    assert.equal(body.event, 'APPROVE');
    assert.equal(body.body, 'ship it');
    assert.deepEqual(body.comments, [
      { path: 'src/a.ts', body: 'rename this', line: 12, side: 'RIGHT' },
      { path: 'src/b.ts', body: 'why removed', line: 3, side: 'LEFT' },
      { path: 'src/c.ts', body: 'general note' },
    ]);
  } finally { globalThis.fetch = originalFetch; }
});

test('createPullRequestReview rejects unknown events before any request is sent', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response('{}'); };
  try {
    await assert.rejects(
      app.githubService.createPullRequestReview('o', 'r', 7, { event: 'MERGE' }),
      error => error.name === 'GitHubApiError' && error.status === 400
    );
    assert.equal(calls, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test('validateReviewSubmission blocks REQUEST_CHANGES without body and empty comment drafts', () => {
  assert.equal(app.validateReviewSubmission('APPROVE', '', []), null);
  assert.equal(app.validateReviewSubmission('COMMENT', 'note', []), null);
  assert.equal(app.validateReviewSubmission('REQUEST_CHANGES', '   ', []), 'prReview.changesNeedBody');
  assert.equal(app.validateReviewSubmission('REQUEST_CHANGES', 'please fix x', [{ body: 'rename' }]), null);
  assert.equal(app.validateReviewSubmission('COMMENT', '', [{ body: '' }]), 'prReview.commentEmpty');
  assert.equal(app.validateReviewSubmission('MERGE', '', []), 'prReview.invalidEvent');
});

// ---------------------------------------------------------------------------
// (c) 401/403 权限降级
// ---------------------------------------------------------------------------

test('timeline endpoints normalize 401/403 into GitHubApiError for degradation', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ message: 'Bad credentials' }), { status: 401 });
  try {
    for (const call of [
      () => app.githubService.getPullRequestReviews('o', 'r', 7),
      () => app.githubService.getPullRequestReviewComments('o', 'r', 7),
      () => app.githubService.getPullRequestIssueComments('o', 'r', 7),
      () => app.githubService.getPullRequestFiles('o', 'r', 7),
    ]) {
      await assert.rejects(call(), error => error.name === 'GitHubApiError' && error.status === 401);
    }
  } finally { globalThis.fetch = originalFetch; }
});

test('resolveReviewCapability degrades merged/closed/forbidden PRs and isAuthDeniedError recognizes 401/403', () => {
  assert.deepEqual(app.resolveReviewCapability({ state: 'open', merged_at: null }, false), { canReview: true, reason: null });
  assert.deepEqual(app.resolveReviewCapability({ state: 'open', merged_at: null }, true), { canReview: false, reason: 'noPermission' });
  assert.deepEqual(app.resolveReviewCapability({ state: 'open', merged_at: '2026-01-03T00:00:00Z' }, false), { canReview: false, reason: 'readonlyMerged' });
  assert.deepEqual(app.resolveReviewCapability({ state: 'closed', merged_at: null }, false), { canReview: false, reason: 'readonlyClosed' });
  assert.equal(app.isAuthDeniedError(new app.GitHubApiError(403, 'Resource not accessible by integration')), true);
  assert.equal(app.isAuthDeniedError({ status: 401, message: 'x' }), true);
  assert.equal(app.isAuthDeniedError(new Error('HTTP 403: Forbidden')), true);
  assert.equal(app.isAuthDeniedError(new Error('HTTP 503')), false);
  assert.equal(app.isAuthDeniedError(null), false);
});

// ---------------------------------------------------------------------------
// (d) 时间线合并排序纯函数
// ---------------------------------------------------------------------------

test('mergeTimeline merges issue comments and reviews chronologically and drops pending reviews', () => {
  const merged = app.mergeTimeline(
    [
      { id: 11, user: { login: 'alice' }, body: 'first note', created_at: '2026-01-02T10:00:00Z', updated_at: '2026-01-02T10:00:00Z' },
      { id: 12, user: { login: 'bob' }, body: 'later note', created_at: '2026-01-03T09:00:00Z', updated_at: '2026-01-03T09:00:00Z' },
    ],
    [
      { id: 21, user: { login: 'carol' }, state: 'APPROVED', body: 'LGTM', submitted_at: '2026-01-02T18:00:00Z' },
      { id: 22, user: { login: 'dave' }, state: 'CHANGES_REQUESTED', body: 'nope', submitted_at: '2026-01-02T09:00:00Z' },
      { id: 23, user: { login: 'eve' }, state: 'PENDING', body: 'draft', submitted_at: null },
    ]
  );
  assert.deepEqual(merged.map(entry => `${entry.kind}:${entry.id}`),
    ['review:22', 'issue-comment:11', 'review:21', 'issue-comment:12']);
  assert.equal(merged.some(entry => entry.state === 'PENDING'), false, 'pending reviews must not leak into the timeline');
  assert.equal(merged[3].user, 'bob');
  assert.equal(merged[0].state, 'CHANGES_REQUESTED');
  // 无效时间按 0 处理并以 id 兜底，不得抛异常
  const degenerate = app.mergeTimeline([{ id: 2, user: { login: 'a' }, body: '', created_at: '', updated_at: '' }], [{ id: 1, user: { login: 'b' }, state: 'COMMENTED', body: '', submitted_at: 'not-a-date' }]);
  assert.deepEqual(degenerate.map(entry => entry.id), [1, 2]);
});

// ---------------------------------------------------------------------------
// (e) patch 文本解析纯函数
// ---------------------------------------------------------------------------

test('parsePatch classifies file headers, hunks, add/del/context and no-newline markers', () => {
  const patch = [
    '--- a/src/a.ts',
    '+++ b/src/a.ts',
    '@@ -1,3 +1,4 @@',
    ' context one',
    '-deleted line',
    '+added line',
    ' context two',
    '\\ No newline at end of file',
    '@@ -10,2 +11,2 @@',
    '+tail add',
  ].join('\n');
  const lines = app.parsePatch(patch);
  assert.deepEqual(lines.map(line => line.type),
    ['meta', 'meta', 'hunk', 'context', 'del', 'add', 'context', 'meta', 'hunk', 'add']);
  assert.deepEqual(lines[2].text, '@@ -1,3 +1,4 @@');
  assert.deepEqual(lines[3], { type: 'context', text: 'context one', oldLine: 1, newLine: 1 });
  assert.deepEqual(lines[4], { type: 'del', text: 'deleted line', oldLine: 2, newLine: null });
  assert.deepEqual(lines[5], { type: 'add', text: 'added line', oldLine: null, newLine: 2 });
  assert.deepEqual(lines[6], { type: 'context', text: 'context two', oldLine: 3, newLine: 3 });
  assert.equal(lines[7].text, '\\ No newline at end of file');
  assert.deepEqual(lines[8].oldLine, 10);
  assert.deepEqual(lines[8].newLine, 11, 'second hunk restarts numbering from its own header');
  assert.deepEqual(lines[9], { type: 'add', text: 'tail add', oldLine: null, newLine: 11 });
  assert.deepEqual(app.parsePatch(''), []);
  assert.deepEqual(app.parsePatch('Binary files differ'), [{ type: 'meta', text: 'Binary files differ', oldLine: null, newLine: null }]);
});

// ---------------------------------------------------------------------------
// 组件测试：弹窗交互流（react-test-renderer + stub 壳）
// ---------------------------------------------------------------------------

const prFixture = (overrides = {}) => ({
  id: 1, number: 7, title: 'Add review flow', state: 'open', merged_at: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00Z',
  body: 'PR description body', html_url: 'https://example.invalid/pr/7',
  user: { login: 'author', avatar_url: '' },
  head: { ref: 'feature', sha: 'h1', label: 'o:feature' },
  base: { ref: 'main', sha: 'b1' },
  labels: [], additions: 3, deletions: 1, changed_files: 1,
  ...overrides,
});

const diffFileFixture = {
  sha: 'abc', filename: 'src/demo.ts', status: 'modified', additions: 2, deletions: 1, changes: 3,
  patch: ['@@ -1,3 +1,4 @@', ' context one', '-deleted line', '+added line', ' context two', '\\ No newline at end of file'].join('\n'),
};

const reviewCommentFixture = {
  id: 500, path: 'src/demo.ts', side: 'RIGHT', line: 3, original_line: 3, in_reply_to_id: null,
  body: 'existing note', user: { login: 'carol' }, diff_hunk: '',
  created_at: '2026-01-02T00:00:00Z', updated_at: '2026-01-02T00:00:00Z',
};

/** 挂载弹窗并等待初始数据加载完成 */
async function mountModal(props) {
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(app.PullRequestDetailModal, props));
    await flush();
  });
  return renderer;
}

test('review modal supports inline drafts and submits REQUEST_CHANGES only with a body', async () => {
  const store = app.useToastStore;
  const original = {
    files: app.githubService.getPullRequestFiles,
    reviews: app.githubService.getPullRequestReviews,
    comments: app.githubService.getPullRequestReviewComments,
    issues: app.githubService.getPullRequestIssueComments,
    create: app.githubService.createPullRequestReview,
  };
  let createCalls = [];
  let reviewsFetches = 0;
  app.githubService.getPullRequestFiles = async () => ({ files: [diffFileFixture], truncated: false });
  app.githubService.getPullRequestReviews = async () => {
    reviewsFetches++;
    return reviewsFetches === 1
      ? [{ id: 21, user: { login: 'carol' }, state: 'APPROVED', body: 'LGTM', submitted_at: '2026-01-02T18:00:00Z' }]
      : [{ id: 21, user: { login: 'carol' }, state: 'APPROVED', body: 'LGTM', submitted_at: '2026-01-02T18:00:00Z' },
         { id: 30, user: { login: 'me' }, state: 'CHANGES_REQUESTED', body: '请修改', submitted_at: '2026-01-05T00:00:00Z' }];
  };
  app.githubService.getPullRequestReviewComments = async () => [reviewCommentFixture];
  app.githubService.getPullRequestIssueComments = async () => [{ id: 11, user: { login: 'alice' }, body: 'first note', created_at: '2026-01-02T10:00:00Z', updated_at: '2026-01-02T10:00:00Z' }];
  app.githubService.createPullRequestReview = async (...args) => { createCalls.push(args); return { id: 30 }; };

  let renderer;
  try {
    renderer = await mountModal({ pr: prFixture(), owner: 'o', repo: 'r', onClose() {} });

    // Conversation 默认页：issue comment 与 review 按时间合并渲染
    const entries = renderer.root.findAllByProps({ 'data-pr-timeline-entry': 'review' });
    assert.equal(entries.length, 1);
    assert.equal(renderer.root.findAllByProps({ 'data-pr-timeline-entry': 'issue-comment' }).length, 1);
    assert.match(JSON.stringify(renderer.toJSON()), /LGTM/);
    assert.match(JSON.stringify(renderer.toJSON()), /first note/);

    // 切到文件页并展开文件
    const filesTrigger = renderer.root.findAllByType('button').find(button => textOf(button) === '文件');
    await act(async () => filesTrigger.props.onClick());
    await act(async () => renderer.root.findByProps({ 'data-pr-file-row': 'src/demo.ts' }).props.onClick());

    // 已提交的行内评论锚点显示
    assert.equal(renderer.root.findAllByProps({ 'data-pr-review-comment': 500 }).length, 1);

    // 在第 3 行（context 行，RIGHT 侧）点击"评论"→ 内联输入框 → 添加草稿
    const commentButton = renderer.root.findByProps({ 'aria-label': '在第 3 行添加评论' });
    await act(async () => commentButton.props.onClick());
    renderer.root.findByProps({ 'data-pr-review-draft-input': 'true' });
    await act(async () => renderer.root.findByProps({ 'aria-label': '输入行内评论...' }).props.onChange({ target: { value: '请在注释里说明' } }));
    await act(async () => renderer.root.findByProps({ 'data-pr-add-draft': 'true' }).props.onClick());

    // 草稿锚点气泡 + 待提交徽标
    const drafts = renderer.root.findAll(node => node.props && typeof node.props['data-pr-review-draft'] === 'string');
    assert.equal(drafts.length, 1);
    assert.match(JSON.stringify(renderer.toJSON()), /1 条待提交评论/);

    // REQUEST_CHANGES 缺 body：前端校验拒绝，不发请求
    await act(async () => renderer.root.findByProps({ 'data-pr-review-event': 'REQUEST_CHANGES' }).props.onClick());
    await act(async () => renderer.root.findByProps({ 'data-pr-review-submit-button': 'true' }).props.onClick());
    await act(flush);
    assert.equal(createCalls.length, 0, 'blocked submissions must not reach the network');
    assert.match(JSON.stringify(renderer.toJSON()), /请求修改必须填写总评说明/);

    // 补上总评后提交成功：请求体正确、草稿清空、时间线刷新
    await act(async () => renderer.root.findByProps({ 'aria-label': '总评' }).props.onChange({ target: { value: '请修改' } }));
    await act(async () => renderer.root.findByProps({ 'data-pr-review-submit-button': 'true' }).props.onClick());
    await act(flush);
    assert.equal(createCalls.length, 1);
    assert.equal(createCalls[0][0], 'o');
    assert.equal(createCalls[0][1], 'r');
    assert.equal(createCalls[0][2], 7);
    assert.deepEqual(createCalls[0][3], {
      event: 'REQUEST_CHANGES',
      body: '请修改',
      comments: [{ path: 'src/demo.ts', side: 'RIGHT', line: 3, body: '请在注释里说明' }],
    });
    assert.equal(reviewsFetches, 2, 'timeline is refreshed after a successful submission');
    assert.equal(renderer.root.findAll(node => node.props && typeof node.props['data-pr-review-draft'] === 'string').length, 0, 'drafts are cleared after submission');
    assert.ok(store.getState().toasts.some(toast => toast.type === 'success'), 'success toast is shown');
  } finally {
    await act(async () => renderer?.unmount());
    Object.assign(app.githubService, original);
    app.useToastStore.setState({ toasts: [] });
  }
});

test('merged pull requests render read-only: no submission area and no comment buttons', async () => {
  const original = {
    files: app.githubService.getPullRequestFiles,
    reviews: app.githubService.getPullRequestReviews,
    comments: app.githubService.getPullRequestReviewComments,
    issues: app.githubService.getPullRequestIssueComments,
  };
  app.githubService.getPullRequestFiles = async () => ({ files: [diffFileFixture], truncated: false });
  app.githubService.getPullRequestReviews = async () => [];
  app.githubService.getPullRequestReviewComments = async () => [];
  app.githubService.getPullRequestIssueComments = async () => [];
  let renderer;
  try {
    renderer = await mountModal({ pr: prFixture({ merged_at: '2026-01-03T00:00:00Z' }), owner: 'o', repo: 'r', onClose() {} });
    assert.equal(renderer.root.findAllByProps({ 'data-pr-review-readonly': 'true' }).length, 1);
    assert.match(JSON.stringify(renderer.toJSON()), /已合并，评审区只读/);
    assert.equal(renderer.root.findAllByProps({ 'data-pr-review-submit': 'true' }).length, 0);

    const filesTrigger = renderer.root.findAllByType('button').find(button => textOf(button) === '文件');
    await act(async () => filesTrigger.props.onClick());
    await act(async () => renderer.root.findByProps({ 'data-pr-file-row': 'src/demo.ts' }).props.onClick());
    assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /在第 \d+ 行添加评论/, 'merged PRs must not offer inline comment buttons');
  } finally {
    await act(async () => renderer?.unmount());
    Object.assign(app.githubService, original);
  }
});

test('403 on timeline load hides the submission area and shows a readable permission hint', async () => {
  const original = {
    files: app.githubService.getPullRequestFiles,
    reviews: app.githubService.getPullRequestReviews,
    comments: app.githubService.getPullRequestReviewComments,
    issues: app.githubService.getPullRequestIssueComments,
  };
  app.githubService.getPullRequestFiles = async () => ({ files: [diffFileFixture], truncated: false });
  app.githubService.getPullRequestReviews = async () => { throw new app.GitHubApiError(403, 'Resource not accessible by integration'); };
  app.githubService.getPullRequestReviewComments = async () => { throw new app.GitHubApiError(403, 'Resource not accessible by integration'); };
  app.githubService.getPullRequestIssueComments = async () => [];
  let renderer;
  try {
    renderer = await mountModal({ pr: prFixture(), owner: 'o', repo: 'r', onClose() {} });
    assert.equal(renderer.root.findAllByProps({ 'data-pr-review-readonly': 'true' }).length, 1);
    assert.match(JSON.stringify(renderer.toJSON()), /无权限提交评审/);
    assert.equal(renderer.root.findAllByProps({ 'data-pr-review-submit': 'true' }).length, 0);
  } finally {
    await act(async () => renderer?.unmount());
    Object.assign(app.githubService, original);
  }
});
