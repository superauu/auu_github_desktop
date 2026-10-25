/**
 * 多账号 Profile（T1）回归防线：
 * 1. 旧用户迁移：默认 Profile 沿用旧 keyring 条目（invoke 携带 profileId=null/'default'），登录后自动登记为 default Profile；
 * 2. token 按 Profile 隔离：store/get/delete 三个命令都携带 profileId，默认条目与其他 Profile 互不影响；
 * 3. switchProfile 清空 owner/repo 绑定并重新读取目标 Profile 的 token；
 * 4. addProfile → 登录成功落新 Profile，取消（cancelAddProfile）回退原账号；
 * 5. removeProfile 删除对应 keyring 条目；移除活跃 Profile 时自动切到剩余第一个；
 * 6. logout 走 removeProfile 同路径；持久化数据形状非法时安全回退到空态。
 */
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const root = process.cwd();
const saved = new Map();
const vault = new Map(); // 模拟 keyring：'default' 代表旧条目（profileId 缺省/'default'），其余按 profileId 隔离
let calls = [];
let app, tmp;

globalThis.localStorage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, String(value)), removeItem: key => saved.delete(key) };
globalThis.__auuInvoke = async (command, args = {}) => {
  calls.push({ command, args });
  const key = (!args.profileId || args.profileId === 'default') ? 'default' : args.profileId;
  if (command === 'store_github_token') { vault.set(key, args.token); return null; }
  if (command === 'get_github_token') return vault.get(key) ?? null;
  if (command === 'delete_github_token') { vault.delete(key); return null; }
  return null;
};
// 必须在 require 打包产物前安装 mock：store 模块初始化时会读 localStorage
globalThis.window = { __TAURI_INTERNALS__: {} };

const store = () => app.useGitHubStore.getState();
const eventually = async (fn, timeout = 2000) => {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > timeout) throw new Error('eventually: condition not met');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
};
const callsOf = command => calls.filter(call => call.command === command);

before(async () => {
  tmp = fs.mkdtempSync(path.join(root, '.test-tmp-profiles-'));
  const bundle = path.join(tmp, 'profiles.cjs');
  await build({
    stdin: { contents: `export { useGitHubStore, parseStoredProfiles, DEFAULT_PROFILE_ID } from './src/stores/githubStore'; export { githubService } from './src/services/github/GitHubService';`, resolveDir: root },
    bundle: true, platform: 'node', format: 'cjs', outfile: bundle, logLevel: 'silent',
    alias: { '@': path.join(root, 'src') },
    plugins: [{
      name: 'tauri-core-stub',
      setup(builder) {
        builder.onResolve({ filter: /^@tauri-apps\/api\/core$/ }, args => ({ path: args.path, namespace: 'tauri-core-stub' }));
        builder.onLoad({ filter: /.*/, namespace: 'tauri-core-stub' }, () => ({ contents: `export async function invoke(command, args) { return globalThis.__auuInvoke(command, args); }`, loader: 'js' }));
      },
    }],
  });
  app = createRequire(import.meta.url)(bundle);
  app.githubService.verifyToken = async token => ({ login: token === 'bob-token' ? 'bob' : 'alice', avatar_url: '' });
});

after(() => {
  delete globalThis.window;
  delete globalThis.__auuInvoke;
  app?.useGitHubStore.getState().clearRepo();
  vault.clear(); saved.clear();
  if (tmp && path.dirname(tmp) === root && path.basename(tmp).startsWith('.test-tmp-profiles-')) fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5 });
});

test('legacy token in the old keyring entry migrates into a default profile without copying', async () => {
  vault.set('default', 'legacy-token');
  await store().initAuth();
  assert.equal(store().isAuthenticated, true);
  assert.equal(store().token, 'legacy-token');
  assert.equal(store().user.login, 'alice');
  // 读取旧条目时 profileId 必须为 null（Rust 侧 None → 原条目 github_token）
  assert.deepEqual(callsOf('get_github_token').at(-1).args, { profileId: null });
  assert.deepEqual(store().profiles, [{ id: 'default', label: 'alice' }]);
  assert.equal(store().activeProfileId, 'default');
  assert.deepEqual(JSON.parse(saved.get('auu_git_profiles')), { version: 1, profiles: [{ id: 'default', label: 'alice' }], activeProfileId: 'default' });
});

test('addProfile starts a pending account and login stores its token under a separate keyring entry', async () => {
  app.useGitHubStore.setState({ currentOwner: 'work', currentRepoName: 'repo' });
  store().addProfile();
  const pendingId = store().activeProfileId;
  assert.match(pendingId, /^[0-9a-f]{32}$/);
  assert.notEqual(pendingId, 'default');
  assert.equal(store().isAddingProfile, true);
  assert.equal(store().addProfileReturnId, 'default');
  assert.equal(store().isAuthenticated, false);
  // 新 Profile 激活时必须清空既有 owner/repo 绑定
  assert.equal(store().currentOwner, null);
  assert.equal(store().currentRepoName, null);
  assert.equal(store().profiles.length, 2);

  calls = [];
  await store().login('bob-token');
  assert.equal(store().isAuthenticated, true);
  assert.equal(store().user.login, 'bob');
  assert.equal(store().isAddingProfile, false);
  assert.equal(store().addProfileReturnId, null);
  // 登录成功的 token 必须写入新 Profile 自己的 keyring 条目，默认条目原样保留
  assert.deepEqual(callsOf('store_github_token').at(-1).args, { token: 'bob-token', profileId: pendingId });
  assert.equal(vault.get(pendingId), 'bob-token');
  assert.equal(vault.get('default'), 'legacy-token');
  assert.equal(store().profiles.find(profile => profile.id === pendingId).label, 'bob');
  assert.equal(store().activeProfileId, pendingId);
});

test('switchProfile clears bindings, reloads the target profile token and always passes profileId', async () => {
  const pendingId = store().activeProfileId;
  app.useGitHubStore.setState({ currentOwner: 'x', currentRepoName: 'y' });
  calls = [];
  await store().switchProfile('default');
  assert.equal(store().activeProfileId, 'default');
  assert.equal(store().token, 'legacy-token');
  assert.equal(store().user.login, 'alice');
  assert.equal(store().isAuthenticated, true);
  assert.equal(store().currentOwner, null);
  assert.equal(store().currentRepoName, null);
  assert.deepEqual(callsOf('get_github_token').at(-1).args, { profileId: 'default' });

  calls = [];
  await store().switchProfile(pendingId);
  assert.deepEqual(callsOf('get_github_token').at(-1).args, { profileId: pendingId });
  assert.equal(store().token, 'bob-token');
  assert.equal(store().user.login, 'bob');

  const beforeUnknown = store().activeProfileId;
  await store().switchProfile('does-not-exist');
  assert.equal(store().activeProfileId, beforeUnknown);

  // 清理：移除测试 Profile 恢复单账号基线（顺带覆盖“移除活跃 Profile 自动切回剩余第一个”）
  await store().removeProfile(pendingId);
  assert.deepEqual(store().profiles.map(profile => profile.id), ['default']);
  assert.equal(store().activeProfileId, 'default');
  assert.equal(store().user.login, 'alice');
  assert.equal(vault.get(pendingId), undefined);
});

test('cancelling an add falls back to the previous profile and restores its session', async () => {
  await store().switchProfile('default');
  assert.equal(store().user.login, 'alice');
  store().addProfile();
  const previousId = store().addProfileReturnId;
  assert.equal(previousId, 'default');
  assert.equal(store().isAddingProfile, true);
  const pendingId = store().activeProfileId;
  store().cancelAddProfile();
  assert.equal(store().isAddingProfile, false);
  assert.equal(store().addProfileReturnId, null);
  assert.equal(store().profiles.length, 1);
  assert.equal(store().profiles.some(profile => profile.id === pendingId), false);
  assert.equal(store().activeProfileId, 'default');
  await eventually(() => store().isAuthenticated && store().user?.login === 'alice');
  assert.equal(store().token, 'legacy-token');
  // cancelAddProfile 幂等：再次调用不产生副作用
  store().cancelAddProfile();
  assert.equal(store().activeProfileId, 'default');
});

test('removeProfile deletes the keyring entry of the removed profile and advances when active', async () => {
  await store().switchProfile('default');
  store().addProfile();
  const pendingId = store().activeProfileId;
  await store().login('bob-token');
  assert.equal(store().activeProfileId, pendingId);

  calls = [];
  await store().removeProfile(pendingId);
  assert.deepEqual(callsOf('delete_github_token').at(-1).args, { profileId: pendingId });
  assert.equal(vault.get(pendingId), undefined);
  assert.equal(vault.get('default'), 'legacy-token');
  assert.deepEqual(store().profiles.map(profile => profile.id), ['default']);
  assert.equal(store().activeProfileId, 'default');
  // 被移除的是活跃 Profile，自动切回剩余第一个并恢复其登录
  assert.equal(store().isAuthenticated, true);
  assert.equal(store().user.login, 'alice');
  assert.equal(store().token, 'legacy-token');

  // 移除非活跃 Profile 不影响当前登录
  store().addProfile();
  const thirdId = store().activeProfileId;
  await store().login('bob-token');
  await store().switchProfile('default');
  assert.equal(store().user.login, 'alice');
  await store().removeProfile(thirdId);
  assert.equal(store().activeProfileId, 'default');
  assert.equal(store().user.login, 'alice');
  // 非活跃分支的凭据删除走 credentialWrites 链异步完成
  await eventually(() => vault.get(thirdId) === undefined);
  assert.deepEqual(store().profiles.map(profile => profile.id), ['default']);
});

test('logout removes the active profile credentials and falls back to the remaining account', async () => {
  await store().switchProfile('default');
  store().addProfile();
  const pendingId = store().activeProfileId;
  await store().login('bob-token');
  assert.equal(store().user.login, 'bob');

  store().logout();
  assert.equal(store().isAuthenticated, false);
  assert.deepEqual(store().profiles.map(profile => profile.id), ['default']);
  await eventually(() => store().isAuthenticated && store().user?.login === 'alice');
  assert.equal(vault.get(pendingId), undefined);
  assert.equal(store().token, 'legacy-token');
});

test('login without any profile writes to the legacy default entry', async () => {
  await store().switchProfile('default');
  await store().removeProfile('default');
  assert.deepEqual(store().profiles, []);
  assert.equal(store().activeProfileId, null);
  calls = [];
  await store().login('fresh-token');
  assert.deepEqual(callsOf('store_github_token').at(-1).args, { token: 'fresh-token', profileId: 'default' });
  assert.equal(vault.get('default'), 'fresh-token');
  assert.deepEqual(store().profiles, [{ id: 'default', label: 'alice' }]);
  assert.equal(store().activeProfileId, 'default');
});

test('corrupted persisted profiles fall back to a safe empty state on a fresh module load', () => {
  assert.deepEqual(app.parseStoredProfiles('not-json'), { profiles: [], activeProfileId: null });
  const requireFresh = () => {
    const copy = path.join(tmp, `profiles-${Math.random().toString(36).slice(2)}.cjs`);
    fs.copyFileSync(path.join(tmp, 'profiles.cjs'), copy);
    const fresh = createRequire(import.meta.url)(copy);
    fs.rmSync(copy, { force: true });
    return fresh;
  };
  saved.set('auu_git_profiles', '{broken');
  let fresh = requireFresh();
  assert.deepEqual(fresh.useGitHubStore.getState().profiles, []);
  assert.equal(fresh.useGitHubStore.getState().activeProfileId, null);

  saved.set('auu_git_profiles', JSON.stringify({ profiles: [{ id: 'p1', label: 'Work' }, 'junk', { id: '' }, { label: 'no-id' }, { id: 'p2' }], activeProfileId: 'ghost' }));
  fresh = requireFresh();
  assert.deepEqual(fresh.useGitHubStore.getState().profiles, [{ id: 'p1', label: 'Work' }, { id: 'p2', label: 'p2' }]);
  // activeProfileId 指向不存在的 Profile 时回退到第一个
  assert.equal(fresh.useGitHubStore.getState().activeProfileId, 'p1');

  saved.set('auu_git_profiles', JSON.stringify({ profiles: [{ id: 'p1', label: 'Work' }], activeProfileId: 'p1' }));
  fresh = requireFresh();
  assert.equal(fresh.useGitHubStore.getState().activeProfileId, 'p1');
});
