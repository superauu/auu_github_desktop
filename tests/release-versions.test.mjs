import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateReleaseVersions } from '../scripts/check-release.mjs';

const compatible = () => ({
  appVersions: { 'package.json': '0.3.7', 'Cargo.toml': '0.3.7' },
  tauri: '2.12.3', api: '2.12.4', cli: '2.12.3', runtime: '2.12.2', runtimeWry: '2.12.2', tag: 'v0.3.7',
  // 新契约：tag 构建必须带发版说明（缺失在检查层拦截）；个别用例显式覆盖回 undefined。
  releaseNotes: 'release notes',
});

test('release accepts compatible Tauri patch versions', () => {
  assert.doesNotThrow(() => validateReleaseVersions(compatible()));
});
test('release rejects the v0.3.6 API mismatch before desktop compilation', () => {
  assert.throws(() => validateReleaseVersions({ ...compatible(), api: '2.11.1' }), /Tauri version mismatch: api/);
});
test('release rejects the v0.3.5 runtime mismatch', () => {
  assert.throws(() => validateReleaseVersions({ ...compatible(), tauri: '2.11.6', api: '2.11.1', cli: '2.11.4' }), /Tauri version mismatch: runtime/);
});
test('release rejects inconsistent application versions', () => {
  assert.throws(() => validateReleaseVersions({ ...compatible(), appVersions: { 'package.json': '0.3.7', 'Cargo.toml': '0.3.6' } }), /App version mismatch/);
});
test('release rejects a tag that differs from the installer version', () => {
  assert.throws(() => validateReleaseVersions({ ...compatible(), tag: 'v0.3.6' }), /Release tag/);
});

test('tag builds require non-empty release notes', () => {
  // build-windows.yml 在文件缺失时会静默降级为一行默认文案——在检查层拦截而不是发出去才发现。
  assert.throws(() => validateReleaseVersions({ ...compatible(), releaseNotes: undefined }), /Missing release notes/);
  assert.throws(() => validateReleaseVersions({ ...compatible(), releaseNotes: '   \n' }), /Missing release notes/);
  assert.doesNotThrow(() => validateReleaseVersions({ ...compatible(), releaseNotes: '# v0.3.7\n\n- 变更条目\n' }));
});
test('release notes are optional outside tag builds unless required', () => {
  const local = () => {
    const { releaseNotes, ...rest } = compatible();
    return { ...rest, tag: undefined };
  };
  assert.doesNotThrow(() => validateReleaseVersions(local()));
  assert.throws(() => validateReleaseVersions({ ...local(), requireNotes: true }), /Missing release notes/);
  assert.doesNotThrow(() => validateReleaseVersions({ ...local(), requireNotes: true, releaseNotes: 'notes' }));
});

test('bumpVersion rewrites all version anchors and fails loudly on drift', async () => {
  const { bumpVersion, buildBumpEdits } = await import('../scripts/bump-version.mjs');
  const fs = await import('node:fs/promises');
  const os = await import('node:os');
  const path = await import('node:path');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'auugit-bump-'));
  try {
    await fs.mkdir(path.join(root, 'src-tauri'), { recursive: true });
    await fs.mkdir(path.join(root, 'node_modules/@tauri-apps/api'), { recursive: true });
    await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'auugit', version: '0.6.3' }, null, 2) + '\n');
    await fs.writeFile(path.join(root, 'package-lock.json'), JSON.stringify({ name: 'auugit', version: '0.6.3', lockfileVersion: 3, packages: { '': { name: 'auugit', version: '0.6.3' }, 'node_modules/@tauri-apps/api': { version: '2.12.4' } } }, null, 2) + '\n');
    await fs.writeFile(path.join(root, 'src-tauri/tauri.conf.json'), JSON.stringify({ version: '0.6.3' }, null, 2) + '\n');
    await fs.writeFile(path.join(root, 'src-tauri/Cargo.toml'), '[package]\nname = "auugit"\nversion = "0.6.3"\n');
    await fs.writeFile(path.join(root, 'src-tauri/Cargo.lock'), '[[package]]\nname = "auugit"\nversion = "0.6.3"\n\n[[package]]\nname = "tauri"\nversion = "2.12.3"\n');
    await fs.writeFile(path.join(root, 'node_modules/@tauri-apps/api/package.json'), JSON.stringify({ version: '2.12.4' }));

    // 完整 checkRelease 依赖 node_modules 的 tauri/runtime 条目，这里直接断言锚定改写结果。
    const edits = buildBumpEdits(root, '0.6.3', '0.6.4');
    for (const edit of edits) {
      const text = await fs.readFile(edit.path, 'utf8');
      await fs.writeFile(edit.path, edit.apply(text));
    }
    assert.equal(JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')).version, '0.6.4');
    const lock = JSON.parse(await fs.readFile(path.join(root, 'package-lock.json'), 'utf8'));
    assert.equal(lock.version, '0.6.4');
    assert.equal(lock.packages[''].version, '0.6.4');
    assert.equal(JSON.parse(await fs.readFile(path.join(root, 'src-tauri/tauri.conf.json'), 'utf8')).version, '0.6.4');
    assert.match(await fs.readFile(path.join(root, 'src-tauri/Cargo.toml'), 'utf8'), /^version = "0\.6\.4"$/m);
    const cargoLock = await fs.readFile(path.join(root, 'src-tauri/Cargo.lock'), 'utf8');
    assert.match(cargoLock, /name = "auugit"\nversion = "0\.6\.4"/);
    assert.match(cargoLock, /name = "tauri"\nversion = "2\.12\.3"/);

    // 幂等性防线：锚定串已不匹配旧版本时必须整体失败而不是落半套改动。
    assert.throws(() => buildBumpEdits(root, '0.6.3', '0.6.5').map((edit) => edit.apply('version = "0.6.3"')), /锚定串命中/);
    assert.throws(() => bumpVersion(root, 'not-semver'), /x\.y\.z/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
