import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import React from 'react';
import './react19-test-env.mjs';
import { create, act } from 'react-test-renderer';

const root = process.cwd();
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
let tmp, app;
const config = { provider: 'openai-compatible', endpoint: 'https://model.invalid/v1?private=route', apiKey: 'private-key', model: 'test-model', protocol: 'responses' };
const unit = (id, path = 'a.ts', patch = '+staged change\n') => ({ id, path, paths: [path], kind: 'hunk', label: '@@ -1 +1 @@', patch });
const plan = (units = [unit('h0:0'), unit('h0:1'), { ...unit('f1', 'logo.bin', 'Binary files differ'), kind: 'file' }]) => ({ repoPath: '/test-repo', branch: 'main', head: 'a'.repeat(40), baseTree: 'b'.repeat(40), indexTree: 'c'.repeat(40), index: 'private-index', flags: 'private-flags', files: [], units });
const group = (title, units) => ({ title, units, body: 'Explain the staged change and its purpose.', reason: 'One cohesive concern.' });
const valid = () => ({ summary: 'Two cohesive commits in order.', groups: [group('feat: code', ['h0:0', 'h0:1']), group('chore: asset', ['f1'])] });
const deferred = () => { let resolve; const promise = new Promise(value => { resolve = value; }); return { promise, resolve }; };
const text = value => typeof value === 'string' ? value : Array.isArray(value) ? value.map(text).join('') : value?.props ? text(value.props.children) : '';
const button = (renderer, label) => renderer.root.findAllByType('button').find(value => text(value) === label);
before(async () => {
  tmp = await fs.mkdtemp(path.join(root, '.test-tmp-ai-hunks-'));
  const outfile = path.join(tmp, 'app.cjs');
  await build({ stdin: { contents: `export * from './src/services/ai/AiHunkCommitService'; export { HunkAiSuggestions } from './src/features/git/HunkAiSuggestions'; export { hunkCommitService } from './src/services/git/HunkCommitService'; export { useSettingsStore } from './src/stores/settingsStore'; export { useRepoStore } from './src/stores/repoStore';`, resolveDir: root }, bundle: true, platform: 'node', format: 'cjs', outfile, external: ['react', 'react-dom'], alias: { '@': path.join(root, 'src') }, logLevel: 'silent', plugins: [{ name: 'ai-client', setup(build) { build.onLoad({ filter: /AiClient\.ts$/ }, () => ({ contents: 'export const requestAiText = (...args) => globalThis.__hunkAiRequest(...args);' })); } }] });
  app = createRequire(import.meta.url)(outfile);
});
after(async () => { delete globalThis.__hunkAiRequest; if (tmp && path.dirname(tmp) === root && path.basename(tmp).startsWith('.test-tmp-ai-hunks-')) await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5 }); });

test('AI context preserves the entire ID manifest and bounds escaped diff excerpts', () => {
  const units = Array.from({ length: 100 }, (_, index) => unit(`h${index}:0`, `file-${index}.ts`, ('+\t"\\\u0001 change\n').repeat(2000)));
  const result = app.buildHunkAiContext(plan(units)), value = JSON.parse(result.context);
  assert.equal(value.manifest.length, 100); assert.equal(value.excerpts.length, 100); assert.equal(result.truncated, true); assert.ok(result.context.length <= 60000);
  assert.deepEqual(value.manifest.map(unit => unit.id), units.map(unit => unit.id));
  for (let i = 0; i < units.length; i++) { assert.ok(units[i].patch.startsWith(value.excerpts[i].patch)); assert.equal(value.excerpts[i].truncated, true); }
  assert.throws(() => app.buildHunkAiContext(plan(Array.from({ length: 201 }, (_, i) => unit(String(i))))), /200/);
  assert.throws(() => app.buildHunkAiContext(plan([unit('x', 'a'.repeat(21000))])), /20,000/);
});

test('AI context sends only staged units and metadata, with no repo state or unstaged content', () => {
  const input = { ...plan(), unstaged: 'UNSTAGED_SECRET', context: 'UNRELATED_SECRET' }, result = app.buildHunkAiContext(input);
  assert.equal(result.truncated, false); assert.match(result.context, /staged change/); assert.doesNotMatch(result.context, /private-index|private-flags|UNSTAGED_SECRET|UNRELATED_SECRET|test-repo/);
});

test('valid AI results split hunks of one file across commits and preserve literal unit IDs', () => {
  const result = app.parseHunkAiResult('```json\n' + JSON.stringify({ ...valid(), groups: [group('one', ['h0:1']), group('two', ['h0:0', 'f1'])] }) + '\n```', plan(), true);
  assert.equal(result.groups.length, 2); assert.deepEqual(result.groups[0].units, ['h0:1']); assert.equal(result.truncated, true); assert.equal(result.groups[0].id, undefined);
});

test('invalid model JSON, omissions, duplicates, invented IDs and malformed fields are rejected', () => {
  const cases = [null, [], true, {}, { ...valid(), summary: 1 }, { ...valid(), groups: [] }, { ...valid(), groups: Array(13).fill(group('x', ['h0:0'])) },
    { ...valid(), groups: [group('one', ['h0:0', 'h0:1'])] }, { ...valid(), groups: [group('one', ['h0:0', 'h0:1', 'f1', 'f1'])] }, { ...valid(), groups: [group('one', ['h0:0', 'h0:1', 'unknown'])] },
    ...[{ title: 'bad\nsubject' }, { title: 'bad\0subject' }, { title: 'x'.repeat(121) }, { body: '' }, { body: 'x'.repeat(6001) }, { body: 'bad\0body' }, { reason: '' }, { reason: 'x'.repeat(2001) }, { units: 'h0:0' }, { units: [null] }, { units: [] }].map(patch => ({ ...valid(), groups: [{ ...group('x', ['h0:0', 'h0:1', 'f1']), ...patch }] }))];
  for (const value of cases) assert.throws(() => app.parseHunkAiResult(JSON.stringify(value), plan()), /无效|Invalid/);
  assert.throws(() => app.parseHunkAiResult('not JSON', plan())); assert.throws(() => app.parseHunkAiResult(' '.repeat(256001), plan()));
});

test('analysis uses the configured adapter, complete unit IDs and untrusted-data rules without executing Git', async () => {
  let sent; app.hunkCommitService.verify = async () => { throw Error('AI service must not execute Git'); };
  globalThis.__hunkAiRequest = async (settings, messages, options) => { sent = { settings, messages, options }; return JSON.stringify(valid()); };
  const result = await app.aiHunkCommitService.analyze(plan(), config, 'zh', new AbortController().signal);
  assert.equal(result.groups.length, 2); assert.deepEqual(sent.settings, config); assert.match(sent.messages[0].content, /ONE file may belong to DIFFERENT/); assert.match(sent.messages[0].content, /untrusted DATA/); assert.match(sent.messages[0].content, /Simplified Chinese/);
  assert.deepEqual(JSON.parse(sent.messages[1].content).manifest.map(unit => unit.id), ['h0:0', 'h0:1', 'f1']); assert.doesNotMatch(JSON.stringify(sent.messages), /private-key|UNSTAGED_SECRET/); assert.equal(sent.options.maxTokens, 8000);
});

test('unconfigured providers and already-cancelled analysis never request a model response', async () => {
  globalThis.__hunkAiRequest = async () => { throw Error('Unexpected AI request'); };
  for (const settings of [{ ...config, provider: 'builtin' }, { ...config, apiKey: '' }]) await assert.rejects(app.aiHunkCommitService.analyze(plan(), settings, 'en', new AbortController().signal));
  const controller = new AbortController(); controller.abort(); await assert.rejects(app.aiHunkCommitService.analyze(plan(), config, 'en', controller.signal), { name: 'AbortError' });
});

test('cancellation completes promptly even when a provider ignores the abort signal', async () => {
  globalThis.__hunkAiRequest = () => new Promise(() => {});
  const controller = new AbortController(), pending = app.aiHunkCommitService.analyze(plan(), config, 'en', controller.signal);
  controller.abort(); await assert.rejects(pending, { name: 'AbortError' });
});

test('analysis times out at 60 seconds and distinguishes timeout from cancellation', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] }); globalThis.__hunkAiRequest = () => new Promise(() => {});
  try { const pending = app.aiHunkCommitService.analyze(plan(), config, 'en', new AbortController().signal), rejected = assert.rejects(pending, /60 秒|60 seconds/); context.mock.timers.tick(60000); await rejected; }
  finally { context.mock.timers.reset(); }
});

async function uiFixture(options = {}) {
  app.useSettingsStore.setState({ language: 'zh', aiConfig: config });
  app.useRepoStore.setState({ currentRepo: { path: '/test-repo', currentBranch: 'main' }, status: { currentBranch: 'main' } });
  const events = { applied: [], blocked: [], verifies: 0, requests: 0 };
  app.hunkCommitService.verify = async () => { events.verifies++; if (options.failVerify === events.verifies) throw Error('暂存区已变化'); };
  globalThis.__hunkAiRequest = async (...args) => { events.requests++; return options.request ? options.request(...args) : JSON.stringify(valid()); };
  const props = { plan: plan(), blocked: false, revision: 0, onApply: groups => events.applied.push(groups), onBlockedChange: value => events.blocked.push(value) };
  let renderer; await act(async () => { renderer = create(React.createElement(app.HunkAiSuggestions, props)); });
  return { renderer, props, events, cleanup: () => act(async () => renderer.unmount()) };
}

test('UI displays a proposal first and applies only after explicit confirmation and another snapshot check', async () => {
  const fixture = await uiFixture(), { renderer, events } = fixture;
  try {
    await act(async () => button(renderer, 'AI 建议分组').props.onClick());
    assert.equal(events.applied.length, 0); assert.equal(events.verifies, 2); assert.equal(events.blocked.at(-1), true); assert.ok(button(renderer, '应用建议并替换当前分组'));
    assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /private-key|private=route/);
    await act(async () => { button(renderer, '应用建议并替换当前分组').props.onClick(); button(renderer, '应用建议并替换当前分组').props.onClick(); });
    assert.equal(events.applied.length, 1); assert.equal(events.verifies, 3); assert.equal(events.blocked.at(-1), false); assert.match(JSON.stringify(renderer.toJSON()), /AI 建议已应用/);
  } finally { await fixture.cleanup(); }
});

test('keeping existing groups discards AI suggestions without applying or committing anything', async () => {
  const fixture = await uiFixture(), { renderer, events } = fixture;
  try { await act(async () => button(renderer, 'AI 建议分组').props.onClick()); await act(async () => button(renderer, '保留当前分组').props.onClick()); assert.equal(events.applied.length, 0); assert.equal(events.blocked.at(-1), false); assert.equal(button(renderer, '应用建议并替换当前分组'), undefined); }
  finally { await fixture.cleanup(); }
});

test('stale snapshots before analysis, after response or before application preserve original groups', async () => {
  for (const failVerify of [1, 2, 3]) {
    const fixture = await uiFixture({ failVerify }), { renderer, events } = fixture;
    try {
      await act(async () => button(renderer, 'AI 建议分组').props.onClick());
      if (failVerify === 3) await act(async () => button(renderer, '应用建议并替换当前分组').props.onClick());
      assert.equal(events.applied.length, 0); assert.equal(events.requests, failVerify === 1 ? 0 : 1); assert.equal(events.blocked.at(-1), false); assert.match(JSON.stringify(renderer.toJSON()), /暂存区已变化/);
    } finally { await fixture.cleanup(); }
  }
});

test('cancelled UI analysis cannot apply a late provider response and releases manual editing', async () => {
  const gate = deferred(), fixture = await uiFixture({ request: () => gate.promise }), { renderer, events } = fixture;
  try {
    await act(async () => button(renderer, 'AI 建议分组').props.onClick()); assert.equal(events.blocked.at(-1), true);
    await act(async () => button(renderer, '取消 AI 分析').props.onClick()); assert.equal(events.blocked.at(-1), false);
    await act(async () => gate.resolve(JSON.stringify(valid()))); assert.equal(events.applied.length, 0); assert.equal(button(renderer, '应用建议并替换当前分组'), undefined); assert.match(JSON.stringify(renderer.toJSON()), /原分组保留/);
  } finally { gate.resolve(JSON.stringify(valid())); await fixture.cleanup(); }
});

test('settings, language and manual revision changes invalidate suggestions and late responses', async () => {
  for (const kind of ['settings', 'language', 'manual']) {
    const gate = deferred(), fixture = await uiFixture({ request: () => gate.promise }), { renderer, props, events } = fixture;
    try {
      await act(async () => button(renderer, 'AI 建议分组').props.onClick());
      await act(async () => { if (kind === 'settings') app.useSettingsStore.setState({ aiConfig: { ...config, model: 'other' } }); else if (kind === 'language') app.useSettingsStore.setState({ language: 'en' }); else renderer.update(React.createElement(app.HunkAiSuggestions, { ...props, revision: 1 })); });
      await act(async () => gate.resolve(JSON.stringify(valid())));
      assert.equal(events.applied.length, 0); assert.equal(events.blocked.at(-1), false); assert.equal(button(renderer, kind === 'language' ? 'Apply suggestion and replace groups' : '应用建议并替换当前分组'), undefined);
    } finally { gate.resolve(JSON.stringify(valid())); await fixture.cleanup(); }
  }
});

test('closing during analysis aborts the request and never applies a late result', async () => {
  const gate = deferred(), fixture = await uiFixture({ request: () => gate.promise }), { renderer, events } = fixture;
  await act(async () => button(renderer, 'AI 建议分组').props.onClick()); await fixture.cleanup();
  await act(async () => gate.resolve(JSON.stringify(valid()))); assert.equal(events.applied.length, 0); assert.equal(events.blocked.at(-1), false);
});

test('unconfigured UI keeps manual mode available without requesting AI', async () => {
  const fixture = await uiFixture(), { renderer, events } = fixture;
  try { await act(async () => app.useSettingsStore.setState({ aiConfig: { ...config, provider: 'builtin', apiKey: '' } })); assert.equal(button(renderer, 'AI 建议分组'), undefined); assert.equal(events.requests, 0); assert.equal(events.blocked.at(-1), false); assert.match(JSON.stringify(renderer.toJSON()), /仍可手动分组/); }
  finally { await fixture.cleanup(); }
});

test('a replacement snapshot clears both pending requests and unapplied suggestions', async () => {
  for (const pending of [true, false]) {
    const gate = deferred(), fixture = await uiFixture(pending ? { request: () => gate.promise } : {}), { renderer, props, events } = fixture;
    try {
      await act(async () => button(renderer, 'AI 建议分组').props.onClick());
      await act(async () => renderer.update(React.createElement(app.HunkAiSuggestions, { ...props, plan: { ...props.plan, head: 'd'.repeat(40) } })));
      await act(async () => gate.resolve(JSON.stringify(valid())));
      assert.equal(button(renderer, 'AI 建议分组').props.disabled, false);
      assert.equal(button(renderer, '应用建议并替换当前分组'), undefined); assert.equal(events.applied.length, 0); assert.equal(events.blocked.at(-1), false);
    } finally { gate.resolve(JSON.stringify(valid())); await fixture.cleanup(); }
  }
});
