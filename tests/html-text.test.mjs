/**
 * htmlToPlainText（src/utils/htmlText.ts）可测面：快路径守卫与回落行为。
 * HTML 解析路径依赖 DOMParser（node 无此 API），由浏览器真机验证。
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const root = process.cwd();
let temporary, app;
before(async () => {
  temporary = await fs.mkdtemp(path.join(root, '.test-tmp-html-text-'));
  const bundle = path.join(temporary, 'html-text.cjs');
  await build({ stdin: { contents: `export * from './src/utils/htmlText';`, resolveDir: root }, bundle: true, platform: 'node', format: 'cjs', outfile: bundle, logLevel: 'silent' });
  app = createRequire(import.meta.url)(bundle);
});
after(async () => {
  if (temporary && path.dirname(temporary) === root && path.basename(temporary).startsWith('.test-tmp-html-text-')) {
    await fs.rm(temporary, { recursive: true, force: true });
  }
});

test('plain text bodies pass through untouched', () => {
  assert.equal(app.htmlToPlainText('修复登录流程\n\n- 修正跳转'), '修复登录流程\n\n- 修正跳转');
  assert.equal(app.htmlToPlainText(''), '');
  assert.equal(app.htmlToPlainText(null), '');
  assert.equal(app.htmlToPlainText(undefined), '');
});

test('html bodies fall back to raw input when DOMParser is unavailable (node)', () => {
  // node 无 DOMParser：必须原样回落而不是抛错；浏览器内由真机验证解析路径。
  assert.equal(app.htmlToPlainText('<p>hi</p>'), '<p>hi</p>');
});
