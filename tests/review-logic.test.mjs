/**
 * 审查视图纯函数层测试:风险发现(疑似密钥及占位排除、.env、依赖/CI 清单、大量删除、
 * 二进制)与 AI 作者识别启发式。
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
  tmp = await fs.mkdtemp(path.join(root, '.test-tmp-review-logic-'));
  const bundle = path.join(tmp, 'review-logic.cjs');
  await build({
    stdin: {
      contents: `export { computeRiskFindings, detectAiAuthorship } from './src/features/review/reviewLogic';`,
      resolveDir: root,
    },
    bundle: true, platform: 'node', format: 'cjs', outfile: bundle,
    logLevel: 'silent',
  });
  app = createRequire(import.meta.url)(bundle);
});

after(async () => {
  if (tmp && path.dirname(tmp) === root && path.basename(tmp).startsWith('.test-tmp-review-logic-')) await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5 });
});

const file = (path, status = 'modified', insertions = 0, deletions = 0) => ({ path, status, insertions, deletions });
const kinds = (findings) => findings.map((finding) => finding.kind);

test('computeRiskFindings flags secrets on added lines and attributes the right file', () => {
  // 夹具密钥经运行时拼接构造,避免源码文本携带密钥形态字符串触发 GitHub Push Protection。
  const awsKey = ['AKIA', 'ABCDEFGHIJKLMNOP'].join('');
  const patch = [
    'diff --git a/src/a.ts b/src/a.ts',
    '--- a/src/a.ts',
    '+++ b/src/a.ts',
    '@@ -1,3 +1,4 @@',
    ' context',
    '-removed ' + ['AKIA', 'IOSFODNN7EXAMPLE'].join('') + ' line does not count',
    `+const key = "${awsKey}";`,
    'diff --git a/src/b.ts b/src/b.ts',
    '--- a/src/b.ts',
    '+++ b/src/b.ts',
    '@@ -1,2 +1,3 @@',
    '+password = "correct-horse-battery"',
  ].join('\n');
  const findings = app.computeRiskFindings([file('src/a.ts', 'modified', 1, 1), file('src/b.ts', 'modified', 1, 0)], patch);
  assert.deepEqual(kinds(findings), ['secret']);
  assert.equal(findings[0].severity, 'high');
  assert.deepEqual(findings[0].files.sort(), ['src/a.ts', 'src/b.ts']);
});

test('computeRiskFindings skips placeholder-looking assignments and env lookups', () => {
  const patch = [
    'diff --git a/config.ts b/config.ts',
    '--- a/config.ts',
    '+++ b/config.ts',
    '+const apiKey = process.env.MY_API_KEY;',
    '+const token = import.meta.env.VITE_TOKEN;',
    '+const password = "<your-password-here>";',
    '+const secret = "{{ placeholder }}";',
    '+const apiKey = "your-api-key-goes-here";',
    '+export const empty = null;',
  ].join('\n');
  assert.deepEqual(app.computeRiskFindings([file('config.ts', 'modified', 6, 0)], patch), []);
});

test('computeRiskFindings recognizes private key headers, GitHub/Slack tokens and JWTs', () => {
  // 同样经运行时拼接,避免源码文本携带完整 token 形态。
  const lines = [
    '-----BEGIN RSA PRIVATE KEY-----',
    ['ghp', 'abcdefghijklmnopqrstuvwxyz012345'].join('_'),
    ['github', 'pat', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890'].join('_'),
    ['xoxb', '123456789012-abcdefghijklmn'].join('-'),
    ['AIza', 'SyABCDEFGHIJKLMNOPQRSTUVWXYZ1234567'].join(''),
    ['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiIxMjMifQ', 'SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJVadQssw5c'].join('.'),
  ];
  for (const line of lines) {
    const patch = ['diff --git a/x b/x', '--- a/x', '+++ b/x', `+${line}`].join('\n');
    const findings = app.computeRiskFindings([file('x', 'modified', 1, 0)], patch);
    assert.deepEqual(kinds(findings), ['secret'], line);
  }
});

test('computeRiskFindings flags committed .env files but not templates', () => {
  const patch = '';
  const findings = app.computeRiskFindings([file('.env', 'added'), file('.env.example', 'added'), file('src/.env.local', 'added')], patch);
  assert.deepEqual(kinds(findings), ['envFile']);
  assert.equal(findings[0].severity, 'high');
  assert.deepEqual(findings[0].files.sort(), ['.env', 'src/.env.local']);
});

test('computeRiskFindings flags heavy deletions in modified files only', () => {
  const findings = app.computeRiskFindings([
    file('src/heavy.ts', 'modified', 5, 150),
    file('src/light.ts', 'modified', 10, 50),
    file('src/old.ts', 'deleted', 0, 900),
  ], '');
  assert.deepEqual(kinds(findings), ['massDeletion']);
  assert.deepEqual(findings[0].files, ['src/heavy.ts']);
});

test('computeRiskFindings flags dependency and CI file changes', () => {
  const findings = app.computeRiskFindings([
    file('package.json', 'modified', 3, 1),
    file('Cargo.toml', 'modified', 2, 0),
    file('.github/workflows/release.yml', 'added'),
    file('src/app.ts', 'modified', 1, 1),
  ], '');
  assert.deepEqual(kinds(findings), ['dependency', 'ci']);
  assert.deepEqual(findings[0].files.sort(), ['Cargo.toml', 'package.json']);
  assert.deepEqual(findings[1].files, ['.github/workflows/release.yml']);
});

test('computeRiskFindings detects binary diffs from the patch and orders findings by severity', () => {
  const patch = [
    'diff --git a/assets/logo.png b/assets/logo.png',
    '--- a/assets/logo.png',
    '+++ b/assets/logo.png',
    'Binary files /dev/null and b/assets/logo.png differ',
  ].join('\n');
  const findings = app.computeRiskFindings([
    file('assets/logo.png', 'added'),
    file('.env', 'added'),
    file('package.json', 'modified', 2, 2),
  ], patch);
  assert.deepEqual(kinds(findings), ['envFile', 'dependency', 'binary'], 'high severity first, then medium by kind order');
});

test('detectAiAuthorship recognizes co-author trailers, footers and AI service emails', () => {
  assert.equal(app.detectAiAuthorship('Co-Authored-By: Claude <noreply@anthropic.com>', 'dev@example.com'), true);
  assert.equal(app.detectAiAuthorship('Generated with Claude Code', 'dev@example.com'), true);
  assert.equal(app.detectAiAuthorship('ship it 🤖', 'dev@example.com'), true);
  assert.equal(app.detectAiAuthorship(undefined, 'noreply@anthropic.com'), true);
  assert.equal(app.detectAiAuthorship('Co-Authored-By: Alice <alice@example.com>', 'dev@example.com'), false, 'human co-authors do not count');
  assert.equal(app.detectAiAuthorship('fix: login bug', 'dev@example.com'), false);
  assert.equal(app.detectAiAuthorship(undefined, 'dependabot[bot]@users.noreply.github.com'), false);
});
