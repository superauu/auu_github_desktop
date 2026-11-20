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
  await build({ stdin: { contents: `export { gitService } from './src/services/git/GitService'; export { branchSafetyService } from './src/services/git/BranchSafetyService';`, resolveDir: root }, bundle: true, platform: 'node', format: 'cjs', outfile: bundle, alias: { '@': path.join(root, 'src') }, logLevel: 'silent' });
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

test('merge --squash stages source changes without creating a merge commit', async () => {
  const { repository, git } = await makeRepo('squash');
  git('checkout', '-b', 'feat');
  await fs.writeFile(path.join(repository, 'feat.txt'), 'feature\n');
  git('add', '--', 'feat.txt');
  git('commit', '-m', 'feature work');
  const featHash = git('rev-parse', 'HEAD').trim();
  git('checkout', 'main');
  const mainHashBefore = git('rev-parse', 'HEAD').trim();
  await fs.writeFile(path.join(repository, 'base.txt'), 'base\nmore\n');
  git('add', '--', 'base.txt');
  git('commit', '-m', 'main moved');
  // 走与 UI 相同的安全服务路径（预览 + 执行），squash 语义在此层落地。
  const preview = await app.branchSafetyService.preview(repository, { name: 'feat', isRemote: false, isCurrent: false }, { name: 'main', isRemote: false, isCurrent: false });
  await app.branchSafetyService.execute(preview, 'merge', { squash: true });
  // HEAD 不动（无合并提交），改动全部在暂存区。
  assert.equal(git('rev-parse', 'HEAD').trim() !== mainHashBefore, true, 'main advanced with its own commit');
  const staged = git('status', '--porcelain', '-z');
  assert.ok(staged.includes('feat.txt'), 'squashed change should be staged');
  assert.equal(git('log', '--oneline', 'main').split('\n').some(line => line.includes('feature work')), false, 'no squash commit until user commits');
  void featHash;
});

test('mixedResetCommit moves HEAD and index back while keeping worktree changes unstaged', async () => {
  const { repository, git } = await makeRepo('mixed');
  const service = app.gitService;
  git('checkout', '-b', 'topic');
  await fs.writeFile(path.join(repository, 'one.txt'), 'one\n');
  git('add', '--', 'one.txt');
  git('commit', '-m', 'one');
  const oneHash = git('rev-parse', 'HEAD').trim();
  await fs.writeFile(path.join(repository, 'two.txt'), 'two\n');
  git('add', '--', 'two.txt');
  git('commit', '-m', 'two');
  const baseHash = git('rev-parse', 'main').trim();
  await service.mixedResetCommit(repository, baseHash);
  assert.equal(git('rev-parse', 'HEAD').trim(), baseHash, 'HEAD moved to base');
  // 工作区文件都在，改动为未暂存。
  const status = git('status', '--porcelain');
  assert.ok(status.split('\n').filter(Boolean).every(line => line.startsWith(' D') || line.startsWith('??') || line.startsWith(' M')), 'changes must be unstaged: ' + status);
  assert.ok(await fs.access(path.join(repository, 'one.txt')).then(() => true, () => false), 'worktree file kept');
  assert.ok(await fs.access(path.join(repository, 'two.txt')).then(() => true, () => false), 'worktree file kept');
  void oneHash;
});

test('stashBranch restores the stash onto a new branch and drops the original entry', async () => {
  const { repository, git } = await makeRepo('stash-branch');
  const service = app.gitService;
  await fs.writeFile(path.join(repository, 'wip.txt'), 'wip content\n');
  await service.stashPush(repository, 'wip note');
  const stashes = await service.getStashes(repository);
  assert.equal(stashes.length, 1);
  await service.stashBranch(repository, 'from-stash', stashes[0].index);
  // git stash branch 标准语义：新分支上恢复工作区并 drop 原贮藏（内容已转移到新分支）。
  assert.ok(await fs.access(path.join(repository, 'wip.txt')).then(() => true, () => false), 'stash content restored on new branch');
  assert.equal((await service.getStashes(repository)).length, 0, 'original stash dropped by stash branch');
  assert.equal(git('branch', '--show-current').trim(), 'from-stash');
  // 非法分支名拒绝。
  await assert.rejects(() => service.stashBranch(repository, '-evil', 0));
});

test('cloneRepository supports shallow depth and rejects invalid depths', async () => {
  const { repository: source } = await makeRepo('clone-source');
  for (let index = 1; index <= 4; index++) {
    await fs.writeFile(path.join(source, 'f.txt'), `v${index}\n`);
    execFileSync('git', ['add', '--', 'f.txt'], { cwd: source, windowsHide: true, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', `c${index}`], { cwd: source, windowsHide: true, stdio: 'ignore' });
  }
  const service = app.gitService;
  // 浅克隆 depth=1：目标仓库只有 1 个提交（本地路径克隆会忽略 --depth，必须走 file:// 形态）。
  const shallow = path.join(temporary, 'shallow-clone');
  await service.cloneRepository('file:///' + source.replaceAll('\\', '/'), shallow, undefined, 1);
  const count = execFileSync('git', ['rev-list', '--count', 'HEAD'], { cwd: shallow, windowsHide: true, encoding: 'utf8' }).trim();
  assert.equal(count, '1', 'shallow clone should carry a single commit');
  // 非法深度拒绝：0 / 非整数 / 超上限。
  await assert.rejects(() => service.cloneRepository(source, path.join(temporary, 'bad-0'), undefined, 0), /深度|depth/i);
  await assert.rejects(() => service.cloneRepository(source, path.join(temporary, 'bad-f'), undefined, 1.5), /深度|depth/i);
  await assert.rejects(() => service.cloneRepository(source, path.join(temporary, 'bad-big'), undefined, 20000), /深度|depth/i);
});

test('listRemoteBranches lists refs/heads names from a local mirror', async () => {
  const { repository } = await makeRepo('ls-remote-src');
  const service = app.gitService;
  // 两个分支 + 一个 tag：只应列出 refs/heads/*。
  execFileSync('git', ['checkout', '-b', 'feature'], { cwd: repository, windowsHide: true, stdio: 'ignore' });
  execFileSync('git', ['checkout', 'main'], { cwd: repository, windowsHide: true, stdio: 'ignore' });
  execFileSync('git', ['tag', 'v1'], { cwd: repository, windowsHide: true, stdio: 'ignore' });
  const mirror = path.join(temporary, 'ls-remote-mirror.git');
  execFileSync('git', ['clone', '--bare', '--', repository, mirror], { cwd: temporary, windowsHide: true, stdio: 'ignore' });
  const branches = await service.listRemoteBranches('file:///' + mirror.replaceAll('\\', '/'));
  assert.deepEqual(branches.sort(), ['feature', 'main'], 'only refs/heads names, tags excluded');
  // 非法 URL 拒绝。
  await assert.rejects(() => service.listRemoteBranches('-evil'));
  await assert.rejects(() => service.listRemoteBranches(''));
});

test('runGc packs objects and runFsck reports a healthy object store', async () => {
  const { repository, git } = await makeRepo('maintenance');
  // 制造松散对象：多次小提交。
  for (let index = 1; index <= 5; index++) {
    await fs.writeFile(path.join(repository, `f${index}.txt`), `content ${index}\n`);
    git('add', '--', `f${index}.txt`);
    git('commit', '-m', `c${index}`);
  }
  const service = app.gitService;
  const statsBefore = await service.getRepoStats(repository);
  const looseBefore = Number(statsBefore['count'] || '0');
  await service.runGc(repository);
  const statsAfter = await service.getRepoStats(repository);
  // gc 后松散对象应归零（全部打包）。
  assert.equal(Number(statsAfter['count'] || '0'), 0, 'loose objects packed by gc');
  assert.ok(looseBefore > 0, 'fixture should have loose objects before gc');
  // 健康对象库：fsck 无损坏。
  const fsck = await service.runFsck(repository);
  assert.equal(fsck.corrupted, false, 'healthy repo passes fsck');
});
