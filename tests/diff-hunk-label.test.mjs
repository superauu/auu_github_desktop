import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const root = process.cwd();
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
let tmp, app;
before(async () => {
  tmp = await fs.mkdtemp(path.join(root, '.test-tmp-hunk-label-'));
  const outfile = path.join(tmp, 'app.cjs');
  await build({ stdin: { contents: `export * from './src/utils/diffHunkLabel'; export { parseDiffOutput, buildHunkPatch, groupDiffIntoHunks } from './src/services/git/PorcelainParser';`, resolveDir: root }, bundle: true, platform: 'node', format: 'cjs', outfile, alias: { '@': path.join(root, 'src') }, logLevel: 'silent' });
  app = createRequire(import.meta.url)(outfile);
});
after(async () => { if (tmp && path.dirname(tmp) === root && path.basename(tmp).startsWith('.test-tmp-hunk-label-')) await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5 }); });

test('ranges use inclusive line numbers and retain Git-extracted context separately', () => {
  const raw = '@@ -47,6 +47,8 @@ The commit panel sits beside the diff';
  assert.deepEqual(app.parseDiffHunkHeader(raw), { old: { start: 47, count: 6 }, next: { start: 47, count: 8 }, context: 'The commit panel sits beside the diff' });
  assert.equal(app.formatDiffHunkLabel(raw, 'zh'), '原 47–52 行 → 新 47–54 行');
  assert.equal(app.formatDiffHunkLabel(raw, 'en'), 'Old lines 47–52 → New lines 47–54');
});

test('omitted counts mean one line and zero-length ranges describe empty sides or insertion anchors', () => {
  assert.equal(app.formatDiffHunkLabel('@@ -7 +12 @@', 'zh'), '原 7 行 → 新 12 行');
  assert.equal(app.formatDiffHunkLabel('@@ -0,0 +1,3 @@', 'zh'), '原文件无内容 → 新 1–3 行');
  assert.equal(app.formatDiffHunkLabel('@@ -1,3 +0,0 @@', 'zh'), '原 1–3 行 → 新文件无内容');
  assert.equal(app.formatDiffHunkLabel('@@ -12,0 +13,2 @@', 'zh'), '原第 12 行后 → 新 13–14 行');
  assert.equal(app.formatDiffHunkLabel('@@ -13,2 +12,0 @@', 'zh'), '原 13–14 行 → 新第 12 行后');
});

test('binary, combined, malformed and unsafe numeric ranges remain verbatim rather than guessed', () => {
  for (const raw of ['Binary files a/a and b/a differ', '@@@ -1,2 -1,3 +1,4 @@@', '@@ -1,x +1,3 @@', '@@ -0 +1 @@', '@@ -9007199254740991,2 +1 @@', 'ordinary header']) {
    assert.equal(app.parseDiffHunkHeader(raw), null); assert.equal(app.formatDiffHunkLabel(raw, 'zh'), raw);
  }
});

test('added and removed counts come from body lines, not context-inclusive range lengths', () => {
  const raw = 'diff --git a/a b/a\n--- a/a\n+++ b/a\n@@ -47,6 +47,8 @@ context\n same\n same\n same\n+new one\n+new two\n same\n same\n same\n';
  const lines = app.parseDiffOutput(raw), before = structuredClone(lines), stats = app.diffHunkStats(lines);
  assert.deepEqual(stats.get(0), { added: 2, removed: 0 }); assert.deepEqual(lines, before);
  const mixed = app.parseDiffOutput('diff --git a/a b/a\n--- a/a\n+++ b/a\n@@ -1,2 +1,2 @@\n-old\n+new\n same\n@@ -20 +20,2 @@\n same\n+last\n');
  assert.deepEqual([...app.diffHunkStats(mixed).values()], [{ added: 1, removed: 1 }, { added: 1, removed: 0 }]);
});

test('presentation leaves hunk identities, CRLF bytes and generated staging patches untouched', () => {
  const raw = 'diff --git a/a b/a\n--- a/a\n+++ b/a\n@@ -1 +1 @@ original context\n-before\r\n+after\r\n';
  const lines = app.parseDiffOutput(raw), hunk = app.groupDiffIntoHunks(lines)[0], before = app.buildHunkPatch('a', hunk, 'stage');
  app.formatDiffHunkLabel(hunk[0].content, 'zh'); app.diffHunkStats(lines);
  assert.equal(hunk[0].content, '@@ -1 +1 @@ original context'); assert.equal(app.buildHunkPatch('a', hunk, 'stage'), before); assert.match(before, /\+after\r\n/);
});
