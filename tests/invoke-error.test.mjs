/**
 * normalizeInvokeError：Tauri invoke 拒绝值的每一种形状都归一为带有效消息的 Error。
 * 纯函数直测，风格同 tests/history-search.test.mjs 的 esbuild 打包。
 */
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const root = process.cwd();
let app, tmp;

before(async () => {
  tmp = await fs.mkdtemp(path.join(root, '.test-tmp-invoke-'));
  const outfile = path.join(tmp, 'invoke.cjs');
  await build({ stdin: { contents: `export { normalizeInvokeError } from './src/services/git/invokeError';`, resolveDir: root }, bundle: true, platform: 'node', format: 'cjs', outfile, logLevel: 'silent' });
  app = createRequire(import.meta.url)(outfile);
});
after(async () => {
  if (tmp && path.dirname(tmp) === root && path.basename(tmp).startsWith('.test-tmp-invoke-')) await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
});

const normalize = (error, fallback = '操作失败') => app.normalizeInvokeError(error, fallback);

test('带消息的 Error 原样透传，保留类型与堆栈', () => {
  const original = new Error('real failure');
  const result = normalize(original);
  assert.equal(result, original);
  assert.equal(result.message, 'real failure');
});

test('字符串拒绝值去空白后作为消息', () => {
  assert.equal(normalize('  boom  ').message, 'boom');
  assert.equal(normalize('boom', 'ignored').message, 'boom');
});

test('对象拒绝值按 message、error、code 优先级取消息', () => {
  assert.equal(normalize({ message: 'from message' }).message, 'from message');
  assert.equal(normalize({ error: 'from error' }).message, 'from error');
  assert.equal(normalize({ code: 'ERR_CODE' }).message, 'ERR_CODE');
  assert.equal(normalize({ message: '  ', error: 'from error' }).message, 'from error');
});

test('普通对象走 JSON 序列化兜底', () => {
  assert.equal(normalize({ foo: 1 }).message, '{"foo":1}');
});

test('循环引用对象不会抛异常，落回 fallback', () => {
  const circular = {};
  circular.self = circular;
  assert.equal(normalize(circular).message, '操作失败');
});

test('undefined、null 与空消息 Error 落回 fallback，而不是序列化出 {}', () => {
  assert.equal(normalize(undefined).message, '操作失败');
  assert.equal(normalize(null).message, '操作失败');
  assert.equal(normalize(new Error('')).message, '操作失败');
  assert.equal(normalize(new Error(''), '另一个兜底').message, '另一个兜底');
});

test('原始类型拒绝值转成字符串', () => {
  assert.equal(normalize(42).message, '42');
  assert.equal(normalize(false).message, 'false');
});
