/**
 * identicon 纯函数测试：确定性（同种子同点阵）、镜像对称、色相锁定品牌安全色板、防空白点阵。
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
  tmp = await fs.mkdtemp(path.join(root, '.test-tmp-identicon-'));
  const bundle = path.join(tmp, 'identicon.cjs');
  await build({
    stdin: {
      contents: `export { identiconSpec } from './src/utils/identicon';`,
      resolveDir: root,
    },
    bundle: true, platform: 'node', format: 'cjs', outfile: bundle,
    logLevel: 'silent',
  });
  app = createRequire(import.meta.url)(bundle);
});

after(async () => {
  if (tmp && path.dirname(tmp) === root && path.basename(tmp).startsWith('.test-tmp-identicon-')) await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5 });
});

test('同种子生成完全相同的点阵与色相', () => {
  const a = app.identiconSpec('dev@example.com');
  const b = app.identiconSpec('dev@example.com');
  assert.deepEqual(a, b);
});

test('不同种子生成不同点阵（大概率）', () => {
  const seen = new Set();
  for (let i = 0; i < 50; i++) seen.add(JSON.stringify(app.identiconSpec(`user${i}@example.com`).cells));
  assert.ok(seen.size > 40, `50 个种子只出现 ${seen.size} 种点阵`);
});

test('点阵左右镜像对称', () => {
  for (let i = 0; i < 20; i++) {
    const { cells } = app.identiconSpec(`mirror-${i}@example.com`);
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 5; col++) {
        assert.equal(cells[row * 5 + col], cells[row * 5 + (4 - col)], `row ${row} col ${col} 不对称`);
      }
    }
  }
});

test('色相始终落在品牌安全色板内（不含蓝紫段）', () => {
  const allowed = [187, 152, 172, 42, 213, 336];
  for (let i = 0; i < 100; i++) {
    assert.ok(allowed.includes(app.identiconSpec(`hue-${i}@example.com`).hue), '出现色板外色相');
  }
});

test('空/空白种子不抛错且点阵不过稀', () => {
  for (const seed of ['', '   ']) {
    const { cells } = app.identiconSpec(seed);
    assert.ok(cells.filter(Boolean).length >= 3, '空白种子点阵过稀');
  }
});

test('真实邮箱样本点阵密度合理（不会全空）', () => {
  const emails = ['superauu@users.noreply.github.com', 'torvalds@linux-foundation.org', 'a@b.c', 'x'.repeat(50) + '@long.com'];
  for (const email of emails) {
    const { cells } = app.identiconSpec(email);
    const on = cells.filter(Boolean).length;
    assert.ok(on >= 4 && on <= 22, `${email} 点阵密度异常: ${on}`);
  }
});
