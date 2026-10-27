/**
 * 审查导航徽标 store 测试:refreshBadge 的四个分支
 * (无检查点 → null、checkpoint==HEAD → 0、变基失效 → null、正常 → rev-list 计数),
 * 以及非十六进制 headHash 直接短路。GitService 与周边依赖以 test-stub 替换。
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const root = process.cwd();
let app, tmp;

const GIT_SERVICE_STUB = `
const calls = [];
let responder = () => null;
export function __respond(fn) { responder = fn; }
export function __calls() { return calls; }
export function __reset(fn) { calls.length = 0; responder = fn || (() => null); }
export const gitService = {
  async isAncestor(repoPath, base, head) {
    calls.push(['isAncestor', base.slice(0, 4), head.slice(0, 4)]);
    const r = responder(['isAncestor']);
    if (r && r.throw) throw new Error('boom');
    return r ? r.ancestor : true;
  },
  async getRangeCommitCount(repoPath, base, head) {
    calls.push(['count', base.slice(0, 4), head.slice(0, 4)]);
    const r = responder(['count']);
    return r ? r.count : 3;
  },
};
`;
const CHECKPOINT_STUB = `
const points = new Map();
export function __setPoint(branch, hash) { points.set(branch, hash); }
export function __clear() { points.clear(); }
export const reviewCheckpointService = {
  async get(repoPath, branch) {
    const hash = points.get(branch);
    return hash ? { ref: 'refs/auugit/review/' + branch, hash } : null;
  },
  async set() {}, async clear() {},
};
`;
const I18N_STUB = `export const tNow = (key) => key; export const t = (key) => key;`;
const SETTINGS_STUB = `
export const useSettingsStore = { getState: () => ({ aiConfig: { provider: 'builtin', apiKey: '' }, language: 'zh' }) };
export {};
`;
const TOAST_STUB = `
const state = { toasts: [], addToast: (t) => { state.toasts.push(t); return 'id'; } };
export const useToastStore = { getState: () => state };
export const toast = { success: () => {}, error: () => {}, info: () => {}, warning: () => {} };
`;
const AI_STUBS = `
export async function requestAiText() { return '{}'; }
export async function awaitAiResponse(pending) { return pending; }
export const AI_REQUEST_TIMEOUT_MS = 60000;
export async function summarizeReviewRange() { return { overview: '', commits: [] }; }
export function parseReviewSummary() { return { overview: '', commits: [] }; }
`;

before(async () => {
  tmp = await fs.mkdtemp(path.join(root, '.test-tmp-review-badge-'));
  const bundle = path.join(tmp, 'review-badge.cjs');
  await build({
    stdin: {
      contents: [
        `export { useReviewStore } from './src/stores/reviewStore';`,
        `export { __setPoint, __clear } from '@/services/git/ReviewCheckpointService';`,
        `export { __respond, __calls, __reset } from '@/services/git/GitService';`,
      ].join('\n'),
      resolveDir: root,
    },
    bundle: true, platform: 'node', format: 'cjs', outfile: bundle,
    alias: { '@': path.join(root, 'src') }, logLevel: 'silent',
    plugins: [{
      name: 'headless-review-badge',
      setup(build) {
        const stub = (name, contents) => {
          build.onResolve({ filter: new RegExp(`^@/${name}$`) }, () => ({ path: name, namespace: 'stub' }));
          build.onLoad({ filter: /.*/, namespace: 'stub' }, (args) => {
            const map = {
              'i18n': I18N_STUB,
              'stores/settingsStore': SETTINGS_STUB,
              'stores/toastStore': TOAST_STUB,
              'services/git/GitService': GIT_SERVICE_STUB,
              'services/git/ReviewCheckpointService': CHECKPOINT_STUB,
              'services/ai/AiReviewSummaryService': AI_STUBS,
            };
            return { contents: map[args.path] ?? '', loader: 'js' };
          });
        };
        stub('i18n', I18N_STUB);
        stub('stores/settingsStore', SETTINGS_STUB);
        stub('stores/toastStore', TOAST_STUB);
        stub('services/git/GitService', GIT_SERVICE_STUB);
        stub('services/git/ReviewCheckpointService', CHECKPOINT_STUB);
        stub('services/ai/AiReviewSummaryService', AI_STUBS);
      },
    }],
  });
  app = createRequire(import.meta.url)(bundle);
});

after(async () => {
  if (tmp && path.dirname(tmp) === root && path.basename(tmp).startsWith('.test-tmp-review-badge-')) await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5 });
});

const HEAD = 'b'.repeat(40);
const BASE = 'a'.repeat(40);
const REPO = 'C:/repo';
const BR = 'main';

test('refreshBadge maps no checkpoint to null and equal HEAD to zero', async () => {
  const store = app.useReviewStore;
  app.__clear(); app.__reset();
  await store.getState().refreshBadge(REPO, BR, HEAD);
  assert.equal(store.getState().badgeCount, null);
  assert.deepEqual(app.__calls(), []);

  app.__setPoint(BR, HEAD); app.__reset();
  await store.getState().refreshBadge(REPO, BR, HEAD);
  assert.equal(store.getState().badgeCount, 0);
  assert.deepEqual(app.__calls(), [], 'equal HEAD short-circuits before any range query');
});

test('refreshBadge counts pending commits when the checkpoint is behind HEAD', async () => {
  const store = app.useReviewStore;
  app.__setPoint(BR, BASE);
  app.__reset(() => ({ ancestor: true, count: 5 }));
  await store.getState().refreshBadge(REPO, BR, HEAD);
  assert.equal(store.getState().badgeCount, 5);
  assert.deepEqual(app.__calls(), [['isAncestor', BASE.slice(0, 4), HEAD.slice(0, 4)], ['count', BASE.slice(0, 4), HEAD.slice(0, 4)]]);
});

test('refreshBadge maps a stale checkpoint to null', async () => {
  const store = app.useReviewStore;
  app.__setPoint(BR, BASE);
  app.__reset(() => ({ ancestor: false }));
  await store.getState().refreshBadge(REPO, BR, HEAD);
  assert.equal(store.getState().badgeCount, null, 'stale checkpoints must not show a count');
  assert.equal(app.__calls().length, 1, 'no count query runs for stale checkpoints');
});

test('refreshBadge maps git failures to null and short-circuits invalid head hashes', async () => {
  const store = app.useReviewStore;
  app.__setPoint(BR, BASE);
  app.__reset(() => ({ throw: true }));
  await store.getState().refreshBadge(REPO, BR, HEAD);
  assert.equal(store.getState().badgeCount, null);

  app.__reset();
  await store.getState().refreshBadge(REPO, BR, 'HEAD');
  assert.equal(app.__calls().length, 0, 'non-hex head must not touch git');
  await store.getState().refreshBadge(REPO, '', HEAD);
  assert.equal(app.__calls().length, 0, 'missing branch must not touch git');
});
