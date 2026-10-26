/**
 * AI 审查摘要服务测试:
 * (a) parseReviewSummary —— 围栏剥离、概览/提交条目校验、短哈希前缀归一、未知哈希与畸形条目丢弃;
 * (b) summarizeReviewRange —— provider/apiKey 守卫、payload 定界符与内容、超时映射(以极短
 *     aiLimits 替身触发)、结果经 parseReviewSummary 返回。
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const root = process.cwd();
let app, tmp;

const CLIENT_STUB = `
export async function requestAiText(config, messages, options) {
  return globalThis.__aiRespond(config, messages, options);
}
`;
const LIMITS_STUB = `export const AI_REQUEST_TIMEOUT_MS = 25;`;
const I18N_STUB = `export const tNow = (key) => key; export const t = (key) => key;`;

before(async () => {
  tmp = await fs.mkdtemp(path.join(root, '.test-tmp-ai-review-'));
  const bundle = path.join(tmp, 'ai-review.cjs');
  await build({
    stdin: {
      contents: [
        `export { parseReviewSummary, summarizeReviewRange } from './src/services/ai/AiReviewSummaryService';`,
      ].join('\n'),
      resolveDir: root,
    },
    bundle: true, platform: 'node', format: 'cjs', outfile: bundle,
    alias: { '@': path.join(root, 'src') }, logLevel: 'silent',
    plugins: [{
      name: 'headless-ai-review',
      setup(build) {
        build.onResolve({ filter: /^@\/i18n$/ }, () => ({ path: 'i18n', namespace: 'test-stub' }));
        build.onLoad({ filter: /.*/, namespace: 'test-stub' }, () => ({ contents: I18N_STUB, loader: 'js' }));
        build.onLoad({ filter: /AiClient\.ts$/ }, () => ({ contents: CLIENT_STUB, loader: 'ts' }));
        build.onLoad({ filter: /aiLimits\.ts$/ }, () => ({ contents: LIMITS_STUB, loader: 'ts' }));
      },
    }],
  });
  app = createRequire(import.meta.url)(bundle);
});

after(async () => {
  delete globalThis.__aiRespond;
  if (tmp && path.dirname(tmp) === root && path.basename(tmp).startsWith('.test-tmp-ai-review-')) await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5 });
});

const H1 = 'a'.repeat(40);
const H2 = 'b'.repeat(40);
const H3 = 'c'.repeat(40);
const config = { provider: 'openai-compatible', endpoint: 'https://api.example.com', apiKey: 'k', model: 'm' };

test('parseReviewSummary strips fences, resolves short hashes and drops unknown or malformed entries', () => {
  const raw = [
    '```json',
    JSON.stringify({
      overview: '这是概览。'.repeat(1),
      commits: [
        { hash: H1, summary: '第一条意图' },
        { hash: H2.slice(0, 8), summary: '短哈希归一' },
        { hash: 'd'.repeat(40), summary: '未知哈希应被丢弃' },
        { hash: H3, summary: 'H3 的第一条摘要' },
        { hash: H3, summary: '重复哈希应被丢弃' },
        { hash: H3 },
        'garbage',
      ],
    }),
    '```',
  ].join('\n');
  const parsed = app.parseReviewSummary(raw, [{ hash: H1 }, { hash: H2 }, { hash: H3 }]);
  assert.equal(parsed.overview, '这是概览。');
  assert.deepEqual(parsed.commits, [
    { hash: H1, summary: '第一条意图' },
    { hash: H2, summary: '短哈希归一' },
    { hash: H3, summary: 'H3 的第一条摘要' },
  ]);
});

test('parseReviewSummary rejects malformed JSON and invalid shapes', () => {
  const known = [{ hash: H1 }];
  assert.throws(() => app.parseReviewSummary('not json at all', known), /review\.summaryInvalid/);
  assert.throws(() => app.parseReviewSummary('{"commits":[]}', known), /review\.summaryInvalid/, 'missing overview');
  assert.throws(() => app.parseReviewSummary(JSON.stringify({ overview: 'x'.repeat(4001), commits: [] }), known), /review\.summaryInvalid/);
  assert.throws(() => app.parseReviewSummary(JSON.stringify({ overview: 'ok', commits: 'nope' }), known), /review\.summaryInvalid/);
});

test('summarizeReviewRange guards the provider config and never calls the model without a key', async () => {
  let calls = 0;
  globalThis.__aiRespond = () => { calls++; return 'x'; };
  try {
    await assert.rejects(
      app.summarizeReviewRange({ commits: [], files: [], patch: '', truncated: false }, { ...config, apiKey: '  ' }, 'zh', new AbortController().signal),
      /explain\.configure/
    );
    await assert.rejects(
      app.summarizeReviewRange({ commits: [], files: [], patch: '', truncated: false }, { ...config, provider: 'builtin' }, 'zh', new AbortController().signal),
      /explain\.configure/
    );
    assert.equal(calls, 0);
  } finally { delete globalThis.__aiRespond; }
});

test('summarizeReviewRange sends the delimited payload and parses the JSON reply', async () => {
  let captured = null;
  globalThis.__aiRespond = (cfg, messages) => {
    captured = messages;
    return JSON.stringify({ overview: '范围概览', commits: [{ hash: H1, summary: '意图一句话' }] });
  };
  try {
    const input = {
      commits: [{ hash: H1, subject: 'feat(login): 支持邮箱登录', body: '为什么:用户要求', authorName: 'dev' }],
      files: [{ path: 'src/login.ts', status: 'modified', insertions: 12, deletions: 3 }],
      patch: 'diff --git a/src/login.ts b/src/login.ts',
      truncated: false,
    };
    const summary = await app.summarizeReviewRange(input, config, 'zh', new AbortController().signal);
    assert.equal(summary.overview, '范围概览');
    assert.deepEqual(summary.commits, [{ hash: H1, summary: '意图一句话' }]);
    assert.equal(captured[0].role, 'system');
    assert.match(captured[0].content, /Return ONLY JSON/);
    assert.match(captured[0].content, /Simplified Chinese/);
    const user = captured[1].content;
    assert.match(user, /^<review-range>\n/);
    assert.match(user, new RegExp(H1));
    assert.match(user, /feat\(login\): 支持邮箱登录/);
    assert.match(user, /src\/login\.ts \| modified \| \+12 \/ -3/);
  } finally { delete globalThis.__aiRespond; }
});

test('summarizeReviewRange maps timeouts to a readable error', async () => {
  globalThis.__aiRespond = (cfg, messages, options) => new Promise((_, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  });
  try {
    await assert.rejects(
      app.summarizeReviewRange({ commits: [], files: [], patch: '', truncated: false }, config, 'zh', new AbortController().signal),
      /review\.summaryTimeout/
    );
  } finally { delete globalThis.__aiRespond; }
});
