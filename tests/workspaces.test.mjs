/**
 * 仓库分组 Workspaces（T6）回归防线：
 * 1. createGroup/renameGroup 组名校验（trim 非空、同名拒绝），id 为去连字符 UUID；
 * 2. assignRepo 指派/移动/移出：一个仓库至多属于一个组，repoPaths 去重；
 * 3. deleteGroup 只解除归属，组内仓库回落“未分组”，绝不删除仓库；
 * 4. 持久化往返（zustand persist → localStorage auu_git_workspace_groups）与坏数据校验
 *    （非法 JSON / 顶层非对象 / 逐条清洗 / 旧版本 migrate 同样防御）；
 * 5. buildRepoSections：按分组分区且保持最近打开顺序；无分组时返回与扁平列表等价的单一
 *    “未分组”分区（菜单零变化契约）；
 * 6. 批量 fetch 聚合：runBatchFetch 逐个顺序执行、聚合成功/失败；batchFetchToast 文案含
 *    成功/失败计数与失败仓库名。
 */
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const root = process.cwd();
const saved = new Map();
// 必须在 require 打包产物前安装 mock：persist 在 store 模块初始化时会读 localStorage
globalThis.localStorage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, String(value)), removeItem: key => saved.delete(key) };

let app, tmp;

const store = () => app.useWorkspaceGroupsStore.getState();
const reset = () => { app.useWorkspaceGroupsStore.setState({ groups: [] }); saved.clear(); };

before(async () => {
  tmp = fs.mkdtempSync(path.join(root, '.test-tmp-workspaces-'));
  const bundle = path.join(tmp, 'workspaces.cjs');
  await build({
    stdin: { contents: `export * from './src/stores/workspaceGroupsStore';`, resolveDir: root },
    bundle: true, platform: 'node', format: 'cjs', outfile: bundle, logLevel: 'silent',
    alias: { '@': path.join(root, 'src') },
  });
  app = createRequire(import.meta.url)(bundle);
});

after(() => {
  reset();
  if (tmp && path.dirname(tmp) === root && path.basename(tmp).startsWith('.test-tmp-workspaces-')) fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5 });
});

const requireFresh = () => {
  const copy = path.join(tmp, `workspaces-${Math.random().toString(36).slice(2)}.cjs`);
  fs.copyFileSync(path.join(tmp, 'workspaces.cjs'), copy);
  const fresh = createRequire(import.meta.url)(copy);
  fs.rmSync(copy, { force: true });
  return fresh;
};

test('createGroup validates the name and persists the group', () => {
  reset();
  assert.equal(store().createGroup('   '), null);
  assert.deepEqual(store().groups, []);
  const id = store().createGroup('  Work  ');
  assert.match(id, /^[0-9a-f]{32}$/);
  assert.deepEqual(store().groups, [{ id, name: 'Work', repoPaths: [] }]);
  // 同名拒绝（trim 后比较）
  assert.equal(store().createGroup('Work'), null);
  assert.equal(store().createGroup(' Work '), null);
  assert.equal(store().groups.length, 1);
  assert.deepEqual(JSON.parse(saved.get('auu_git_workspace_groups')), { state: { groups: [{ id, name: 'Work', repoPaths: [] }] }, version: 1 });
});

test('renameGroup validates names and rejects duplicates from other groups', () => {
  reset();
  const work = store().createGroup('Work');
  const oss = store().createGroup('Open Source');
  assert.equal(store().renameGroup('missing-id', 'X'), false);
  assert.equal(store().renameGroup(work, '   '), false);
  assert.equal(store().renameGroup(oss, 'Work'), false);
  assert.equal(store().renameGroup(oss, '  OSS  '), true);
  assert.deepEqual(store().groups.map(group => group.name), ['Work', 'OSS']);
  // 改回自己的名字是合法 no-op
  assert.equal(store().renameGroup(oss, 'OSS'), true);
  assert.deepEqual(store().groups.map(group => group.name), ['Work', 'OSS']);
});

test('assignRepo moves a repo between groups and unassigns with null', () => {
  reset();
  const work = store().createGroup('Work');
  const oss = store().createGroup('OSS');
  const p1 = 'E:/code/p1';
  const p2 = 'E:/code/p2';
  store().assignRepo(p1, work);
  store().assignRepo(p2, work);
  assert.deepEqual(store().groups.find(group => group.id === work).repoPaths, [p1, p2]);
  // 重复指派不产生重复
  store().assignRepo(p1, work);
  assert.deepEqual(store().groups.find(group => group.id === work).repoPaths, [p1, p2]);
  // 移动到另一个组：原组移除、新组加入
  store().assignRepo(p1, oss);
  assert.deepEqual(store().groups.find(group => group.id === work).repoPaths, [p2]);
  assert.deepEqual(store().groups.find(group => group.id === oss).repoPaths, [p1]);
  // groupId=null 移出到未分组
  store().assignRepo(p1, null);
  assert.deepEqual(store().groups.find(group => group.id === oss).repoPaths, []);
  // 不存在的 groupId 视同移出
  store().assignRepo(p2, 'nonexistent-id');
  assert.deepEqual(store().groups.find(group => group.id === work).repoPaths, []);
});

test('deleteGroup only removes the group; its repos fall back to ungrouped', () => {
  reset();
  const work = store().createGroup('Work');
  const p1 = 'E:/code/p1';
  store().assignRepo(p1, work);
  store().deleteGroup(work);
  assert.deepEqual(store().groups, []);
  // 仓库本身没有被删除：分组视角下 p1 回落到未分组分区
  assert.deepEqual(app.buildRepoSections([], [p1]), [{ group: null, repos: [p1] }]);
  assert.equal(saved.get('auu_git_workspace_groups'), JSON.stringify({ state: { groups: [] }, version: 1 }));
});

test('buildRepoSections sections repos by group while keeping the recent order', () => {
  const groups = [
    { id: 'g1', name: 'Work', repoPaths: ['p2'] },
    { id: 'g2', name: 'OSS', repoPaths: [] },
  ];
  assert.deepEqual(app.buildRepoSections(groups, ['p1', 'p2', 'p3']), [
    { group: groups[0], repos: ['p2'] },
    { group: groups[1], repos: [] },
    { group: null, repos: ['p1', 'p3'] },
  ]);
});

test('buildRepoSections with no groups mirrors the flat recent list (zero-change contract)', () => {
  assert.deepEqual(app.buildRepoSections([], ['p1', 'p2']), [{ group: null, repos: ['p1', 'p2'] }]);
});

test('runBatchFetch runs sequentially and aggregates successes and failures', async () => {
  const calls = [];
  const result = await app.runBatchFetch(
    [{ path: 'a', name: 'a' }, { path: 'b', name: 'b' }, { path: 'c', name: 'c' }, { path: 'd', name: 'd' }],
    async (repoPath) => {
      calls.push(repoPath);
      if (repoPath === 'c') throw new Error('network down');
    },
  );
  // 逐个顺序执行（不并发）
  assert.deepEqual(calls, ['a', 'b', 'c', 'd']);
  assert.deepEqual(result.ok.map(target => target.path), ['a', 'b', 'd']);
  assert.deepEqual(result.failed, [{ path: 'c', name: 'c', message: 'network down' }]);
});

test('batchFetchToast summarizes counts and the failed repo list', () => {
  const dict = {
    'workspaces.batchFetchDone': 'done {n}',
    'workspaces.batchFetchPartial': 'ok {n} failed {m}',
  };
  const t = (key) => dict[key] || key;
  const allOk = app.batchFetchToast(
    { ok: [{ path: 'a', name: 'a' }, { path: 'b', name: 'b' }, { path: 'c', name: 'c' }], failed: [] },
    t,
  );
  assert.equal(allOk.type, 'success');
  assert.equal(allOk.title, 'done 3');

  const partial = app.batchFetchToast(
    { ok: [{ path: 'a', name: 'a' }, { path: 'b', name: 'b' }, { path: 'c', name: 'c' }], failed: [{ path: 'd', name: 'repo-d', message: 'boom' }] },
    t,
  );
  assert.equal(partial.type, 'warning');
  assert.equal(partial.title, 'ok 3 failed 1');
  assert.equal(partial.description, 'repo-d: boom');
});

test('persisted groups survive a fresh module load', () => {
  reset();
  const work = store().createGroup('Work');
  store().assignRepo('E:/code/p1', work);
  store().assignRepo('E:/code/p2', work);
  const fresh = requireFresh();
  assert.deepEqual(fresh.useWorkspaceGroupsStore.getState().groups, store().groups);
});

test('corrupted persisted groups fall back to a sanitized state on a fresh module load', () => {
  reset();
  // 非法 JSON → 安全空态
  saved.set('auu_git_workspace_groups', '{broken');
  let fresh = requireFresh();
  assert.deepEqual(fresh.useWorkspaceGroupsStore.getState().groups, []);

  // 顶层不是持久化信封（数组 / 字符串）→ 安全空态
  saved.set('auu_git_workspace_groups', JSON.stringify([1, 2]));
  fresh = requireFresh();
  assert.deepEqual(fresh.useWorkspaceGroupsStore.getState().groups, []);
  saved.set('auu_git_workspace_groups', '"just a string"');
  fresh = requireFresh();
  assert.deepEqual(fresh.useWorkspaceGroupsStore.getState().groups, []);

  // groups 字段形状错误 → 安全空态
  saved.set('auu_git_workspace_groups', JSON.stringify({ state: { groups: 'nope' }, version: 1 }));
  fresh = requireFresh();
  assert.deepEqual(fresh.useWorkspaceGroupsStore.getState().groups, []);

  // 逐条清洗：非对象/缺 id/空 name 条目丢弃，repoPaths 去空去重，重复 id 只保留首个
  saved.set('auu_git_workspace_groups', JSON.stringify({
    state: {
      groups: [
        null, 42, { id: '', name: 'x' }, { id: 'g1' }, { id: 'g2', name: '   ' },
        { id: 'g3', name: ' Keep ', repoPaths: ['a', 'a', '', '   ', 'b'] },
        { id: 'g3', name: 'dup' },
      ],
    },
    version: 1,
  }));
  fresh = requireFresh();
  assert.deepEqual(fresh.useWorkspaceGroupsStore.getState().groups, [
    { id: 'g3', name: 'Keep', repoPaths: ['a', 'b'] },
  ]);

  // 旧版本数据走 migrate：同样清洗
  saved.set('auu_git_workspace_groups', JSON.stringify({ state: { groups: [{ id: 'g9', name: 'Old', repoPaths: ['p1', 'p1'] }] }, version: 0 }));
  fresh = requireFresh();
  assert.deepEqual(fresh.useWorkspaceGroupsStore.getState().groups, [
    { id: 'g9', name: 'Old', repoPaths: ['p1'] },
  ]);
});
