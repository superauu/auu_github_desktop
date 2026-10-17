import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const root = process.cwd(), originalFetch = globalThis.fetch;
const saved = new Map([['auu_git_settings', JSON.stringify({ aiConfig: { provider: 'openai-compatible', endpoint: 'https://legacy.invalid/v1', model: 'legacy' } })]]);
globalThis.localStorage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key) };
let app, tmp;
const config = protocol => ({ provider: 'openai-compatible', protocol, endpoint: 'https://model.invalid/v1', model: 'test-model', apiKey: 'test-secret' });
const messages = [{ role: 'system', content: 'Explain Git changes' }, { role: 'user', content: 'a.ts changed' }];
const json = value => new Response(JSON.stringify(value));
const output = protocol => protocol === 'responses'
  ? { status: 'completed', output: [{ type: 'reasoning' }, { type: 'message', content: [{ type: 'output_text', text: 'fix: updated' }] }] }
  : protocol === 'anthropic-messages' ? { content: [{ type: 'thinking', thinking: 'private' }, { type: 'text', text: 'fix: updated' }], stop_reason: 'end_turn' }
    : { choices: [{ message: { content: 'fix: updated' }, finish_reason: 'stop' }] };

before(async () => {
  tmp = await fs.mkdtemp(path.join(root, '.test-tmp-ai-'));
  const bundle = path.join(tmp, 'ai.cjs');
  await build({ stdin: { contents: `export * from './src/services/ai/AiClient'; export * from './src/services/ai/AiTransport'; export * from './src/services/ai/AiExplanationService'; export { aiCommitService } from './src/services/ai/AiCommitService'; export { gitService } from './src/services/git/GitService'; export { useSettingsStore } from './src/stores/settingsStore';`, resolveDir: root }, bundle: true, platform: 'node', format: 'cjs', outfile: bundle, alias: { '@': path.join(root, 'src') }, logLevel: 'silent' });
  app = createRequire(import.meta.url)(bundle);
});
after(async () => {
  globalThis.fetch = originalFetch; delete globalThis.window;
  if (tmp && path.dirname(tmp) === root && path.basename(tmp).startsWith('.test-tmp-ai-')) await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5 });
});

test('legacy settings default to Chat Completions; protocol persists without persisting the key', () => {
  const store = app.useSettingsStore;
  assert.equal(store.getState().aiConfig.protocol, 'chat-completions');
  assert.equal(store.getState().aiConfig.endpoint, 'https://legacy.invalid/v1');
  store.getState().setAiConfig({ protocol: 'responses', apiKey: 'test-secret' });
  const stored = JSON.parse(saved.get('auu_git_settings')).aiConfig;
  assert.equal(stored.protocol, 'responses'); assert.equal(stored.apiKey, undefined);
  assert.equal(store.getState().aiConfig.model, 'legacy');
});

test('endpoint resolution accepts base and full URLs and preserves proxy paths and queries', () => {
  assert.equal(app.aiEndpoint('https://model.invalid', 'responses'), 'https://model.invalid/v1/responses');
  assert.equal(app.aiEndpoint('https://model.invalid/v1/', 'anthropic-messages'), 'https://model.invalid/v1/messages');
  assert.equal(app.aiEndpoint('https://model.invalid/proxy/v1/chat/completions?route=a', 'responses'), 'https://model.invalid/proxy/v1/responses?route=a');
  assert.equal(app.aiEndpoint('https://model.invalid/v1/responses', 'responses'), 'https://model.invalid/v1/responses');
  assert.equal(app.aiEndpoint('https://model.invalid/v1/messages', 'chat-completions'), 'https://model.invalid/v1/chat/completions');
});

test('optional API suffixes never duplicate or alter an explicit root-level API path', () => {
  for (const [protocol, suffix] of [['chat-completions', 'chat/completions'], ['responses', 'responses'], ['anthropic-messages', 'messages']]) {
    for (const endpoint of ['https://model.invalid/v1', 'https://model.invalid/v1/', `https://model.invalid/v1/${suffix}`, ` https://model.invalid/v1/${suffix}/ `]) {
      assert.equal(app.aiEndpoint(endpoint, protocol), `https://model.invalid/v1/${suffix}`);
    }
    assert.equal(app.aiEndpoint(`https://model.invalid/${suffix}/?route=a`, protocol), `https://model.invalid/${suffix}?route=a`);
    assert.equal(app.aiEndpoint('https://model.invalid/proxy/v1', protocol), `https://model.invalid/proxy/v1/${suffix}`);
  }
  assert.equal(app.aiEndpoint('https://model.invalid/chat/completions', 'responses'), 'https://model.invalid/responses');
});

for (const protocol of ['chat-completions', 'responses', 'anthropic-messages']) {
  test(`${protocol} uses its authentication, input schema and text output`, async () => {
    let calls = 0;
    globalThis.fetch = async (url, init) => {
      calls++; assert.equal(url, app.aiEndpoint(config(protocol).endpoint, protocol));
      const body = JSON.parse(init.body), headers = new Headers(init.headers);
      assert.equal(body.model, 'test-model');
      if (protocol === 'responses') {
        assert.deepEqual(body.input, messages); assert.equal(body.store, false);
        assert.equal(body.max_output_tokens, 4096); assert.equal(body.temperature, undefined);
      } else if (protocol === 'anthropic-messages') {
        assert.equal(headers.get('x-api-key'), 'test-secret'); assert.equal(headers.get('anthropic-version'), '2023-06-01');
        assert.equal(headers.get('authorization'), null); assert.equal(body.system, messages[0].content);
        assert.deepEqual(body.messages, [messages[1]]); assert.equal(body.max_tokens, 4096);
      } else {
        assert.deepEqual(body.messages, messages); assert.equal(body.temperature, 0.2);
      }
      if (protocol !== 'anthropic-messages') assert.equal(headers.get('authorization'), 'Bearer test-secret');
      return json(output(protocol));
    };
    assert.equal(await app.requestAiText(config(protocol), messages, { temperature: 0.2, maxTokens: 4096 }), 'fix: updated');
    assert.equal(calls, 1);
  });
}

test('blank, refused, truncated and failed outputs cannot pass the connection test as successful text', async () => {
  for (const [protocol, response] of [
    ['responses', { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [{ type: 'message', content: [{ type: 'output_text', text: 'partial' }] }] }],
    ['responses', { output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'no' }] }] }],
    ['anthropic-messages', { content: [{ type: 'text', text: 'partial' }], stop_reason: 'max_tokens' }],
    ['chat-completions', { choices: [{ message: { content: ' ' } }] }],
    ['responses', { status: 'failed', error: { message: 'model unavailable' } }],
  ]) {
    globalThis.fetch = async () => json(response);
    await assert.rejects(app.requestAiText(config(protocol), messages));
  }
  globalThis.fetch = async () => new Response('permission denied', { status: 403 });
  await assert.rejects(app.requestAiText(config('responses'), messages), /403.*permission denied/);
});

test('native transport forwards only permitted Anthropic headers and preserves cancellation and errors', async () => {
  let captured;
  globalThis.window = { __TAURI_INTERNALS__: { invoke: async (command, args) => { captured = { command, ...args }; return JSON.stringify(output('anthropic-messages')); } } };
  try {
    assert.equal(await app.requestAiText(config('anthropic-messages'), messages), 'fix: updated');
    assert.equal(captured.command, 'request_ai_completion');
    assert.equal(captured.authorization, '');
    assert.deepEqual(captured.extraHeaders, { 'x-api-key': 'test-secret', 'anthropic-version': '2023-06-01' });
    await app.requestAiCompletion('https://model.invalid/v1/messages', { headers: { 'x-api-key': 'test-secret', 'x-untrusted': 'ignored' }, body: '{}' });
    assert.deepEqual(captured.extraHeaders, { 'x-api-key': 'test-secret' });
    window.__TAURI_INTERNALS__.invoke = async () => { throw 'HTTP 401: invalid key'; };
    await assert.rejects(app.requestAiText(config('anthropic-messages'), messages), /HTTP 401/);
    const controller = new AbortController();
    window.__TAURI_INTERNALS__.invoke = () => new Promise(() => {});
    const pending = app.requestAiText(config('responses'), messages, { signal: controller.signal });
    await new Promise(resolve => setTimeout(resolve, 0)); controller.abort();
    await assert.rejects(pending, { name: 'AbortError' });
  } finally { delete globalThis.window; }
});

test('commit and PR generation and all explanation tasks share the selected protocol', async () => {
  const originals = { getFileDiff: app.gitService.getFileDiff, getBranchDiff: app.gitService.getBranchDiff };
  const files = [{ path: 'a.ts', status: 'modified', staged: true }];
  app.gitService.getFileDiff = async () => [];
  app.gitService.getBranchDiff = async () => ({ files, patchText: '+changed' });
  try {
    for (const protocol of ['responses', 'anthropic-messages']) {
      let calls = 0;
      globalThis.fetch = async (url) => { calls++; assert.equal(url, app.aiEndpoint(config(protocol).endpoint, protocol)); return json(output(protocol)); };
      const commit = await app.aiCommitService.generateCommitMessageResult({ repoPath: 'unused', files, aiConfig: config(protocol) });
      assert.equal(commit.source, 'llm'); assert.equal(commit.message, 'fix: updated');
      const pr = await app.aiCommitService.generatePRDescriptionResult({ repoPath: 'unused', base: 'main', head: 'topic', aiConfig: config(protocol) });
      assert.equal(pr.source, 'llm');
      for (const task of ['explain', 'diagnose', 'group', 'conflict']) {
        assert.equal(await app.explainChanges({ text: 'diff', truncated: false }, config(protocol), 'zh', new AbortController().signal, task), 'fix: updated');
      }
      assert.equal(calls, 6);
    }
  } finally { Object.assign(app.gitService, originals); }
});

test('invalid endpoint schemes, embedded credentials and cancelled requests never send the key', async () => {
  globalThis.fetch = async () => { assert.fail('Unexpected network request'); };
  for (const endpoint of ['http://remote.invalid/v1', 'https://user:secret@model.invalid/v1', 'file:///tmp/ai']) {
    await assert.rejects(app.requestAiText({ ...config('responses'), endpoint }, messages));
  }
  const controller = new AbortController(); controller.abort();
  await assert.rejects(app.requestAiText(config('responses'), messages, { signal: controller.signal }), { name: 'AbortError' });
});
