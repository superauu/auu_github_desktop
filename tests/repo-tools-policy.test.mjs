// 仓库工具策略测试（第三梯队）：
// 1. submodule 子命令门：foreach（任意 shell 执行）/absorbgitdirs/summary/set-url/helper
//    拒绝，status/add/update/init/deinit/sync 的白名单选项放行，--reference 等未知选项拒绝；
// 2. lfs 子命令门：install/uninstall 必须恰带 --local（裸调用写全局 ~/.gitconfig），
//    push/migrate/lock 等封禁，track/untrack 仅位置模式，只读面 bare 调用；
// 3. 签名 config 写键：user.signingkey 任意值、gpgsign 恰为 true/false、gpg.format 恰为
//    ssh；gpg.program / gpg.ssh.* 永不放行（任意可执行文件执行面）；
// 4. submoduleAddSource 解析：与 clone 源同构授权的 <repository> 提取。
// 与 src-tauri/src/git_policy.rs 的测试向量一一对应（Rust/TS 镜像行为一致性）。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const root = process.cwd();
let temporary, app;
before(async () => {
  temporary = await fs.mkdtemp(path.join(root, '.test-tmp-repo-tools-'));
  const bundle = path.join(temporary, 'helpers.cjs');
  await build({ stdin: { contents: `export * from './scripts/git-policy';`, resolveDir: root }, bundle: true, platform: 'node', format: 'cjs', outfile: bundle, logLevel: 'silent' });
  app = createRequire(import.meta.url)(bundle);
});
after(async () => {
  if (temporary && path.dirname(temporary) === root && path.basename(temporary).startsWith('.test-tmp-repo-tools-')) {
    await fs.rm(temporary, { recursive: true, force: true });
  }
});

test('submodule subcommands are gated fail closed', () => {
  // 放行：仓库工具面板真实使用的形态。
  for (const args of [
    ['submodule', 'status'],
    ['submodule', 'status', '--cached', '--recursive'],
    ['submodule', 'status', '--', 'dep', 'other'],
    ['submodule', 'add', '--name', 'dep', '-b', 'main', '--depth', '1', '--', '../dep-repo', 'dep'],
    ['submodule', 'add', '-f', '--branch=main', '--depth=1', '--force', 'https://example.invalid/dep.git', 'dep'],
    ['submodule', 'add', '-fb', 'main', 'url', 'dep'],
    ['submodule', 'update', '--init', '--recursive'],
    ['submodule', 'update', '--remote', '--checkout', '-f', '--depth', '1', '--', 'dep'],
    ['submodule', 'deinit', '--all'],
    ['submodule', 'deinit', '-f', 'dep'],
    ['submodule', 'init'],
    ['submodule', 'init', 'dep'],
    ['submodule', 'sync', '--recursive', 'dep'],
  ]) {
    assert.doesNotThrow(() => app.validateGitArguments(args), JSON.stringify(args));
  }
  // 拒绝：foreach 执行任意 shell 命令、未列出子命令（含裸调用/摘要/set-url）、
  // --reference 读外部仓库对象、未声明选项与走私向量。
  for (const args of [
    ['submodule'],
    ['submodule', 'help'],
    ['submodule', 'foreach', 'pwd'],
    ['submodule', 'foreach', '--recursive', 'rm -rf /'],
    ['submodule', 'absorbgitdirs'],
    ['submodule', 'summary'],
    ['submodule', 'set-url', 'dep', 'url'],
    ['submodule', 'helper'],
    ['submodule', 'unknown-sub'],
    ['submodule', 'add', '--reference', '/outside/repo', 'url', 'dep'],
    ['submodule', 'add', '--reference-if-able', '/outside/repo', 'url', 'dep'],
    ['submodule', 'add', '--dissociate', 'url', 'dep'],
    ['submodule', 'add', '--name', 'x', '--upload-pack=evil', 'url', 'dep'],
    ['submodule', 'add', '-bmain', 'url', 'dep'],
    ['submodule', 'add', '-x', 'url', 'dep'],
    ['submodule', 'update', '--merge'],
    ['submodule', 'update', '--jobs', '2'],
    // init 实际没有 --recursive：fail closed。
    ['submodule', 'init', '--recursive'],
    ['submodule', 'sync', '--quiet'],
    ['submodule', 'status', '--quiet'],
  ]) {
    assert.throws(() => app.validateGitArguments(args), JSON.stringify(args));
  }
});

test('lfs subcommands are gated fail closed', () => {
  for (const args of [
    ['lfs', 'track'],
    ['lfs', 'track', '*.psd'],
    ['lfs', 'track', '--', '*.psd', '*.zip'],
    ['lfs', 'untrack', '*.psd'],
    ['lfs', 'install', '--local'],
    ['lfs', 'uninstall', '--local'],
    ['lfs', 'ls-files'],
    ['lfs', 'status'],
    ['lfs', 'version'],
    ['lfs', 'env'],
    ['lfs', 'fetch'],
    ['lfs', 'pull'],
    ['lfs', 'checkout'],
  ]) {
    assert.doesNotThrow(() => app.validateGitArguments(args), JSON.stringify(args));
  }
  for (const args of [
    ['lfs'],
    ['lfs', 'help'],
    // 裸 install/uninstall 写全局 ~/.gitconfig：必须恰带 --local。
    ['lfs', 'install'],
    ['lfs', 'uninstall'],
    ['lfs', 'install', '--local', '--force'],
    ['lfs', 'install', '--force'],
    ['lfs', 'uninstall', '--local', 'extra'],
    ['lfs', 'track', '--filename', 'x'],
    ['lfs', 'track', '--custom', '*.psd'],
    ['lfs', 'untrack', '--verbose'],
    // push（v1 不做上传面）/ migrate（重写历史）/ 过滤驱动与维护面全部封禁。
    ['lfs', 'push', 'origin', 'main'],
    ['lfs', 'migrate'],
    ['lfs', 'migrate', 'import', '--everything'],
    ['lfs', 'pointer', '--file', 'x'],
    ['lfs', 'clean'],
    ['lfs', 'smudge'],
    ['lfs', 'update'],
    ['lfs', 'logs', 'last'],
    ['lfs', 'prune'],
    ['lfs', 'dedup'],
    ['lfs', 'lock', 'x'],
    ['lfs', 'unlock', 'x'],
    ['lfs', 'version', '--help'],
    ['lfs', 'fetch', '--all'],
    ['lfs', 'pull', 'origin'],
    ['lfs', 'unknown-sub'],
  ]) {
    assert.throws(() => app.validateGitArguments(args), JSON.stringify(args));
  }
});

test('signing config keys are allowed but gpg executables never', () => {
  for (const args of [
    ['config', '--local', 'user.signingkey', '~/.ssh/id_ed25519.pub'],
    ['config', '--local', 'user.signingkey', 'ssh-ed25519 AAAAC3Nza user@host'],
    ['config', '--local', 'commit.gpgsign', 'true'],
    ['config', '--local', 'commit.gpgsign', 'false'],
    ['config', '--local', 'tag.gpgsign', 'true'],
    ['config', '--local', 'gpg.format', 'ssh'],
    // 读取任意键沿用既有规则。
    ['config', '--get', 'gpg.program'],
    ['config', '--get', 'gpg.ssh.program'],
  ]) {
    assert.doesNotThrow(() => app.validateGitArguments(args), JSON.stringify(args));
  }
  for (const args of [
    ['config', '--local', 'gpg.format', 'x509'],
    ['config', '--local', 'gpg.format', 'openpgp'],
    // git 会把 yes/1 解析为真值，策略必须收窄到字面 true/false。
    ['config', '--local', 'commit.gpgsign', 'yes'],
    ['config', '--local', 'commit.gpgsign', '1'],
    ['config', '--local', 'tag.gpgsign', 'on'],
    ['config', '--local', 'user.signingkey', 'v', 'extra'],
    // 任意可执行文件执行面：永不放行。
    ['config', '--local', 'gpg.program', '/evil/signer'],
    ['config', '--local', 'gpg.program'],
    ['config', '--local', 'gpg.ssh.program', '/evil/ssh'],
    ['config', '--local', 'gpg.ssh.allowedSignersFile', '/evil'],
  ]) {
    assert.throws(() => app.validateGitArguments(args), JSON.stringify(args));
  }
});

test('submodule add repository argument is extracted for clone-style authorization', () => {
  const source = (args) => app.submoduleAddSource(args, 0);
  assert.equal(source(['submodule', 'add', '--', '../dep-repo', 'dep']), '../dep-repo');
  assert.equal(source(['submodule', 'add', '--name', 'dep', '-b', 'main', '--depth', '1', '--', '../dep-repo', 'dep']), '../dep-repo');
  assert.equal(source(['submodule', 'add', '-f', '--branch=main', '../dep-repo', 'dep']), '../dep-repo');
  // 短选项簇：簇尾 -b 的值被跳过，首个位置参数仍是 <repository>。
  assert.equal(source(['submodule', 'add', '-fb', 'main', '../dep-repo']), '../dep-repo');
  assert.equal(source(['submodule', 'add', 'https://example.invalid/dep.git', 'dep']), 'https://example.invalid/dep.git');
  // 非 add 形态、缺位置参数、只有取值选项：返回 null（fail closed）。
  assert.equal(source(['submodule', 'status', '--', 'dep']), null);
  assert.equal(source(['submodule', 'update', '--init', 'dep']), null);
  assert.equal(source(['submodule', 'add']), null);
  assert.equal(source(['submodule', 'add', '--name']), null);
  assert.equal(source(['submodule', 'add', '--', 'dep']), 'dep');
});
