import { before, after, beforeEach, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import React from 'react';
import { create, act } from 'react-test-renderer';
import './react19-test-env.mjs';

const root = process.cwd();
let temporary, api, renderer, latest;
const scope = (key, isCurrent = () => true) => ({ key, source: key === 'repo' ? 'repo' : 'task', providerId: key, owner: 'fixture', repo: 'project', isCurrent });
const issue = number => ({ number, title: `Issue ${number}`, updated_at: '2026-11-04T00:00:00Z' });
const range = (start, count) => Array.from({ length: count }, (_, index) => issue(start + index));
const result = (items, total = items.length, incomplete = false) => ({ items, total_count: total, incomplete_results: incomplete });
const filters = { state: 'open', query: '', label: '', assignee: '' };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function Probe(props) { latest = api.useIssueList(props.scopes, props.filters ?? filters, props.refresh ?? 0); return null; }
const settle = () => new Promise(resolve => setTimeout(resolve, 380));
async function mount(scopes) {
  await act(async () => { renderer = create(React.createElement(Probe, { scopes })); });
  await act(settle);
}

before(async () => {
  temporary = await fs.mkdtemp(path.join(root, '.test-tmp-issue-list-'));
  const file = path.join(temporary, 'issue-list.cjs');
  await build({ entryPoints: [path.join(root, 'src/features/issues/useIssueList.ts')], outfile: file,
    bundle: true, platform: 'node', format: 'cjs', external: ['react'], alias: { '@': path.join(root, 'src') }, logLevel: 'silent',
    plugins: [{ name: 'issue-list-fixture-clients', setup(builder) {
      builder.onLoad({ filter: /services[\\/]integrations[\\/]taskService\.ts$/ }, () => ({ loader: 'js', contents: 'export const issueClientFor = provider => globalThis.__issueListFixtureClients[provider];' }));
    } }] });
  api = createRequire(import.meta.url)(file);
});
beforeEach(() => { globalThis.__issueListFixtureClients = {}; renderer = null; latest = null; });
afterEach(async () => { if (renderer) await act(async () => renderer.unmount()); delete globalThis.__issueListFixtureClients; });
after(async () => { if (temporary && path.dirname(temporary) === root && path.basename(temporary).startsWith('.test-tmp-issue-list-')) await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5 }); });

test('load more appends, deduplicates updated issues and stops after the last page', async () => {
  const calls = [];
  globalThis.__issueListFixtureClients.repo = { searchIssues: async (_owner, _repo, { page }) => {
    calls.push(page);
    return result(page === 1 ? range(1, 30) : page === 2 ? [{ ...issue(30), title: 'Updated issue' }, ...range(31, 29)] : range(60, 2), 61);
  } };
  await mount([scope('repo')]);
  assert.equal(latest.pages[0].items.length, 30);
  await act(async () => { await Promise.all([latest.loadMore(), latest.loadMore()]); });
  assert.deepEqual(calls, [1, 2]);
  assert.equal(latest.pages[0].items.length, 59);
  assert.equal(latest.pages[0].items.find(item => item.number === 30).title, 'Updated issue');
  await act(async () => { await latest.loadMore(); await latest.loadMore(); });
  assert.deepEqual(calls, [1, 2, 3]);
  assert.deepEqual(latest.pages[0].items.map(item => item.number), range(1, 61).map(item => item.number));
  assert.equal(latest.hasMore, false);
});

test('sources advance independently and a failed page is retried without skipping or refetching exhausted sources', async () => {
  const calls = { repo: [], task: [] };
  let fail = true;
  globalThis.__issueListFixtureClients.repo = { searchIssues: async (_owner, _repo, { page }) => {
    calls.repo.push(page);
    if (page === 2 && fail) { fail = false; throw new Error('Temporary source failure'); }
    return result(range((page - 1) * 30 + 1, page === 3 ? 5 : 30), 65);
  } };
  globalThis.__issueListFixtureClients.task = { searchIssues: async (_owner, _repo, { page }) => { calls.task.push(page); return result(range((page - 1) * 30 + 1, page === 1 ? 30 : 1), 31); } };
  await mount([scope('repo'), scope('task')]);
  await act(async () => { await latest.loadMore(); });
  assert.equal(latest.pages[0].items.length, 30);
  assert.match(latest.pages[0].error, /Temporary source failure/);
  assert.equal(latest.pages[1].items.length, 31);
  await act(async () => { await latest.retryFailed(); });
  assert.equal(latest.pages[0].error, undefined);
  await act(async () => { await latest.loadMore(); });
  assert.deepEqual(calls, { repo: [1, 2, 2, 3], task: [1, 2] });
  assert.equal(latest.pages[0].items.length, 65);
  assert.equal(latest.pages[1].items.length, 31);
  assert.equal(latest.hasMore, false);
});

test('a first-page source failure leaves successful sources visible and retry starts at page one', async () => {
  let attempts = 0;
  globalThis.__issueListFixtureClients.repo = { searchIssues: async () => result([issue(1)]) };
  globalThis.__issueListFixtureClients.task = { searchIssues: async (_owner, _repo, { page }) => { assert.equal(page, 1); if (++attempts === 1) throw new Error('Unavailable'); return result([issue(1)]); } };
  await mount([scope('repo'), scope('task')]);
  assert.equal(latest.pages[0].items.length, 1);
  assert.equal(latest.pages[1].items.length, 0);
  await act(async () => { await latest.retryFailed(); });
  assert.equal(latest.pages[0].items.length, 1);
  assert.equal(latest.pages[1].items.length, 1);
});

test('changing a filter discards an outstanding load-more reply and starts the new query at page one', async () => {
  const pending = deferred(), calls = [], scopes = [scope('repo')];
  globalThis.__issueListFixtureClients.repo = { searchIssues: async (_owner, _repo, options) => {
    calls.push([options.query, options.page]);
    if (options.query === 'new query') return result([issue(500)]);
    return options.page === 1 ? result(range(1, 30), 60) : pending.promise;
  } };
  await mount(scopes);
  let loading;
  await act(async () => { loading = latest.loadMore(); });
  await act(async () => renderer.update(React.createElement(Probe, { scopes, filters: { ...filters, query: 'new query' } })));
  await act(settle);
  await act(async () => { pending.resolve(result(range(31, 30), 60)); await loading; });
  assert.deepEqual(calls, [['', 1], ['', 2], ['new query', 1]]);
  assert.deepEqual(latest.pages[0].items.map(item => item.number), [500]);
  assert.equal(latest.loading, false);
});

test('changing the repository invalidates old page replies and refreshing restarts pagination', async () => {
  const pending = deferred(), oldScope = scope('repo'), nextScope = scope('other');
  globalThis.__issueListFixtureClients.repo = { searchIssues: async (_owner, _repo, { page }) => page === 1 ? result(range(1, 30), 60) : pending.promise };
  const calls = [];
  globalThis.__issueListFixtureClients.other = { searchIssues: async (_owner, _repo, { page }) => { calls.push(page); return result([issue(200)]); } };
  await mount([oldScope]);
  let loading;
  await act(async () => { loading = latest.loadMore(); });
  const scopes = [nextScope];
  await act(async () => renderer.update(React.createElement(Probe, { scopes })));
  await act(settle);
  await act(async () => { pending.resolve(result(range(31, 30), 60)); await loading; });
  assert.deepEqual(latest.pages[0].items.map(item => item.number), [200]);
  await act(async () => renderer.update(React.createElement(Probe, { scopes, refresh: 1 })));
  await act(settle);
  assert.deepEqual(calls, [1, 1]);
  assert.equal(latest.hasMore, false);
});

test('search limits bound appended data and incomplete results stay marked as incomplete', async () => {
  const calls = [];
  globalThis.__issueListFixtureClients.repo = { searchIssues: async (_owner, _repo, { page }) => { calls.push(page); return result(range((page - 1) * 30 + 1, 30), 1201, true); } };
  await mount([scope('repo')]);
  for (let page = 2; page <= 34; page++) await act(async () => { await latest.loadMore(); });
  await act(async () => { await latest.loadMore(); });
  assert.equal(calls.length, 34);
  assert.equal(latest.pages[0].items.length, 1000);
  assert.equal(latest.hasMore, false);
  assert.equal(latest.incomplete, true);
});
