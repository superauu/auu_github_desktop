// 标签排序测试：`git tag -l` 默认字母序（旧版本在最上、v0.3.10 错排在 v0.3.9 前），
// parseGitTags 现按语义化版本降序；非版本命名按打标时间降序。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const root = process.cwd();
let temporary, app;
before(async () => {
  temporary = await fs.mkdtemp(path.join(root, '.test-tmp-tagsort-'));
  const bundle = path.join(temporary, 'helpers.cjs');
  await build({ stdin: { contents: `export { parseGitTags, sortTagsDescending } from './src/services/git/PorcelainParser';`, resolveDir: root }, bundle: true, platform: 'node', format: 'cjs', outfile: bundle, alias: { '@': path.join(root, 'src') }, logLevel: 'silent' });
  app = createRequire(import.meta.url)(bundle);
});
after(async () => {
  if (temporary && path.dirname(temporary) === root && path.basename(temporary).startsWith('.test-tmp-tagsort-')) {
    await fs.rm(temporary, { recursive: true, force: true });
  }
});

const line = (name, date = '2026-10-01T00:00:00Z') =>
  [name, 'a'.repeat(40), `release ${name}`, 'T', 't@t', date].join('\x1f');

test('tags sort by semantic version descending, not alphabetically', () => {
  // 模拟 git tag -l 的字母序输入：v0.3.10 排在 v0.3.9 前、最旧在最上。
  const input = [line('v0.2.0'), line('v0.3.0'), line('v0.3.1'), line('v0.3.10'), line('v0.3.11'), line('v0.3.2'), line('v0.3.9'), line('v0.5.2')].join('\n');
  const names = app.parseGitTags(input).map((tag) => tag.name);
  assert.deepEqual(names, ['v0.5.2', 'v0.3.11', 'v0.3.10', 'v0.3.9', 'v0.3.2', 'v0.3.1', 'v0.3.0', 'v0.2.0']);
});

test('rc pre-releases sort below their final release; non-version tags fall back to date', () => {
  const input = [
    line('v0.5.2'),
    line('v0.5.2-rc1', '2026-10-20T00:00:00Z'),
    line('release-final', '2026-10-21T00:00:00Z'),
    line('backup', '2026-09-01T00:00:00Z'),
  ].join('\n');
  const names = app.parseGitTags(input).map((tag) => tag.name);
  // 版本命名优先于非版本命名；预发布版本排在正式版之后；非版本按时间降序。
  assert.deepEqual(names, ['v0.5.2', 'v0.5.2-rc1', 'release-final', 'backup']);
});

test('pure sorter is stable and does not mutate input', () => {
  const tags = app.parseGitTags([line('v1.0.0'), line('v1.10.0'), line('v1.2.0')].join('\n'));
  const snapshot = tags.map((tag) => tag.name);
  const sorted = app.sortTagsDescending(tags);
  assert.deepEqual(sorted.map((tag) => tag.name), ['v1.10.0', 'v1.2.0', 'v1.0.0']);
  assert.deepEqual(tags.map((tag) => tag.name), snapshot, 'input array untouched');
});

test('later rc builds precede earlier rc builds, including compact legacy tag names', () => {
  const input = ['v1.0.0-rc1', 'v1.0.0-rc10', 'v1.0.0-rc2', 'v1.0.0', 'v1.0.0-rc.11', 'v1.0.0rc.3'];
  assert.deepEqual(app.parseGitTags(input.map(name => line(name)).join('\n')).map(tag => tag.name),
    ['v1.0.0', 'v1.0.0-rc.11', 'v1.0.0-rc10', 'v1.0.0rc.3', 'v1.0.0-rc2', 'v1.0.0-rc1']);
});

test('mixed dated and undated non-version tags have a consistent order for every input permutation', () => {
  const a = { name: 'a', tagger: { date: '2026-10-20T00:00:00Z' } };
  const b = { name: 'b' };
  const c = { name: 'c', tagger: { date: '2026-10-19T00:00:00Z' } };
  for (const input of [[a, b, c], [a, c, b], [b, a, c], [b, c, a], [c, a, b], [c, b, a]]) {
    assert.deepEqual(app.sortTagsDescending(input).map(tag => tag.name), ['a', 'c', 'b']);
  }
  assert.deepEqual(app.sortTagsDescending([b, { name: 'z', tagger: { date: 'invalid' } }]).map(tag => tag.name), ['z', 'b']);
});

test('prerelease precedence handles alpha, beta, numeric identifiers and final releases', () => {
  const ascending = ['v1.0.0-alpha', 'v1.0.0-alpha.1', 'v1.0.0-alpha.beta', 'v1.0.0-beta', 'v1.0.0-beta.2', 'v1.0.0-beta.11', 'v1.0.0-rc.1', 'v1.0.0'];
  assert.deepEqual(app.parseGitTags(ascending.map(name => line(name)).join('\n')).map(tag => tag.name), [...ascending].reverse());
});

test('version parsing consumes the whole tag and preserves large numeric version ordering', () => {
  const input = ['v1.0.0oops', 'v9999999999999999.0.0', 'v10000000000000000.0.0', 'v1.0.0+build.5'];
  assert.deepEqual(app.parseGitTags(input.map(name => line(name)).join('\n')).map(tag => tag.name),
    ['v10000000000000000.0.0', 'v9999999999999999.0.0', 'v1.0.0+build.5', 'v1.0.0oops']);
});
