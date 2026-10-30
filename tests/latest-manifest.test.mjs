/**
 * latest.json 三平台合并（scripts/merge-latest-manifest.mjs）回归防线：
 * 1. darwin-aarch64 / darwin-x86_64（x64 命名）/ linux-x86_64 三平台合并，
 *    version/notes/pub_date/windows 条目原样保留，URL 指向 release 下载地址；
 * 2. 无签名的产物（或未知形态如 *-setup.exe.sig）跳过不报错；
 * 3. 空 manifest / 非 updater 结构拒绝（fail loud）；
 * 4. 重跑幂等：合并结果再次合并输出不变。
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { mergeLatestManifest, platformOf } from '../scripts/merge-latest-manifest.mjs';

let temporary;
const write = async (relative, content) => {
  const target = path.join(temporary, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content);
};
const baseManifest = () => JSON.stringify({
  version: '0.6.3',
  notes: 'release notes',
  pub_date: '2026-10-29T00:00:00Z',
  platforms: { 'windows-x86_64': { signature: 'win-sig', url: 'https://github.com/owner/repo/releases/download/v0.6.3/AuuGit_0.6.3_x64-setup.exe' } },
});

before(async () => {
  temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'auugit-latest-manifest-'));
});
after(async () => {
  if (temporary) await fs.rm(temporary, { recursive: true, force: true });
});

test('platformOf classifies updater artifact names', () => {
  assert.equal(platformOf('AuuGit_0.6.3_aarch64.app.tar.gz'), 'darwin-aarch64');
  assert.equal(platformOf('AuuGit_0.6.3_x64.app.tar.gz'), 'darwin-x86_64');
  assert.equal(platformOf('AuuGit_0.6.3_x86_64.app.tar.gz'), 'darwin-x86_64');
  assert.equal(platformOf('AuuGit_0.6.3_amd64.AppImage'), 'linux-x86_64');
  // Windows 安装器签名与未知形态不归属任何更新器平台。
  assert.equal(platformOf('AuuGit_0.6.3_x64-setup.exe'), null);
  assert.equal(platformOf('AuuGit_0.6.3_x64-setup.exe.sig'), null);
  assert.equal(platformOf('AuuGit_0.6.3.dmg'), null);
});

test('merges three platforms and preserves the windows entry', async () => {
  const manifestPath = path.join(temporary, 'latest.json');
  const artifacts = path.join(temporary, 'artifacts-1');
  await write('latest.json', baseManifest());
  await write('artifacts-1/AuuGit_0.6.3_aarch64.app.tar.gz', 'binary');
  await write('artifacts-1/AuuGit_0.6.3_aarch64.app.tar.gz.sig', 'sig-aarch64\n');
  await write('artifacts-1/AuuGit_0.6.3_x64.app.tar.gz', 'binary');
  await write('artifacts-1/AuuGit_0.6.3_x64.app.tar.gz.sig', 'sig-x64');
  await write('artifacts-1/AuuGit_0.6.3_amd64.AppImage', 'binary');
  await write('artifacts-1/AuuGit_0.6.3_amd64.AppImage.sig', 'sig-linux');

  const { manifest, added, skipped } = await mergeLatestManifest({
    manifestPath, artifactsDir: artifacts, tag: 'v0.6.3', repo: 'owner/repo',
  });

  assert.deepEqual(added.sort(), ['darwin-aarch64', 'darwin-x86_64', 'linux-x86_64']);
  assert.deepEqual(skipped, []);
  assert.equal(manifest.version, '0.6.3');
  assert.equal(manifest.notes, 'release notes');
  assert.equal(manifest.pub_date, '2026-10-29T00:00:00Z');
  assert.equal(manifest.platforms['windows-x86_64'].signature, 'win-sig');
  assert.equal(manifest.platforms['darwin-aarch64'].signature, 'sig-aarch64');
  assert.equal(manifest.platforms['darwin-aarch64'].url, 'https://github.com/owner/repo/releases/download/v0.6.3/AuuGit_0.6.3_aarch64.app.tar.gz');
  assert.equal(manifest.platforms['darwin-x86_64'].signature, 'sig-x64');
  assert.equal(manifest.platforms['linux-x86_64'].url, 'https://github.com/owner/repo/releases/download/v0.6.3/AuuGit_0.6.3_amd64.AppImage');
  // windows 条目仍在首位（既有键先列），新键按产物文件名排序（确定性输出）。
  assert.deepEqual(Object.keys(manifest.platforms), ['windows-x86_64', 'darwin-aarch64', 'linux-x86_64', 'darwin-x86_64']);
  const contract = JSON.parse(await fs.readFile(new URL('./fixtures/updater-latest.json', import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(manifest.platforms).sort(), Object.keys(contract.platforms).sort(), 'the same platform keys are consumed by the Rust updater contract test');
});

test('skips unsigned artifacts and unknown signatures without failing', async () => {
  const manifestPath = path.join(temporary, 'latest-2.json');
  const artifacts = path.join(temporary, 'artifacts-2');
  await write('latest-2.json', baseManifest());
  await write('artifacts-2/AuuGit_0.6.3_aarch64.app.tar.gz', 'binary'); // 有产物无签名
  await write('artifacts-2/AuuGit_0.6.3_amd64.AppImage.sig', ''); // 空签名
  await write('artifacts-2/AuuGit_0.6.3_x64-setup.exe.sig', 'win-sig-2'); // Windows 安装器签名（已在 manifest）

  const { manifest, added, skipped } = await mergeLatestManifest({
    manifestPath, artifactsDir: artifacts, tag: 'v0.6.3', repo: 'owner/repo',
  });

  assert.deepEqual(added, []);
  assert.deepEqual(skipped, ['linux-x86_64 (AuuGit_0.6.3_amd64.AppImage.sig: empty signature)']);
  assert.deepEqual(Object.keys(manifest.platforms), ['windows-x86_64']);
});

test('rejects malformed manifests', async () => {
  const bad = path.join(temporary, 'bad.json');
  await write('bad.json', JSON.stringify({ version: '0.6.3' }));
  await assert.rejects(
    () => mergeLatestManifest({ manifestPath: bad, artifactsDir: temporary, tag: 'v0.6.3', repo: 'owner/repo' }),
    /latest\.json/,
  );
  const broken = path.join(temporary, 'broken.json');
  await write('broken.json', '{not json');
  await assert.rejects(
    () => mergeLatestManifest({ manifestPath: broken, artifactsDir: temporary, tag: 'v0.6.3', repo: 'owner/repo' }),
    SyntaxError,
  );
});

test('re-running the merge is idempotent', async () => {
  const manifestPath = path.join(temporary, 'latest-3.json');
  const artifacts = path.join(temporary, 'artifacts-3');
  await write('latest-3.json', baseManifest());
  await write('artifacts-3/AuuGit_0.6.3_aarch64.app.tar.gz.sig', 'sig-aarch64');
  const args = { manifestPath, artifactsDir: artifacts, tag: 'v0.6.3', repo: 'owner/repo' };
  const first = await mergeLatestManifest(args);
  const second = await mergeLatestManifest(args);
  assert.deepEqual(second.manifest, first.manifest);
  assert.deepEqual(second.added, first.added);
});
