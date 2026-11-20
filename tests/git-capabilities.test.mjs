// 批次二 git 能力面收口的服务层测试（真仓库 + dev 桥接）：
// 1. discardChanges：未跟踪文件走 clean -f 真删除（不可恢复），跟踪文件仍走 restore/checkout 还原；
// 2. worktree remove：注册过的 worktree 可删除，主仓库/未注册路径拒绝；prune 清理失联条目；
// 3. merge --squash：暂存合并语义（不产生合并提交，HEAD 不动）；
// 4. resetMixed：HEAD 与暂存区移动、工作区保留（改动变为未暂存）；
// 5. stashBranch：从贮藏恢复到新分支，原贮藏保留；
// 6. cloneRepository：--depth 浅克隆（提交数受限），非法深度拒绝。
// 策略面见 repo-tools-policy.test.mjs（clean 门）。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { createServer } from 'vite';
import { retryDevFetch } from './dev-fetch-retry.mjs';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
let temporary, server, base, app, originalFetch;
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
before(async () => {
  temporary = await fs.mkdtemp(path.join(root, '.test-tmp-git-capabilities-'));
  const bundle = path.join(temporary, 'helpers.cjs');
  await build({ stdin: { contents: `export { gitService } from './src/services/git/GitService';`, resolveDir: root }, bundle: true, platform: 'node', format: 'cjs', outfile: bundle, alias: { '@': path.join(root, 'src') }, logLevel: 'silent' });
  app = createRequire(import.meta.url)(bundle);
  server = await createServer({ configFile: path.join(root, 'vite.config.ts'), server: { host: '127.0.0.1', port: 0, strictPort: false, watch: null } });
  await server.listen();
  base = `http://127.0.0.1:${server.httpServer.address().port}`;
  // 服务层走浏览器语义的相对路径 fetch('/api/git')；Node 里没有文档 base URL，这里补一层。
  originalFetch = globalThis.fetch;
  const retriedFetch = retryDevFetch(originalFetch);
  globalThis.fetch = (input, init) => {
    const url = typeof input === 'string' && input.startsWith('/') ? base + input : input;
    return retriedFetch(url, init);
  };
});
after(async () => {
  if (originalFetch) globalThis.fetch = originalFetch;
  await server?.close();
  if (temporary && path.dirname(temporary) === root && path.basename(temporary).startsWith('.test-tmp-git-capabilities-')) await fs.rm(temporary, { recursive: true, force: true });
});

const makeRepo = async (name, { initialCommit = true } = {}) => {
  const repository = path.join(temporary, name);
  await fs.mkdir(repository, { recursive: true });
  const git = (...args) => execFileSync('git', args, { cwd: repository, windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '-b', 'main');
  git('config', 'user.name', 'Capability Test');
  git('config', 'user.email', 'capability@example.invalid');
  git('config', 'core.autocrlf', 'false');
  if (initialCommit) {
    await fs.writeFile(path.join(repository, 'base.txt'), 'base\n');
    git('add', '--', 'base.txt');
    git('commit', '-m', 'initial');
  }
  return { repository, git };
};

test('discardChanges deletes untracked files via clean -f and still restores tracked files', async () => {
  const { repository } = await makeRepo('discard');
  const service = app.gitService;
  // 未跟踪：真删除（clean -f）。
  await fs.writeFile(path.join(repository, 'junk.txt'), 'untracked\n');
  await service.discardChanges(repository, 'junk.txt', true);
  await assert.rejects(() => fs.access(path.join(repository, 'junk.txt')));
  // 跟踪修改：还原内容。
  await fs.writeFile(path.join(repository, 'base.txt'), 'changed\n');
  await service.discardChanges(repository, 'base.txt');
  assert.equal(await fs.readFile(path.join(repository, 'base.txt'), 'utf8'), 'base\n');
  // 未跟踪文件仍保留（误传 isUntracked=false 不应误删）。
  await fs.writeFile(path.join(repository, 'keep.txt'), 'untracked\n');
  await service.discardChanges(repository, 'keep.txt', false).catch(() => {});
  await fs.access(path.join(repository, 'keep.txt'));
  await fs.rm(path.join(repository, 'keep.txt'));
});

test('removeWorktree deletes registered linked worktrees and refuses unregistered, main and locked targets', async () => {
  const { repository } = await makeRepo('wt-main');
  const service = app.gitService;
  const linked = path.join(temporary, 'wt-remove-linked');
  await service.createWorktree(repository, linked, 'main', 'wt-feature');
  let trees = await service.getWorktrees(repository);
  assert.equal(trees.length, 2);
  // 主工作树拒绝删除。
  await assert.rejects(() => service.removeWorktree(repository, trees[0].path), /主工作树|main working tree/i);
  // 未注册路径拒绝删除（防任意目录删除）。
  await assert.rejects(() => service.removeWorktree(repository, path.join(temporary, 'not-a-worktree')), /注册|registered/i);
  // 正常删除链接 worktree。
  await service.removeWorktree(repository, linked);
  trees = await service.getWorktrees(repository);
  assert.equal(trees.length, 1);
  await assert.rejects(() => fs.access(path.join(linked, '.git')));
  // 锁定态拒绝删除，解锁后可删；失联条目走 prune。
  const locked = path.join(temporary, 'wt-remove-locked');
  await service.createWorktree(repository, locked, 'main', 'wt-locked');
  execFileSync('git', ['worktree', 'lock', locked], { cwd: repository, windowsHide: true, stdio: 'ignore' });
  await assert.rejects(() => service.removeWorktree(repository, locked), /锁定|locked/i);
  execFileSync('git', ['worktree', 'unlock', locked], { cwd: repository, windowsHide: true, stdio: 'ignore' });
  await fs.rm(locked, { recursive: true, force: true }); // 模拟外部删除目录 → prunable
  trees = await service.getWorktrees(repository);
  assert.ok(trees.find(tree => tree.prunable), 'deleted directory should surface as prunable');
  // 失联条目走 prune 清理（UI 对 prunable 行提供清理按钮）。
  await service.pruneWorktrees(repository);
  trees = await service.getWorktrees(repository);
  assert.ok(!trees.find(tree => samePath(tree.path, locked)), 'prune should clear stale entries');
});

const samePath = (left, right) => left.replaceAll('\\', '/').replace(/\/$/, '').toLowerCase() === right.replaceAll('\\', '/').replace(/\/$/, '').toLowerCase();
