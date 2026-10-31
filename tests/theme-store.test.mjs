/**
 * 主题 store：system/light 解析、持久化、OS 配色监听与清理、View Transitions 动画路径。
 * 以最小 document/window/matchMedia 垫片直测，风格同 tests/hook-lifecycle.test.mjs。
 */
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const root = process.cwd();
const THEME_KEY = 'auu_git_theme';
let app, tmp, saved;

const makeStorage = () => {
  saved = new Map();
  return { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key) };
};
/** 可控的 matchMedia：记录监听器，测试里手动翻转 prefers-color-scheme。 */
const makeMatchMedia = ({ dark = false, reducedMotion = false } = {}) => {
  const entries = new Map();
  const entry = query => {
    if (!entries.has(query)) entries.set(query, {
      matches: query === '(prefers-color-scheme: dark)' ? dark : query === '(prefers-reduced-motion: reduce)' ? reducedMotion : false,
      listeners: new Set(),
    });
    return entries.get(query);
  };
  const matcher = query => { const state = entry(query); return { matches: state.matches, addEventListener: (_type, listener) => state.listeners.add(listener), removeEventListener: (_type, listener) => state.listeners.delete(listener) }; };
  matcher.setDark = value => { const state = entry('(prefers-color-scheme: dark)'); state.matches = value; for (const listener of state.listeners) listener(); };
  return matcher;
};
const makeDocument = ({ viewTransitions } = {}) => {
  const classes = new Set();
  const documentElement = {
    classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name), toggle: (name, force) => { (force ?? !classes.has(name)) ? classes.add(name) : classes.delete(name); } },
  };
  const documentShim = { documentElement };
  if (viewTransitions) {
    // 直接执行回调模拟浏览器完成过渡；calls 计数供断言动画路径是否被走到
    documentShim.startViewTransition = callback => { viewTransitions.calls += 1; callback(); return { finished: Promise.resolve() }; };
  }
  return documentShim;
};
const resetStore = () => app.useThemeStore.setState({ theme: 'system', resolvedTheme: 'dark' });

before(async () => {
  tmp = await fs.mkdtemp(path.join(root, '.test-tmp-theme-'));
  const outfile = path.join(tmp, 'theme.cjs');
  await build({ stdin: { contents: `export { useThemeStore } from './src/stores/themeStore';`, resolveDir: root }, bundle: true, platform: 'node', format: 'cjs', outfile, logLevel: 'silent' });
  app = createRequire(import.meta.url)(outfile);
});
after(async () => {
  delete globalThis.window; delete globalThis.document;
  if (tmp && path.dirname(tmp) === root && path.basename(tmp).startsWith('.test-tmp-theme-')) await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
});

test('initTheme 无保存偏好时默认暗色并落类', () => {
  globalThis.localStorage = makeStorage();
  globalThis.window = { matchMedia: makeMatchMedia({ dark: true }) };
  globalThis.document = makeDocument();
  try {
    const cleanup = app.useThemeStore.getState().initTheme();
    assert.equal(typeof cleanup, 'function', 'matchMedia 可用即注册监听，与当前主题值无关');
    const { theme, resolvedTheme } = app.useThemeStore.getState();
    assert.equal(theme, 'dark');
    assert.equal(resolvedTheme, 'dark');
    assert.ok(document.documentElement.classList.contains('dark'));
    cleanup();
  } finally { delete globalThis.window; delete globalThis.document; }
});

test('initTheme 恢复保存的浅色偏好并注册可清理的 OS 监听', () => {
  globalThis.localStorage = makeStorage();
  saved.set(THEME_KEY, 'light');
  const matchMedia = makeMatchMedia({ dark: true });
  globalThis.window = { matchMedia };
  globalThis.document = makeDocument();
  try {
    const cleanup = app.useThemeStore.getState().initTheme();
    assert.equal(typeof cleanup, 'function');
    assert.equal(app.useThemeStore.getState().theme, 'light');
    assert.equal(app.useThemeStore.getState().resolvedTheme, 'light');
    assert.ok(!document.documentElement.classList.contains('dark'));
    // 显式 light 不受 OS 变化影响
    matchMedia.setDark(false);
    assert.equal(app.useThemeStore.getState().resolvedTheme, 'light');
    cleanup();
  } finally { delete globalThis.window; delete globalThis.document; }
});

test('system 主题跟随 OS 配色变化，清理后停止跟随', () => {
  globalThis.localStorage = makeStorage();
  saved.set(THEME_KEY, 'system');
  const matchMedia = makeMatchMedia({ dark: true });
  globalThis.window = { matchMedia };
  globalThis.document = makeDocument();
  try {
    const cleanup = app.useThemeStore.getState().initTheme();
    assert.equal(app.useThemeStore.getState().resolvedTheme, 'dark');
    matchMedia.setDark(false);
    assert.equal(app.useThemeStore.getState().resolvedTheme, 'light');
    assert.ok(!document.documentElement.classList.contains('dark'));
    matchMedia.setDark(true);
    assert.equal(app.useThemeStore.getState().resolvedTheme, 'dark');
    cleanup();
    matchMedia.setDark(false);
    assert.equal(app.useThemeStore.getState().resolvedTheme, 'dark', '清理后 OS 变化不应再生效');
  } finally { delete globalThis.window; delete globalThis.document; }
});

test('setTheme 写入持久化键并立即解析生效', () => {
  globalThis.localStorage = makeStorage();
  globalThis.window = { matchMedia: makeMatchMedia({ dark: true, reducedMotion: true }) };
  globalThis.document = makeDocument();
  try {
    resetStore();
    app.useThemeStore.getState().setTheme('light');
    assert.equal(saved.get(THEME_KEY), 'light');
    assert.equal(app.useThemeStore.getState().theme, 'light');
    assert.equal(app.useThemeStore.getState().resolvedTheme, 'light');
    assert.ok(!document.documentElement.classList.contains('dark'));
    app.useThemeStore.getState().setTheme('dark');
    assert.equal(app.useThemeStore.getState().resolvedTheme, 'dark');
    assert.ok(document.documentElement.classList.contains('dark'));
  } finally { delete globalThis.window; delete globalThis.document; }
});

test('支持 View Transitions 时手动切换走动画路径，reduced-motion 直接落类', () => {
  globalThis.localStorage = makeStorage();
  // reduce 关闭：动画路径
  const transitions = { calls: 0 };
  globalThis.window = { matchMedia: makeMatchMedia({ dark: true, reducedMotion: false }) };
  globalThis.document = makeDocument({ viewTransitions: transitions });
  try {
    resetStore();
    app.useThemeStore.getState().setTheme('light');
    assert.equal(transitions.calls, 1, '手动切换应通过 startViewTransition 应用类');
    assert.ok(!document.documentElement.classList.contains('dark'));
  } finally { delete globalThis.window; delete globalThis.document; }
  // reduce 开启：直接落类，不进动画
  const reduced = { calls: 0 };
  globalThis.window = { matchMedia: makeMatchMedia({ dark: true, reducedMotion: true }) };
  globalThis.document = makeDocument({ viewTransitions: reduced });
  try {
    resetStore();
    app.useThemeStore.getState().setTheme('light');
    assert.equal(reduced.calls, 0, 'reduced-motion 不应触发 View Transition');
    assert.ok(!document.documentElement.classList.contains('dark'));
  } finally { delete globalThis.window; delete globalThis.document; }
});

test('localStorage 抛异常时 initTheme 不崩溃、不改状态', () => {
  resetStore(); // store 是模块级单例，先归零
  globalThis.localStorage = { getItem: () => { throw new Error('storage unavailable'); }, setItem: () => {}, removeItem: () => {} };
  try {
    const state = app.useThemeStore.getState();
    assert.doesNotThrow(() => state.initTheme(), '存储不可用时 initTheme 必须静默退回');
    assert.equal(app.useThemeStore.getState().theme, 'system', 'catch 路径保持原状态，不误改主题');
    assert.equal(app.useThemeStore.getState().resolvedTheme, 'dark');
  } finally { delete globalThis.localStorage; }
});
