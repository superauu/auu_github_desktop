/**
 * Errors 集成 M5 测试（PRD docs/errors-integration-prd.md §12 M5 验收）：
 * 1. 上下文收集（§8.5）：仅 exact/unique 档、敏感文件跳过、文件数/单文件/总预算上限、
 *    去重、不可读跳过、截断标注；
 * 2. 提案校验：```json 围栏剥离、patch 必须是统一 diff 形状、analysis 超长拒绝；
 * 3. 工作区保护与拒绝零变更由对话框保证（git 层不进单测），此处覆盖纯逻辑。
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const root = process.cwd();
let tmp, app;

before(async () => {
  tmp = await fs.mkdtemp(path.join(root, '.test-tmp-errors-ai-'));
  const outfile = path.join(tmp, 'ai-fix.cjs');
  await build({
    stdin: {
      contents: [
        `export { isSensitivePath, collectFixTargets, selectContextFiles } from './src/services/errors/aiFixContext';`,
        `export { parseErrorFixProposal } from './src/services/ai/AiErrorFixService';`,
        `export { collectAiFixContext } from './src/services/errors/aiFixContext';`,
      ].join(''),
      resolveDir: root,
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile,
    alias: { '@': path.join(root, 'src') },
    logLevel: 'silent',
  });
  app = createRequire(import.meta.url)(outfile);
});
after(async () => {
  if (tmp && path.dirname(tmp) === root && path.basename(tmp).startsWith('.test-tmp-errors-ai-')) {
    await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
  }
});

test('上下文收集：敏感跳过、仅唯一/精确档、文件数与预算上限、截断标注', () => {
  // 敏感路径
  for (const sensitive of ['.env', 'config/.env.local', 'secrets/keys.ts', 'server/credentials.json', 'certs/a.pem', 'id_rsa', 'ssh/.ssh/known_hosts', 'x.Keystore']) {
    assert.equal(app.isSensitivePath(sensitive), true, sensitive);
  }
  for (const safe of ['src/app.ts', 'docs/design.md', 'envLoader.ts', 'src/keyboard.ts']) {
    assert.equal(app.isSensitivePath(safe), false, safe);
  }

  const tracked = ['src/app.ts', 'src/env.ts', 'src/lib/a.ts', 'src/lib/index.ts', 'src/lib/utils.ts', 'other/utils.ts', '.env'];
  // 帧命中：app.ts（唯一）、a.ts（唯一）、utils.ts（两候选择优 src/lib/utils.ts）、index.ts（唯一）
  const frames = [
    { file: 'src/lib/a.ts', line: 10 },
    { file: 'x/y/app.ts', line: 3 },
    { file: 'src/lib/utils.ts', line: 2 },
    { file: 'nope/zzz.ts', line: 1 },       // unresolved → 跳过
    { file: 'a/index.ts', line: 1 },        // 唯一（src/lib/index.ts）
  ];
  const targets = app.collectFixTargets(frames, { trackedFiles: tracked, maxTargets: 5 });
  assert.deepEqual(targets.map((target) => target.path), ['src/lib/a.ts', 'src/app.ts', 'src/lib/utils.ts', 'src/lib/index.ts']);
  assert.equal(targets[1].line, 3);

  // .env 在 tracked 里但不会成为目标（没有帧指向它）；即便指向也被敏感规则剔除
  const envTargets = app.collectFixTargets([{ file: '.env', line: 1 }], { trackedFiles: ['.env'] });
  assert.deepEqual(envTargets, []);

  // 读取上限：文件数、单文件截断、总预算、不可读跳过
  const big = 'x'.repeat(5000);
  const reads = new Map([
    ['src/lib/a.ts', big],
    ['src/app.ts', null],                    // 不可读 → 跳过
    ['src/lib/utils.ts', 'y'.repeat(20000)], // 超单文件上限 → 截断
  ]);
  const result = app.selectContextFiles(targets, (path) => reads.get(path) ?? null, { maxFiles: 3, fileCharCap: 8000, totalBudget: 12000 });
  assert.equal(result.files.length, 2); // a.ts + utils.ts（app.ts 不可读）
  assert.equal(result.files[0].content.length, 5000);
  assert.equal(result.files[0].truncated, false);
  assert.equal(result.files[1].content.length, 7000); // 预算余量 12000-5000=7000
  assert.equal(result.files[1].truncated, true);
  assert.equal(result.truncated, true);
  assert.ok(result.skipped >= 2); // app.ts 不可读 + index.ts 超预算
});

test('提案校验：围栏剥离、diff 形状强制、超长/坏载荷拒绝', () => {
  const patch = 'diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-old\n+new\n';
  const good = JSON.stringify({ analysis: '空指针：未判空', patch });
  // 带 ```json 围栏
  assert.deepEqual(app.parseErrorFixProposal('```json\n' + good + '\n```'), { analysis: '空指针：未判空', patch });
  // 裸 JSON
  assert.deepEqual(app.parseErrorFixProposal(good), { analysis: '空指针：未判空', patch });

  assert.throws(() => app.parseErrorFixProposal('not json'), /无法解析|parse/i);
  // patch 不是 diff 形状
  assert.throws(() => app.parseErrorFixProposal(JSON.stringify({ analysis: 'a', patch: '请手工修改文件' })), /无法解析|parse/i);
  // 缺 patch
  assert.throws(() => app.parseErrorFixProposal(JSON.stringify({ analysis: 'a' })), /无法解析|parse/i);
  // analysis 超长
  assert.throws(() => app.parseErrorFixProposal(JSON.stringify({ analysis: 'x'.repeat(4001), patch })), /无法解析|parse/i);
  // 上下文不足形态：空 patch 被拒（对话框层会走 noPatch 提示分支，解析层维持严格）
  assert.throws(() => app.parseErrorFixProposal(JSON.stringify({ analysis: 'insufficient', patch: '' })), /无法解析|parse/i);
});
