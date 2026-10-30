import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import React from 'react';
import './react19-test-env.mjs';
import { create, act } from 'react-test-renderer';

const root = process.cwd(), saved = new Map(), originalFetch = globalThis.fetch;
globalThis.localStorage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key) };
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const directory = name => new Response(JSON.stringify({ currentPath: `/${name}`, parentPath: '/', directories: [{ name: `${name}-child`, path: `/${name}/child`, hasGit: false }] }), { headers: { 'Content-Type': 'application/json' } });
const repository = name => ({ path: `/${name}`, name, currentBranch: 'main' });
const diagnosis = summary => ({ summary, status: 'healthy', score: 100, issues: [] });
const tree = renderer => JSON.stringify(renderer.toJSON());
let app, tmp;

before(async () => {
  tmp = await fs.mkdtemp(path.join(root, '.test-tmp-hooks-'));
  const bundle = path.join(tmp, 'hooks.cjs');
  await build({ stdin: { contents: `export { InAppFolderBrowser } from './src/features/repository/InAppFolderBrowser'; export { HealthDiagnosisModal } from './src/features/git/HealthDiagnosisModal'; export { StashPreviewModal } from './src/features/git/StashPreviewModal'; export { DiffTools } from './src/components/ui/DiffTools'; export { useRepoStore } from './src/stores/repoStore'; export { useSettingsStore } from './src/stores/settingsStore'; export { gitService } from './src/services/git/GitService';`, resolveDir: root }, bundle: true, platform: 'node', format: 'cjs', outfile: bundle, external: ['react', 'react-dom'], alias: { '@': path.join(root, 'src') }, logLevel: 'silent', plugins: [{ name: 'headless-modal', setup(build) {
    build.onLoad({ filter: /ModalSurface\.tsx$/ }, () => ({ contents: 'export function ModalSurface({ children }) { return children; }', loader: 'jsx' }));
  } }] });
  app = createRequire(import.meta.url)(bundle);
});
after(async () => {
  globalThis.fetch = originalFetch;
  delete globalThis.document; delete globalThis.CustomEvent;
  if (tmp && path.dirname(tmp) === root && path.basename(tmp).startsWith('.test-tmp-hooks-')) await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5 });
});

test('folder navigation ignores older successes and errors while the newest request owns loading', async () => {
  const gates = [deferred(), deferred(), deferred()]; let calls = 0, renderer;
  globalThis.fetch = () => gates[calls++].promise;
  const props = name => ({ initialPath: `/${name}`, onSelectPath() {} });
  try {
    await act(async () => { renderer = create(React.createElement(app.InAppFolderBrowser, props('old'))); });
    await act(async () => renderer.update(React.createElement(app.InAppFolderBrowser, props('new'))));
    await act(async () => { gates[0].reject(new Error('stale folder failure')); });
    assert.doesNotMatch(tree(renderer), /stale folder failure/);
    assert.match(tree(renderer), /扫描/);
    await act(async () => { gates[1].resolve(directory('new')); });
    assert.match(tree(renderer), /new-child/);
    await act(async () => renderer.update(React.createElement(app.InAppFolderBrowser, props('latest'))));
    await act(async () => { gates[2].resolve(directory('latest')); });
    assert.match(tree(renderer), /latest-child/); assert.doesNotMatch(tree(renderer), /new-child/);
  } finally { await act(async () => renderer?.unmount()); globalThis.fetch = originalFetch; }
});

test('a slow folder reply cannot overwrite a newer path or selection', async () => {
  const old = deferred(), fresh = deferred(); let calls = 0, renderer, selected;
  globalThis.fetch = () => ++calls === 1 ? old.promise : fresh.promise;
  const props = name => ({ initialPath: `/${name}`, onSelectPath: value => { selected = value; } });
  try {
    await act(async () => { renderer = create(React.createElement(app.InAppFolderBrowser, props('old'))); });
    await act(async () => renderer.update(React.createElement(app.InAppFolderBrowser, props('fresh'))));
    await act(async () => { fresh.resolve(directory('fresh')); });
    await act(async () => { old.resolve(directory('old')); });
    assert.match(tree(renderer), /fresh-child/); assert.doesNotMatch(tree(renderer), /old-child/);
    const select = renderer.root.findAllByType('button').find(button => button.findAllByType('span').some(span => span.children.includes('选择当前目录')));
    assert.ok(select); act(() => select.props.onClick()); assert.equal(selected, '/fresh');
  } finally { await act(async () => renderer?.unmount()); globalThis.fetch = originalFetch; }
});

test('diagnosis rejects replies from a previous repository and from a closed session', async () => {
  const before = app.useRepoStore.getState(), gates = [deferred(), deferred(), deferred()]; let calls = 0, renderer;
  app.useRepoStore.setState({ currentRepo: repository('old'), diagnoseRepository: () => gates[calls++].promise });
  const props = { open: true, onOpenChange() {} };
  try {
    await act(async () => { renderer = create(React.createElement(app.HealthDiagnosisModal, props)); });
    await act(async () => app.useRepoStore.setState({ currentRepo: repository('fresh') }));
    await act(async () => { gates[1].resolve(diagnosis('fresh report')); });
    await act(async () => { gates[0].resolve(diagnosis('stale report')); });
    assert.match(tree(renderer), /fresh report/); assert.doesNotMatch(tree(renderer), /stale report/);
    await act(async () => renderer.update(React.createElement(app.HealthDiagnosisModal, { ...props, open: false })));
    await act(async () => renderer.update(React.createElement(app.HealthDiagnosisModal, props)));
    assert.doesNotMatch(tree(renderer), /fresh report/);
    await act(async () => renderer.update(React.createElement(app.HealthDiagnosisModal, { ...props, open: false })));
    await act(async () => { gates[2].reject(new Error('closed session failure')); });
    assert.equal(renderer.toJSON(), null);
  } finally { await act(async () => renderer?.unmount()); app.useRepoStore.setState(before, true); }
});

test('stash preview reloads on repository changes even when the stash object is reused', async () => {
  const before = app.useRepoStore.getState(), original = app.gitService.getStashPatch, gates = [deferred(), deferred()], paths = [];
  let renderer;
  app.useRepoStore.setState({ currentRepo: repository('old') });
  app.gitService.getStashPatch = repo => { paths.push(repo); return gates[paths.length - 1].promise; };
  const stash = { index: 0, message: 'stash', branch: 'main' };
  try {
    await act(async () => { renderer = create(React.createElement(app.StashPreviewModal, { stash, onClose() {} })); });
    await act(async () => app.useRepoStore.setState({ currentRepo: repository('fresh') }));
    assert.deepEqual(paths, ['/old', '/fresh']);
    await act(async () => { gates[1].resolve([{ type: 'add', content: '+fresh patch', oldNo: null, newNo: 1 }]); });
    await act(async () => { gates[0].resolve([{ type: 'add', content: '+stale patch', oldNo: null, newNo: 1 }]); });
    assert.match(tree(renderer), /fresh patch/); assert.doesNotMatch(tree(renderer), /stale patch/);
  } finally { await act(async () => renderer?.unmount()); app.gitService.getStashPatch = original; app.useRepoStore.setState(before, true); }
});

test('diff search reveals the first match in a replacement target without changing the query', async () => {
  const revealed = []; let renderer;
  globalThis.document = { getElementById: id => ({ querySelector: () => ({ dispatchEvent: event => revealed.push([id, event.detail]) }) }) };
  globalThis.CustomEvent = class { constructor(_name, options) { this.detail = options.detail; } };
  const props = { query: 'needle', onQueryChange() {}, contents: ['context', 'needle'], targetId: 'first' };
  try {
    await act(async () => { renderer = create(React.createElement(app.DiffTools, props)); });
    await act(async () => renderer.update(React.createElement(app.DiffTools, { ...props, targetId: 'second' })));
    assert.deepEqual(revealed, [['first', 1], ['second', 1]]);
  } finally { await act(async () => renderer?.unmount()); delete globalThis.document; delete globalThis.CustomEvent; }
});
