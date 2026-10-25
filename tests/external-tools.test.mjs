/**
 * 外部 diff/merge 工具集成（F4）前端测试：
 * 1. 表单校验（validateExternalToolDraft）与后端 Rust 校验规则保持同构；
 * 2. settingsStore 往返：加载/保存/删除都镜像后端命令返回值；
 * 3. 安全边界：工具配置绝不落入 localStorage（配置文件归后端所有）；
 * 4. launch IPC 面只含 toolId + mode + repoPath + filePath。
 *
 * Tauri 运行时用 window.__TAURI_INTERNALS__ 桩模拟（@tauri-apps/api/core 的
 * invoke 即转发到该对象）。
 */
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const root = process.cwd();
const originalFetch = globalThis.fetch;
const savedSettings = new Map();
globalThis.localStorage = {
  getItem: (key) => savedSettings.get(key) ?? null,
  setItem: (key, value) => savedSettings.set(key, value),
  removeItem: (key) => savedSettings.delete(key),
};

let app;
let tauriCalls;
const backendTools = () => [{ id: 'vscode', name: 'VSCode', program: 'C:/tools/code.cmd', args: '$LOCAL $REMOTE --wait', mode: 'diff' }];
const invokeHandler = (command, args = {}) => {
  tauriCalls.push([command, args]);
  if (command === 'get_external_tools') return Promise.resolve(backendTools());
  if (command === 'set_external_tool') return Promise.resolve([args.tool]);
  if (command === 'remove_external_tool') return Promise.resolve(backendTools().filter((tool) => tool.id !== args.toolId));
  if (command === 'launch_external_tool') return Promise.resolve(undefined);
  return Promise.reject(new Error(`unexpected command ${command}`));
};

const validDraft = { name: 'Beyond-Compare', program: 'C:/Program Files/Beyond Compare 5/BComp.exe', args: '$LOCAL $REMOTE /title1=$LOCAL', mode: 'diff' };

before(async () => {
  // 模拟 Tauri 桌面运行时：store/服务层的 isTauri 判定读取 window.__TAURI_INTERNALS__。
  globalThis.window = globalThis;
  globalThis.__TAURI_INTERNALS__ = { invoke: invokeHandler };
  const tmp = await fs.mkdtemp(path.join(root, '.test-tmp-ext-'));
  try {
    const bundle = path.join(tmp, 'external-tools.cjs');
    await build({
      stdin: {
        contents: `export { useSettingsStore } from './src/stores/settingsStore'; export * from './src/services/tools/ExternalToolService';`,
        resolveDir: root,
      },
      bundle: true,
      platform: 'node',
      format: 'cjs',
      outfile: bundle,
      external: ['react', 'react-dom'],
      alias: { '@': path.join(root, 'src') },
      logLevel: 'silent',
    });
    app = createRequire(import.meta.url)(bundle);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5 });
  }
});

after(() => {
  globalThis.fetch = originalFetch;
  delete globalThis.__TAURI_INTERNALS__;
  delete globalThis.window;
});

const resetStore = () => {
  app.useSettingsStore.setState({ externalTools: [] });
  tauriCalls = [];
};

test('draft validation mirrors the backend rules', () => {
  const { validateExternalToolDraft } = app;
  assert.equal(validateExternalToolDraft(validDraft), null);
  assert.equal(validateExternalToolDraft({ ...validDraft, mode: 'merge', args: '$MERGED' }), null);
  // 必填与字符集
  assert.match(validateExternalToolDraft({ ...validDraft, name: '' }), /name is required/);
  assert.match(validateExternalToolDraft({ ...validDraft, name: '有 空格' }), /1-32 characters/);
  assert.match(validateExternalToolDraft({ ...validDraft, name: 'x'.repeat(33) }), /1-32 characters/);
  assert.match(validateExternalToolDraft({ ...validDraft, program: ' ' }), /Program path is required/);
  assert.match(validateExternalToolDraft({ ...validDraft, args: ' ' }), /template is required/);
  // 不经 shell：引号/分号/控制字符按字面传入，配置期直接拒绝
  assert.match(validateExternalToolDraft({ ...validDraft, args: '"$LOCAL" $REMOTE' }), /cannot contain/);
  assert.match(validateExternalToolDraft({ ...validDraft, args: '$LOCAL; $REMOTE' }), /cannot contain/);
  assert.match(validateExternalToolDraft({ ...validDraft, args: '$LOCAL\n$REMOTE' }), /cannot contain/);
  // diff 模板必须给出两侧路径，且没有 base/merged 概念
  assert.match(validateExternalToolDraft({ ...validDraft, args: '$LOCAL' }), /must contain \$LOCAL and \$REMOTE/);
  assert.match(validateExternalToolDraft({ ...validDraft, args: '$LOCAL $BASE $REMOTE' }), /cannot use \$BASE/);
  assert.match(validateExternalToolDraft({ ...validDraft, args: '$LOCAL $MERGED' }), /cannot use \$MERGED/);
  // merge 模板必须有 $MERGED（$LOCAL/$REMOTE/$BASE 可选）
  assert.match(validateExternalToolDraft({ ...validDraft, mode: 'merge', args: '$LOCAL $REMOTE' }), /must contain \$MERGED/);
  assert.match(validateExternalToolDraft({ ...validDraft, mode: 'merge', args: '$LOCAL; $REMOTE $MERGED' }), /cannot contain/);
});

test('generated tool ids satisfy the backend identifier constraint', () => {
  const { newExternalToolId, TOOL_IDENTIFIER_PATTERN } = app;
  assert.match(TOOL_IDENTIFIER_PATTERN.source, /\^/);
  for (let i = 0; i < 8; i++) assert.match(newExternalToolId(), /^[A-Za-z0-9_-]{1,32}$/);
  assert.equal(newExternalToolId().length, 32);
});

test('settings store round-trips tools through backend commands only', async () => {
  resetStore();
  const { useSettingsStore, externalToolService } = app;
  await useSettingsStore.getState().initExternalTools();
  assert.deepEqual(useSettingsStore.getState().externalTools, backendTools());
  assert.deepEqual(tauriCalls.at(-1), ['get_external_tools', {}]);
  // 重复 init 不重复请求
  await useSettingsStore.getState().initExternalTools();
  assert.equal(tauriCalls.filter(([command]) => command === 'get_external_tools').length, 1);

  const tool = { id: 'bc5', ...validDraft };
  const saved = await useSettingsStore.getState().saveExternalTool(tool);
  assert.deepEqual(saved, [tool]);
  assert.deepEqual(useSettingsStore.getState().externalTools, [tool]);
  assert.deepEqual(tauriCalls.at(-1), ['set_external_tool', { tool }]);

  const remaining = await useSettingsStore.getState().removeExternalTool('vscode');
  assert.deepEqual(tauriCalls.at(-1), ['remove_external_tool', { toolId: 'vscode' }]);
  assert.deepEqual(remaining, backendTools().filter((entry) => entry.id !== 'vscode'));

  // launch 面固定为 toolId + mode + repoPath + filePath
  await externalToolService.launch('vscode', 'merge', 'E:/repo', 'src/a.txt');
  assert.deepEqual(tauriCalls.at(-1), ['launch_external_tool', { toolId: 'vscode', mode: 'merge', repoPath: 'E:/repo', filePath: 'src/a.txt' }]);
});

test('tool configuration never persists into frontend storage and invalid saves stay local', async () => {
  resetStore();
  const { useSettingsStore } = app;
  const snapshot = () => savedSettings.get('auu_git_settings') || '';
  const beforeSave = snapshot();
  await assert.rejects(useSettingsStore.getState().saveExternalTool({ id: 'bad', name: 'bad name', program: 'x', args: '$LOCAL $REMOTE', mode: 'diff' }), /1-32 characters/);
  assert.deepEqual(tauriCalls, []);
  await useSettingsStore.getState().saveExternalTool({ id: 'ok1', ...validDraft });
  assert.equal(snapshot(), beforeSave);
  assert.ok(!snapshot().includes('externalTools'));
  // 重置其它设置不清空后端镜像的工具列表（配置归后端文件所有）
  useSettingsStore.setState({ externalTools: [{ id: 'keep', name: 'keep', program: 'p', args: '$MERGED', mode: 'merge' }] });
  useSettingsStore.getState().resetSettings();
  assert.equal(useSettingsStore.getState().externalTools.length, 1);
});

test('service refuses to run outside the desktop runtime', async () => {
  resetStore();
  const { externalToolService } = app;
  const savedInternals = globalThis.__TAURI_INTERNALS__;
  delete globalThis.__TAURI_INTERNALS__;
  try {
    await assert.rejects(externalToolService.list(), /desktop app/);
    await assert.rejects(externalToolService.launch('x', 'diff', '/r', 'a.txt'), /desktop app/);
  } finally {
    globalThis.__TAURI_INTERNALS__ = savedInternals;
  }
});
