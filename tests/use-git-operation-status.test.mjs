/**
 * useGitOperationStatus：Git 写入活动的操作名、耗时与 15 秒等待提示。
 * 通过 GitQueue.serializeGitWrite 注入真实活动，react-test-renderer 渲染 hook，
 * 风格同 tests/hook-lifecycle.test.mjs。
 */
import { before, after, test, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import React from 'react';
import './react19-test-env.mjs';
import { create, act } from 'react-test-renderer';

const root = process.cwd(), saved = new Map();
globalThis.localStorage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key) };
let app, tmp;

const deferred = () => { let resolve; const promise = new Promise(a => { resolve = a; }); return { promise, resolve }; };
let latest;
const Probe = ({ repoPath }) => { latest = app.useGitOperationStatus(repoPath); return null; };
const renderProbe = async repoPath => {
  let renderer;
  await act(async () => { renderer = create(React.createElement(Probe, { repoPath })); });
  return renderer;
};

before(async () => {
  tmp = await fs.mkdtemp(path.join(root, '.test-tmp-opstatus-'));
  const bundle = path.join(tmp, 'opstatus.cjs');
  await build({ stdin: { contents: `export { useGitOperationStatus } from './src/hooks/useGitOperationStatus'; export { serializeGitWrite } from './src/services/git/GitQueue';`, resolveDir: root }, bundle: true, platform: 'node', format: 'cjs', outfile: bundle, external: ['react', 'react-dom'], alias: { '@': path.join(root, 'src') }, logLevel: 'silent' });
  app = createRequire(import.meta.url)(bundle);
});
after(async () => {
  if (tmp && path.dirname(tmp) === root && path.basename(tmp).startsWith('.test-tmp-opstatus-')) await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
});

test('没有进行中的 Git 写入时，不显示操作名与等待提示', async () => {
  const renderer = await renderProbe('/repo-idle-status');
  assert.equal(latest.activity, null);
  assert.equal(latest.operationLabel, '');
  assert.equal(latest.elapsed, 0);
  assert.equal(latest.waitHint, '');
  await act(async () => renderer.unmount());
});

test('提交进行中显示中文操作名，15 秒内不提示等待', async () => {
  const release = deferred();
  const done = app.serializeGitWrite('/repo-commit-status', () => release.promise, 'commit');
  await new Promise(resolve => setImmediate(resolve));
  const renderer = await renderProbe('/repo-commit-status');
  assert.equal(latest.activity?.command, 'commit');
  assert.equal(latest.operationLabel, '正在提交（含仓库检查与签名）');
  assert.ok(latest.elapsed >= 0);
  assert.equal(latest.waitHint, '', '15 秒内不应出现等待提示');
  await act(async () => { release.resolve(); });
  await done;
  await act(async () => renderer.unmount());
});

test('提交超过 15 秒出现签名/仓库检查等待提示', async () => {
  mock.timers.enable({ apis: ['Date', 'setInterval'] });
  try {
    const release = deferred();
    const done = app.serializeGitWrite('/repo-slow-commit', () => release.promise, 'commit');
    await new Promise(resolve => setImmediate(resolve));
    const renderer = await renderProbe('/repo-slow-commit');
    assert.equal(latest.waitHint, '');
    await act(async () => { mock.timers.tick(16_000); });
    assert.equal(latest.elapsed, 16);
    assert.match(latest.waitHint, /Git 提交仍未返回/);
    await act(async () => { release.resolve(); });
    await done;
    await act(async () => renderer.unmount());
  } finally { mock.timers.reset(); }
});

test('推送超过 15 秒出现推送专属提示', async () => {
  mock.timers.enable({ apis: ['Date', 'setInterval'] });
  try {
    const release = deferred();
    const done = app.serializeGitWrite('/repo-slow-push', () => release.promise, 'push');
    await new Promise(resolve => setImmediate(resolve));
    const renderer = await renderProbe('/repo-slow-push');
    await act(async () => { mock.timers.tick(16_000); });
    assert.match(latest.waitHint, /正在等待 Git 推送返回/);
    assert.doesNotMatch(latest.waitHint, /Git 提交仍未返回/, '推送不应复用提交提示');
    await act(async () => { release.resolve(); });
    await done;
    await act(async () => renderer.unmount());
  } finally { mock.timers.reset(); }
});

test('未知命令的操作名回退到通用处理文案', async () => {
  const release = deferred();
  const done = app.serializeGitWrite('/repo-unknown-command', () => release.promise, 'frobnicate');
  await new Promise(resolve => setImmediate(resolve));
  const renderer = await renderProbe('/repo-unknown-command');
  assert.equal(latest.operationLabel, '正在处理 Git 操作…');
  await act(async () => { release.resolve(); });
  await done;
  await act(async () => renderer.unmount());
});

test('活动结束后回到空闲态', async () => {
  const release = deferred();
  const done = app.serializeGitWrite('/repo-after-done', () => release.promise, 'commit');
  await new Promise(resolve => setImmediate(resolve));
  const renderer = await renderProbe('/repo-after-done');
  assert.ok(latest.activity);
  await act(async () => { release.resolve(); });
  await done;
  await act(async () => renderer.unmount());
  const after = await renderProbe('/repo-after-done');
  assert.equal(latest.activity, null);
  assert.equal(latest.operationLabel, '');
  await act(async () => after.unmount());
});
