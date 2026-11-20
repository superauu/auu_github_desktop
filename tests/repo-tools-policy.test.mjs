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

test('describe is gated to the distance-display shape', () => {
  // 放行：详情面板「距 tag 距离」真实使用的形态（三开关 + 单 rev）。
  const hash = 'a'.repeat(40);
  for (const args of [
    ['describe', '--tags', '--long', '--always', hash],
    ['describe', '--always', '--tags', '--long', 'HEAD'],
    ['describe', '--tags', '--long', '--always', 'HEAD~3'],
    ['describe', hash],
  ]) {
    assert.doesNotThrow(() => app.validateGitArguments(args), JSON.stringify(args));
  }
  // 拒绝：可变参选项（--match/--exclude）、--dirty、取值选项、多 rev 与未知选项。
  for (const args of [
    ['describe'],
    ['describe', '--tags', '--long', '--always'],
    ['describe', '--match', 'v*'],
    ['describe', '--exclude', 'v*'],
    ['describe', '--dirty'],
    ['describe', '--candidates', '5', 'HEAD'],
    ['describe', '--first-parent', 'HEAD'],
    ['describe', hash, 'HEAD'],
    ['describe', '--abbrev=4', 'HEAD'],
    ['describe', '--output=evil', 'HEAD'],
  ]) {
    assert.throws(() => app.validateGitArguments(args), JSON.stringify(args));
  }
});

test('grep is gated to the code-search shape', () => {
  // 放行：全局搜索浮层真实使用的形态（开关 + 模式 + -- pathspec）。
  for (const args of [
    ['grep', '-n', '--column', '-I', 'todo', '--', 'src/'],
    ['grep', '-n', '-i', '-F', 'fixed string'],
    ['grep', '-n', '-E', '-w', String.raw`\bfoo\d+`],
    ['grep', '-n', '--column', '-I', 'pattern'],
    ['grep', '-n', '--column', '-I', 'pattern', '--', 'src', 'docs/read me.md'],
  ]) {
    assert.doesNotThrow(() => app.validateGitArguments(args), JSON.stringify(args));
  }
  // 拒绝：模式文件、pager/output 执行面、取值选项、表达式组合、多模式与裸调用。
  for (const args of [
    ['grep'],
    ['grep', '-n', '-f', 'patterns.txt'],
    ['grep', '--output=evil', 'x'],
    ['grep', '-O', 'x'],
    ['grep', '--open-files-in-pager', 'x'],
    ['grep', '-A', '2', 'x'],
    ['grep', '--and', 'a', 'b'],
    ['grep', '-e', 'a', '-e', 'b'],
    ['grep', '-m', '5', 'x'],
    ['grep', 'a', 'b'],
    ['grep', 'x', '--', '-leading-dash'],
    ['grep', '--heading', 'x'],
  ]) {
    assert.throws(() => app.validateGitArguments(args), JSON.stringify(args));
  }
});

test('format-patch is gated to the stdout-export shape', () => {
  const hash = 'a'.repeat(40);
  // 放行：导出补丁的真实形态（-N + --stdout + 单 rev）。
  for (const args of [
    ['format-patch', '-1', '--stdout', hash],
    ['format-patch', '--stdout', '-3', 'HEAD~2'],
    ['format-patch', '-99', '--stdout', 'HEAD'],
  ]) {
    assert.doesNotThrow(() => app.validateGitArguments(args), JSON.stringify(args));
  }
  // 拒绝：缺 --stdout（会向工作目录写文件）、越界 N、output-directory、cover-letter、多 rev。
  for (const args of [
    ['format-patch', '-1', hash],
    ['format-patch', '--stdout', 'HEAD'],
    ['format-patch', '-0', '--stdout', 'HEAD'],
    ['format-patch', '-100', '--stdout', 'HEAD'],
    ['format-patch', '-x', '--stdout', 'HEAD'],
    ['format-patch', '-1', '--stdout', hash, 'HEAD~1'],
    ['format-patch', '-1', '--output-directory=out', '--stdout', hash],
    ['format-patch', '-1', '--cover-letter', '--stdout', hash],
    ['format-patch', '-1', '--attach', '--stdout', hash],
    ['format-patch'],
  ]) {
    assert.throws(() => app.validateGitArguments(args), JSON.stringify(args));
  }
});

test('shortlog and count-objects are gated to the stats shapes', () => {
  // 放行：统计面板真实使用的固定形态。
  for (const args of [
    ['shortlog', '-s', '-n', '--no-merges', 'HEAD'],
    ['shortlog', '--no-merges', '-s', '-n', 'HEAD~10'],
    ['count-objects', '-vH'],
  ]) {
    assert.doesNotThrow(() => app.validateGitArguments(args), JSON.stringify(args));
  }
  // 拒绝：stdin 形态（挂起）、-e/-w 等未放行选项、多 rev、裸调用与维护写入。
  for (const args of [
    ['shortlog'],
    ['shortlog', '-s', '-n'],
    ['shortlog', '-sne', '--no-merges', 'HEAD'],
    ['shortlog', '-s', '-n', '-w', 'HEAD'],
    ['shortlog', '--email', '--no-merges', 'HEAD'],
    ['shortlog', '-s', '-n', 'HEAD', 'main'],
    ['count-objects'],
    ['count-objects', '-v'],
    ['count-objects', '-H'],
    ['count-objects', '--gc'],
  ]) {
    assert.throws(() => app.validateGitArguments(args), JSON.stringify(args));
  }
});

test('clean is gated to the single-file force delete form', () => {
  // 放行：未跟踪文件删除的真实调用形态（-f 单旗 + 可选 -- + 字面 pathspec）。
  for (const args of [
    ['clean', '-f', '--', 'src/tmp.txt'],
    ['clean', '-f', '--', 'a b.txt'],
    ['clean', '--force', 'loose.txt'],
    ['clean', '-f', '--', 'dir/file.txt', 'other.txt'],
  ]) {
    assert.doesNotThrow(() => app.validateGitArguments(args), JSON.stringify(args));
  }
  // 拒绝：目录面 -d、忽略文件面 -x/-X、交互 -i、干跑 -n、排除 -e、缺 -f、裸调用与未知选项。
  for (const args of [
    ['clean'],
    ['clean', '--', 'a.txt'],
    ['clean', '-d', '-f', '--', 'dir'],
    ['clean', '-fdx', '--', 'a.txt'],
    ['clean', '-x', '--', 'a.txt'],
    ['clean', '-X', '--', 'a.txt'],
    ['clean', '-i'],
    ['clean', '-n', '--', 'a.txt'],
    ['clean', '-e', 'pattern', '-f', '--', 'a.txt'],
    ['clean', '-q', '-f', '--', 'a.txt'],
    ['clean', '--dry-run', '--', 'a.txt'],
    ['clean', '-f', 'extra', '-x', '--', 'a.txt'],
  ]) {
    assert.throws(() => app.validateGitArguments(args), JSON.stringify(args));
  }
});

test('ls-remote is allowed as a bare network read', () => {
  // 放行：clone 预览的真实形态（URL 为裸位置参数，服务端自行过滤 refs/heads/）。
  for (const args of [
    ['ls-remote', 'https://git.example.com/team/project.git'],
    ['ls-remote', 'file:///e/repo/mirror.git'],
    ['ls-remote', 'origin'],
  ]) {
    assert.doesNotThrow(() => app.validateGitArguments(args), JSON.stringify(args));
  }
  // 拒绝：--upload-pack 等走私面（通用封锁清单仍生效）。
  for (const args of [
    ['ls-remote', '--upload-pack=evil', 'origin'],
    ['ls-remote', '--exec=evil', 'origin'],
  ]) {
    assert.throws(() => app.validateGitArguments(args), JSON.stringify(args));
  }
});

test('gc and fsck are gated to the bare maintenance forms', () => {
  // 放行：健康诊断/统计面板的裸调用形态。
  for (const args of [['gc'], ['fsck']]) {
    assert.doesNotThrow(() => app.validateGitArguments(args), JSON.stringify(args));
  }
  // 拒绝：--aggressive 重写打包、--prune=now 越过宽限期、fsck --strict 等未放行形态。
  for (const args of [
    ['gc', '--aggressive'],
    ['gc', '--prune=now'],
    ['gc', '--auto'],
    ['gc', '--quiet'],
    ['gc', '--no-detach'],
    ['fsck', '--strict'],
    ['fsck', '--no-dangling'],
    ['fsck', '--connectivity-only'],
    ['fsck', 'HEAD'],
  ]) {
    assert.throws(() => app.validateGitArguments(args), JSON.stringify(args));
  }
});

test('notes is gated to the commit-note read/write surface', () => {
  const hash = 'a'.repeat(40);
  // 放行：提交备注的最小读写面。
  for (const args of [
    ['notes', 'show', hash],
    ['notes', 'remove', 'HEAD'],
    ['notes', 'add', '-f', '-m', 'note text', hash],
    ['notes', 'add', '-m', '第一段备注', 'HEAD'],
  ]) {
    assert.doesNotThrow(() => app.validateGitArguments(args), JSON.stringify(args));
  }
  // 拒绝：append/copy/edit/merge/prune、-F/--stdin 文件面、多 -m、缺 rev 与裸调用。
  for (const args of [
    ['notes'],
    ['notes', 'show'],
    ['notes', 'show', '--', 'HEAD'],
    ['notes', 'append', '-m', 'x', 'HEAD'],
    ['notes', 'copy', 'a', 'b'],
    ['notes', 'edit', 'HEAD'],
    ['notes', 'merge', 'ref'],
    ['notes', 'prune'],
    ['notes', 'add', '-F', 'file.txt', 'HEAD'],
    ['notes', 'add', '--stdin', 'HEAD'],
    ['notes', 'add', '-m', 'a', '-m', 'b', 'HEAD'],
    ['notes', 'add', '-m', 'text'],
    ['notes', 'remove', '-x', 'HEAD'],
    ['notes', 'list'],
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
