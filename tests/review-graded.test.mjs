/**
 * 分级审查纯函数测试:parseHunks(代码块边界解析)、通过进度 toggle 与判定
 * (代码块/文件/自动升级/取消降级)、buildReviewReport(只含注释条目、行范围标签)。
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const root = process.cwd();
let app, tmp;

before(async () => {
  tmp = await fs.mkdtemp(path.join(root, '.test-tmp-review-graded-'));
  const bundle = path.join(tmp, 'review-graded.cjs');
  await build({
    stdin: {
      contents: `export { parseHunks, isFileApproved, isHunkApproved, coversAllHunks, toggleHunkApproval, toggleFileApproval, buildReviewReport } from './src/features/review/reviewLogic';`,
      resolveDir: root,
    },
    bundle: true, platform: 'node', format: 'cjs', outfile: bundle,
    logLevel: 'silent',
  });
  app = createRequire(import.meta.url)(bundle);
});

after(async () => {
  if (tmp && path.dirname(tmp) === root && path.basename(tmp).startsWith('.test-tmp-review-graded-')) await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5 });
});

const headerAt = (index, content) => ({ type: 'header', content });
const line = (type) => ({ type, content: 'x' });

const diffLines = [
  headerAt(0, '@@ -0,0 +1,3 @@'),
  line('add'), line('add'), line('add'),
  headerAt(4, '@@ -10,2 +18,5 @@'),
  line('add'), line('add'),
  headerAt(7, '@@ -30 +40 @@'),
  line('add'),
];

test('parseHunks extracts newStart/count from unified headers', () => {
  const hunks = app.parseHunks(diffLines);
  assert.deepEqual(hunks, [
    { newStart: 1, count: 3, index: 0 },
    { newStart: 18, count: 5, index: 4 },
    { newStart: 40, count: 1, index: 7 },
  ]);
  assert.deepEqual(app.parseHunks([line('context'), line('add')]), []);
});

test('hunk approval toggles, downgrades file approval on un-approve', () => {
  let approval = { approvedFiles: [], approvedHunks: {} };
  approval = app.toggleHunkApproval(approval, 'a.ts', 1);
  assert.equal(app.isHunkApproved(approval, 'a.ts', 1), true);
  assert.equal(app.isHunkApproved(approval, 'a.ts', 18), false);
  assert.equal(app.isHunkApproved(approval, 'b.ts', 1), false);

  approval = app.toggleHunkApproval(approval, 'a.ts', 1);
  assert.equal(app.isHunkApproved(approval, 'a.ts', 1), false);
});

test('file approval implies hunk approval; un-approving a hunk clears it', () => {
  let approval = app.toggleFileApproval({ approvedFiles: [], approvedHunks: {} }, 'a.ts');
  assert.equal(app.isFileApproved(approval, 'a.ts'), true);
  assert.equal(app.isHunkApproved(approval, 'a.ts', 99), true, 'file approval covers every hunk');

  approval = app.toggleHunkApproval(approval, 'a.ts', 1);
  assert.equal(app.isFileApproved(approval, 'a.ts'), false, 'file approval is downgraded');
  assert.equal(app.isHunkApproved(approval, 'a.ts', 1), false);
  assert.equal(app.isHunkApproved(approval, 'a.ts', 99), false);
});

test('coversAllHunks requires every hunk and at least one hunk', () => {
  let approval = { approvedFiles: [], approvedHunks: { 'a.ts': [1, 18] } };
  assert.equal(app.coversAllHunks(approval, 'a.ts', app.parseHunks(diffLines).slice(0, 2)), true);
  assert.equal(app.coversAllHunks(approval, 'a.ts', app.parseHunks(diffLines)), false);
  assert.equal(app.coversAllHunks(approval, 'empty.ts', []), false);
});

test('buildReviewReport only includes commented files with translated locations', () => {
  const header = ['# 代码审查意见', '审查范围:abc..def,共 3 条意见。请根据以下意见调整代码:'];
  const files = [
    { path: 'src/config.js', lines: [
      { location: '行 1-2', text: '硬编码密钥,请改用环境变量' },
      { location: '文件整体', text: '这个文件不应提交' },
    ] },
    { path: 'docs/x.md', lines: [] },
    { path: '.env', lines: [{ location: '行 1-1', text: '请加入 .gitignore' }] },
  ];
  const report = app.buildReviewReport(header, files);
  assert.match(report, /# 代码审查意见/);
  assert.match(report, /## src\/config\.js/);
  assert.match(report, /- 行 1-2:硬编码密钥/);
  assert.match(report, /- 文件整体:这个文件不应提交/);
  assert.match(report, /## \.env/);
  assert.doesNotMatch(report, /docs\/x\.md/, 'files without comments must not appear');

  assert.equal(app.buildReviewReport(header, []), '', 'no comments means no report');
});
