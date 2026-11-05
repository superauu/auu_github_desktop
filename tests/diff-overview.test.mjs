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
  tmp = await fs.mkdtemp(path.join(root, '.test-tmp-diff-overview-'));
  const outfile = path.join(tmp, 'app.cjs');
  await build({
    stdin: {
      contents: `export * from './src/utils/diffOverview'; export { sameFileLines } from './src/features/git/useDiffFileContent';`,
      resolveDir: root,
    },
    bundle: true, platform: 'node', format: 'cjs', outfile,
    alias: { '@': path.join(root, 'src') }, logLevel: 'silent',
  });
  app = createRequire(import.meta.url)(outfile);
});
after(async () => { if (tmp && path.dirname(tmp) === root && path.basename(tmp).startsWith('.test-tmp-diff-overview-')) await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5 }); });

const line = (type, content = '', newNo = null, oldNo = null) => ({ type, content, newNo, oldNo });
const spans = runs => runs.map(run => [run.startIndex, run.endIndex, run.hasAdd, run.hasDel]);

test('unified marker runs merge contiguous changes and break at headers and context', () => {
  const lines = [
    line('context'),                                              // 0
    line('delete', '-a'), line('delete', '-b'), line('add', '+c'), // 1..3
    line('header', '@@ -5 +5 @@'),                                 // 4 切断
    line('add', '+d'),                                             // 5
    line('context'),                                               // 6
    line('delete', '-e'),                                          // 7
  ];
  assert.deepEqual(spans(app.computeDiffMarkerRuns(lines)), [
    [1, 3, true, true],
    [5, 5, true, false],
    [7, 7, false, true],
  ]);
  assert.deepEqual(app.computeDiffMarkerRuns([]), []);
  assert.deepEqual(app.computeDiffMarkerRuns([line('context'), line('header', '@@')]), []);
});

test('split marker runs count either column as a change and headers break runs', () => {
  const rows = [
    { isHeader: true, headerContent: '@@' },                                            // 0
    { left: { type: 'delete', content: '-a' } },                                        // 1
    { left: { type: 'delete', content: '-b' }, right: { type: 'add', content: '+b' } }, // 2
    { right: { type: 'add', content: '+c' } },                                          // 3
    { left: { type: 'context', content: ' x' }, right: { type: 'context', content: ' x' } }, // 4 切断
    { right: { type: 'add', content: '+d' } },                                          // 5
    {},                                                                                 // 6 补位行不算变更
  ];
  assert.deepEqual(spans(app.computeSplitMarkerRuns(rows)), [
    [1, 3, true, true],
    [5, 5, true, false],
  ]);
});

test('sameFileLines decides when a re-read keeps the displayed array identity', () => {
  const a = ['x', 'y'];
  assert.equal(app.sameFileLines(a, a), true);
  assert.equal(app.sameFileLines(a, ['x', 'y']), true);
  assert.equal(app.sameFileLines(a, ['x', 'z']), false);
  assert.equal(app.sameFileLines(a, ['x']), false);
  assert.equal(app.sameFileLines([], []), true);
});
