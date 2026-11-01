/**
 * Toast 时长策略（用户反馈：错误提示无鼠标悬停也自动消失，读不完技术细节）：
 * 1. error 常驻（duration 0），同型同文去重——反复失败的同一操作不堆积；
 * 2. warning 8s；success/info 维持 4s 默认。
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
  tmp = await fs.mkdtemp(path.join(root, '.test-tmp-toast-'));
  const outfile = path.join(tmp, 'toast.cjs');
  await build({
    stdin: { contents: `export { useToastStore, toast } from './src/stores/toastStore';`, resolveDir: root },
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
  if (tmp && path.dirname(tmp) === root && path.basename(tmp).startsWith('.test-tmp-toast-')) {
    await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
  }
});

test('错误 toast 常驻且同文去重，警告 8s，成功 4s', () => {
  const store = app.useToastStore;
  store.setState({ toasts: [], history: [], historyStorageFailed: false });

  const errId = app.toast.error('Failed to update status', 'You do not have permission to perform this action.');
  let current = store.getState().toasts;
  assert.equal(current.length, 1);
  assert.equal(current[0].duration, 0); // 常驻：removeToast 只能由用户关闭触发

  const deduped = app.toast.error('Failed to update status', 'You do not have permission to perform this action.');
  assert.equal(deduped, errId); // 同型同文 → 复用现有 id
  assert.equal(store.getState().toasts.length, 1);

  // 描述不同（如不同 issue 的失败）→ 新条目
  app.toast.error('Failed to update status', 'Issue was already resolved.');
  assert.equal(store.getState().toasts.length, 2);

  // 成功 4s、警告 8s
  app.toast.success('Saved');
  app.toast.warning('Careful');
  current = store.getState().toasts;
  assert.equal(current.find((t) => t.type === 'success')?.duration, 4000);
  assert.equal(current.find((t) => t.type === 'warning')?.duration, 8000);

  // 清理：不留下真实的 setTimeout 等待测试进程
  for (const t of store.getState().toasts) store.getState().removeToast(t.id);
});
