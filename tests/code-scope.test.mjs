import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const root = process.cwd();
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
let tmp, app;
before(async () => {
  tmp = await fs.mkdtemp(path.join(root, '.test-tmp-code-scope-'));
  const outfile = path.join(tmp, 'app.cjs');
  await build({
    stdin: {
      contents: `export * from './src/utils/codeScope'; export * from './src/utils/fullFileDiff'; export { parseDiffOutput } from './src/services/git/PorcelainParser';`,
      resolveDir: root,
    },
    bundle: true, platform: 'node', format: 'cjs', outfile,
    alias: { '@': path.join(root, 'src') }, logLevel: 'silent',
  });
  app = createRequire(import.meta.url)(outfile);
});
after(async () => { if (tmp && path.dirname(tmp) === root && path.basename(tmp).startsWith('.test-tmp-code-scope-')) await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5 }); });

const names = lines => app.buildScopeIndex(lines).map(scope => scope?.name ?? null);

test('declarations are recognised across common languages and control flow is not', () => {
  const found = text => { const scope = app.matchDeclaration(text); return scope ? [scope.name, scope.kind] : null; };
  assert.deepEqual(found('export function useAccounts() {'), ['useAccounts', 'function']);
  assert.deepEqual(found('const handler = async (event: Event) => {'), ['handler', 'function']);
  assert.deepEqual(found('  private async load(): Promise<void> {'), ['load', 'method']);
  assert.deepEqual(found('export class IntegrationsPage extends Component {'), ['IntegrationsPage', 'class']);
  assert.deepEqual(found('export interface Profile {'), ['Profile', 'type']);
  assert.deepEqual(found('def fetch_rows(self):'), ['fetch_rows', 'function']);
  assert.deepEqual(found('func (s *Server) Serve() {'), ['Serve', 'function']);
  assert.deepEqual(found('pub fn run() {'), ['run', 'function']);
  for (const control of ['if (ready) {', 'for (const item of items) {', 'while (busy) {', 'switch (mode) {', 'catch (error) {', 'return wrap(value) {']) {
    assert.equal(found(control), null, control);
  }
  assert.equal(found('The commit panel sits beside the diff at typical laptop widths'), null);
});

test('nested JSX expression containers keep the enclosing component as the scope', () => {
  const lines = [
    'export function IntegrationsPage() {',
    '  const [tab, setTab] = useState("a");',
    '  return (',
    '    <div>',
    '      {tab === "accounts" && (',
    '        <section>',
    '          {user ? <A /> : <B />}',
    '        </section>',
    '      )}',
    '    </div>',
    '  );',
    '}',
    '',
    'export const Other = () => null;',
  ];
  assert.deepEqual(names(lines), [
    'IntegrationsPage', 'IntegrationsPage', 'IntegrationsPage', 'IntegrationsPage', 'IntegrationsPage',
    'IntegrationsPage', 'IntegrationsPage', 'IntegrationsPage', 'IntegrationsPage', 'IntegrationsPage',
    'IntegrationsPage', 'IntegrationsPage', null, 'Other',
  ]);
  assert.equal(app.buildScopeIndex(lines)[6].line, 1);
});

test('inner declarations win, closing braces keep their block and multi-line signatures survive', () => {
  assert.deepEqual(names(['function outer() {', '  function inner() {', '    return 1;', '  }', '  return inner();', '}']), [
    'outer', 'inner', 'inner', 'inner', 'outer', 'outer',
  ]);
  assert.deepEqual(names(['export function buildPatch(', '  filePath: string,', '  hunk: ParsedDiffLine[],', '): string {', '  return filePath;', '}']), [
    'buildPatch', null, null, 'buildPatch', 'buildPatch', 'buildPatch',
  ]);
  assert.deepEqual(names(['class Panel {', '  render() {', '    return null;', '  }', '  other() {}', '}']), [
    'Panel', 'render', 'render', 'render', 'other', 'Panel',
  ]);
});

test('files without braces fall back to indentation scopes', () => {
  assert.deepEqual(names(['def load():', '    value = 1', '    def inner():', '        return 2', '    return inner', 'class Panel:', '    pass']), [
    'load', 'load', 'inner', 'inner', 'load', 'Panel', 'Panel',
  ]);
});

test('hunk scopes resolve from the hunk start line on either side', () => {
  const lines = ['export function panel() {', '  one', '  two', '  three', '}', ''];
  const diff = app.parseDiffOutput('diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -3,1 +3,1 @@\n-two\n+two!\n');
  assert.deepEqual(app.hunkScopes(diff, lines).get(0), { name: 'panel', kind: 'function', line: 1 });
  const deleted = app.parseDiffOutput('diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ /dev/null\n@@ -1,4 +0,0 @@\n-export function panel() {\n-  one\n-  two\n-  three\n-}\n');
  assert.equal(app.hunkScopes(deleted, lines, 'old').get(0)?.name, 'panel');
  assert.equal(app.hunkScopes(diff, []).size, 0);
});

test('whole-file expansion fills the gaps before, between and after hunks with both line numbers', () => {
  const fileLines = Array.from({ length: 10 }, (_, index) => `l${index + 1}`);
  const diff = app.parseDiffOutput('diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -2,1 +2,1 @@\n-l2\n+l2x\n@@ -8,1 +8,1 @@\n-l8\n+l8x\n');
  const rows = app.expandDiffWithFile(diff, fileLines);
  assert.deepEqual(rows.filter(row => row.type === 'context').map(row => [row.oldNo, row.newNo, row.content]), [
    [1, 1, ' l1'], [3, 3, ' l3'], [4, 4, ' l4'], [5, 5, ' l5'], [6, 6, ' l6'], [7, 7, ' l7'],
    [9, 9, ' l9'], [10, 10, ' l10'],
  ]);
  assert.equal(rows.length, 14);
  assert.equal(rows.filter(row => row.type === 'header').length, 2);
});

test('expansion keeps line numbers aligned when hunks insert or delete whole lines', () => {
  // 纯删除块（新侧 0 行）与纯插入块（旧侧 0 行）都会让两侧行号错位，必须按已消费行数换算。
  const deletion = app.parseDiffOutput('diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -2,2 +1,0 @@\n-o2\n-o3\n');
  const afterDeletion = app.expandDiffWithFile(deletion, ['n1', 'n4', 'n5']);
  assert.deepEqual(afterDeletion.filter(row => row.type === 'context').map(row => [row.oldNo, row.newNo, row.content]), [
    [1, 1, ' n1'], [4, 2, ' n4'], [5, 3, ' n5'],
  ]);
  const insertion = app.parseDiffOutput('diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -2,0 +3,2 @@\n+x\n+y\n');
  const afterInsertion = app.expandDiffWithFile(insertion, ['a', 'b', 'x', 'y', 'c']);
  assert.deepEqual(afterInsertion.filter(row => row.type === 'context').map(row => [row.oldNo, row.newNo, row.content]), [
    [1, 1, ' a'], [2, 2, ' b'], [3, 5, ' c'],
  ]);
});

test('deleted files expand from the old side and keep the new side empty', () => {
  const diff = app.parseDiffOutput('diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ /dev/null\n@@ -2,1 +2,0 @@\n-gone\n');
  const rows = app.expandDiffWithFile(diff, ['keep', 'gone', 'tail'], 'old');
  assert.deepEqual(rows.filter(row => row.type === 'context').map(row => [row.oldNo, row.newNo, row.content]), [
    [1, null, ' keep'], [3, null, ' tail'],
  ]);
});

test('expansion is a no-op without file content or with unreadable hunk headers', () => {
  const diff = app.parseDiffOutput('diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1,1 +1,1 @@\n-a\n+b\n');
  assert.equal(app.expandDiffWithFile(diff, []).length, diff.length);
  const binary = app.parseDiffOutput('diff --git a/a.bin b/a.bin\nBinary files a/a.bin and b/a.bin differ\n');
  assert.deepEqual(app.expandDiffWithFile(binary, ['x', 'y']), binary);
});

test('file content is split into lines without a trailing empty row or CR bytes', () => {
  assert.deepEqual(app.splitFileContent('a\r\nb\r\n'), ['a', 'b']);
  assert.deepEqual(app.splitFileContent('a\nb'), ['a', 'b']);
  assert.deepEqual(app.splitFileContent(''), []);
});
