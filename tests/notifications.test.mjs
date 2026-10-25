/**
 * T4 系统通知（NotificationService）单元测试：
 * (a) 会话去重：同一 watch 会话（head sha + 完成状态）只通知一次；
 * (b) document.hidden === false（窗口在前台）时不弹通知，且该会话被消费不补发；
 * (c) 节流：30 秒内同仓库同结论的通知合并，跨窗口/跨结论放行；
 * (d) 权限被拒（含插件 API 抛错）时静默停用、不抛错、不订阅 store。
 *
 * 全部使用注入的假 plugin API + 假 store：esbuild 把真实 NotificationService
 * 打包为 CJS，仅将 '@/stores/githubStore' 与 '@/i18n' 别名到桩模块，
 * 服务主体的去重/节流/门控逻辑走的是生产同一条代码路径。
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const root = process.cwd();

let tmp;
let service;

const i18nStub = `
const templates = {
  'notifications.ciSuccessTitle': 'All CI checks passed',
  'notifications.ciSuccessDesc': 'Watched checks finished for {repo}: {summary}',
  'notifications.ciFailureTitle': 'CI checks failed',
  'notifications.ciFailureDesc': 'Not all watched checks passed for {repo}: {summary}',
  'notifications.ciSummaryPassed': 'passed {passed}/{total}',
  'notifications.ciSummaryFailedNames': 'failed: {names}',
  'notifications.ciSummaryMore': '{count} more',
};
export const tNow = (key) => templates[key] ?? key;
`;

const storeStub = `
export const useGitHubStore = { subscribe: () => () => {} };
`;

/** 构造 GitHubCheckRun 形状的检查项。 */
const check = (status, conclusion, name) => ({
  id: 1, name, head_sha: 'x', status, conclusion, started_at: '', completed_at: null, html_url: '',
});

const SHA_A = 'aaaaaaaa01';
const SHA_B = 'aaaaaaaa02';
const SHA_C = 'aaaaaaaa03';
const SHA_D = 'aaaaaaaa04';

/** 假 plugin API：记录 sendNotification 调用与 onAction 回调。 */
function makePlugin({ granted = true, requestResult = 'granted', rejectCheck = false } = {}) {
  const sent = [];
  let actionCb = null;
  let unlistened = false;
  return {
    sent,
    get actionCb() { return actionCb; },
    get unlistened() { return unlistened; },
    api: {
      isPermissionGranted: async () => {
        if (rejectCheck) throw new Error('plugin unavailable');
        return granted;
      },
      requestPermission: async () => requestResult,
      sendNotification: (options) => { sent.push(options); },
      onAction: async (cb) => {
        actionCb = cb;
        return () => { unlistened = true; };
      },
    },
  };
}

/** 假 store：zustand v5 subscribe 语义（listener 收到 (state, prevState)）。 */
function makeStore() {
  const listeners = new Set();
  let state = { commitChecks: {}, currentOwner: 'octocat', currentRepoName: 'hello' };
  return {
    get state() { return state; },
    get listenerCount() { return listeners.size; },
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    setState: (patch) => {
      const prev = state;
      state = { ...state, ...patch };
      for (const listener of [...listeners]) listener(state, prev);
    },
  };
}

/** 组装 initNotifications 的注入 deps。 */
const makeDeps = ({ store, plugin, hidden, clock }) => ({
  isTauriEnv: () => true,
  isHidden: () => hidden(),
  now: () => clock(),
  subscribeStore: store.subscribe,
  plugin: plugin.api,
});

before(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'auugit-notifications-'));
  await fs.writeFile(path.join(tmp, 'i18nStub.ts'), i18nStub);
  await fs.writeFile(path.join(tmp, 'storeStub.ts'), storeStub);
  const bundle = path.join(tmp, 'notifications.cjs');
  await build({
    stdin: { contents: `export * from './src/services/notifications/NotificationService';`, resolveDir: root },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: bundle,
    alias: {
      '@/stores/githubStore': path.join(tmp, 'storeStub.ts'),
      '@/i18n': path.join(tmp, 'i18nStub.ts'),
    },
    external: ['@tauri-apps/plugin-notification', '@tauri-apps/api/*'],
    logLevel: 'silent',
  });
  service = createRequire(import.meta.url)(bundle);
});

after(async () => {
  if (tmp) await fs.rm(tmp, { recursive: true, force: true });
});

test('dedup: the same watch session (head sha + outcome) notifies exactly once', async () => {
  const hidden = () => true;
  const clock = () => 0;
  const store = makeStore();
  const plugin = makePlugin();
  const dispose = await service.initNotifications(makeDeps({ store, plugin, hidden, clock }));

  store.setState({ commitChecks: { [SHA_A]: [check('in_progress', null, 'build')] } });
  assert.equal(plugin.sent.length, 0, 'running snapshot alone must not notify');

  store.setState({ commitChecks: { [SHA_A]: [check('completed', 'success', 'build'), check('completed', 'success', 'test')] } });
  assert.equal(plugin.sent.length, 1, 'running -> completed(success) must notify once');
  assert.equal(plugin.sent[0].title, 'All CI checks passed');
  assert.match(plugin.sent[0].body, /octocat\/hello/);
  assert.match(plugin.sent[0].body, /passed 2\/2/);
  assert.match(plugin.sent[0].body, new RegExp(`${SHA_A.slice(0, 7)}`));

  // 重复推送同一份已完成快照（引用变化、内容相同）不得再通知。
  store.setState({ commitChecks: { [SHA_A]: [check('completed', 'success', 'build'), check('completed', 'success', 'test')] } });
  assert.equal(plugin.sent.length, 1);

  // 会话回退到 running 再一次完成：迁移事件再次出现，但同一 (sha, outcome) 已消费。
  store.setState({ commitChecks: { [SHA_A]: [check('in_progress', null, 'build'), check('completed', 'success', 'test')] } });
  store.setState({ commitChecks: { [SHA_A]: [check('completed', 'success', 'build'), check('completed', 'success', 'test')] } });
  assert.equal(plugin.sent.length, 1, 'a second completion of the same session must stay deduped');

  dispose();
});

test('visible window (document.hidden=false) suppresses notifications and consumes the session', async () => {
  let visible = true;
  const store = makeStore();
  const plugin = makePlugin();
  const dispose = await service.initNotifications(makeDeps({ store, plugin, hidden: () => !visible, clock: () => 0 }));

  store.setState({ commitChecks: { [SHA_A]: [check('in_progress', null, 'build')] } });
  store.setState({ commitChecks: { [SHA_A]: [check('completed', 'failure', 'build')] } });
  assert.equal(plugin.sent.length, 0, 'no notification while the window is focused');

  // 前台消费过的会话在窗口转入后台后也不补发（同一 sha + outcome 去重）。
  visible = false;
  store.setState({ commitChecks: { [SHA_A]: [check('in_progress', null, 'build')] } });
  store.setState({ commitChecks: { [SHA_A]: [check('completed', 'failure', 'build')] } });
  assert.equal(plugin.sent.length, 0, 'a session consumed in the foreground must not notify later');

  dispose();
});

test('throttle: same repo + outcome within 30s merges; new window or outcome passes', async () => {
  let now = 0;
  const store = makeStore();
  const plugin = makePlugin();
  const dispose = await service.initNotifications(makeDeps({ store, plugin, hidden: () => true, clock: () => now }));

  const complete = (sha, conclusion, name) => {
    store.setState({ commitChecks: { [sha]: [check('in_progress', null, name)] } });
    store.setState({ commitChecks: { [sha]: [check('completed', conclusion, name)] } });
  };

  complete(SHA_A, 'success', 'build');
  assert.equal(plugin.sent.length, 1);

  now = 10_000;
  complete(SHA_B, 'success', 'build');
  assert.equal(plugin.sent.length, 1, 'a second success within the 30s window is merged');

  now = 20_000;
  complete(SHA_C, 'failure', 'lint');
  assert.equal(plugin.sent.length, 2, 'a failure is a different outcome and is not merged');
  assert.equal(plugin.sent[1].title, 'CI checks failed');
  assert.match(plugin.sent[1].body, /failed: lint/);

  now = 40_000;
  complete(SHA_D, 'success', 'build');
  assert.equal(plugin.sent.length, 3, 'a success after the 30s window passes again');

  dispose();
});

test('permission denial (or plugin errors) disables silently without throwing', async () => {
  const store = makeStore();
  const plugin = makePlugin({ granted: false, requestResult: 'denied' });
  const dispose = await service.initNotifications(makeDeps({ store, plugin, hidden: () => true, clock: () => 0 }));
  assert.equal(typeof dispose, 'function');
  assert.equal(store.listenerCount, 0, 'disabled service must not subscribe to the store');

  store.setState({ commitChecks: { [SHA_A]: [check('completed', 'success', 'build')] } });
  assert.equal(plugin.sent.length, 0);
  dispose();

  // 插件 API 抛错同样静默停用。
  const store2 = makeStore();
  const plugin2 = makePlugin({ rejectCheck: true });
  const dispose2 = await service.initNotifications(makeDeps({ store: store2, plugin: plugin2, hidden: () => true, clock: () => 0 }));
  assert.equal(store2.listenerCount, 0);
  assert.equal(typeof dispose2, 'function');
  dispose2();
});

test('cleanup unsubscribes the store and unlistens the notification action listener', async () => {
  const store = makeStore();
  const plugin = makePlugin();
  const dispose = await service.initNotifications(makeDeps({ store, plugin, hidden: () => true, clock: () => 0 }));
  assert.equal(store.listenerCount, 1);
  assert.ok(plugin.actionCb, 'an action listener must be registered before notifications are sent');
  dispose();
  assert.equal(store.listenerCount, 0);
  assert.equal(plugin.unlistened, true);
});
