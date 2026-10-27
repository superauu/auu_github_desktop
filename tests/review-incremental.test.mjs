import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const root = process.cwd();
let app, tmp;
before(async () => {
  tmp = await fs.mkdtemp(path.join(root, '.test-tmp-review-incremental-'));
  const bundle = path.join(tmp, 'incremental.cjs');
  await build({
    stdin: { contents: `export * from './src/features/review/reviewIncremental'; export {GitService} from './src/services/git/GitService';`, resolveDir: root },
    bundle: true, platform: 'node', format: 'cjs', outfile: bundle, alias: { '@': path.join(root, 'src') }, logLevel: 'silent',
    plugins: [{ name: 'local-git-review', setup(b) {
      b.onResolve({ filter: /^@\/i18n$/ }, () => ({ path: 'i18n', namespace: 'stub' }));
      b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const tNow = k => k;' }));
      b.onLoad({ filter: /GitExecutor\.ts$/ }, () => ({ contents: `
        import {execFileSync} from 'node:child_process';
        export class GitExecutionError extends Error {}
        export async function executeGit(args,cwd){return {stdout:execFileSync('git',args,{cwd,encoding:'utf8',windowsHide:true}),stderr:'',exitCode:0};}
        export const executeGitNow=executeGit;
        export const executeGitTransaction=async(cwd,run)=>run(args=>executeGit(args,cwd));
        export const serializeGitWrite=()=>{};
        export const GitQueue={isReadOnlyGitCommand:()=>true,serializeGitWrite};
      `, loader: 'js' }));
    } }],
  });
  app = createRequire(import.meta.url)(bundle);
});
after(async () => {
  if (tmp && path.dirname(tmp) === root && path.basename(tmp).startsWith('.test-tmp-review-incremental-')) await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5 });
});

const lines = (start = 1, added = '+new', second = '+second') => [
  { type: 'header', content: `@@ -1,1 +${start},1 @@` },
  { type: 'delete', content: '-old' }, { type: 'add', content: added },
  { type: 'header', content: `@@ -20,1 +${start + 19},1 @@` },
  { type: 'delete', content: '-old second' }, { type: 'add', content: second },
];
const progress = (evidence) => ({ approval: { approvedFiles: ['a.ts'], approvedHunks: { 'a.ts': [1, 20] } }, evidence: { 'a.ts': evidence }, comments: [] });

test('hunk fingerprints ignore moved line numbers but distinguish edits and CRLF bytes', async () => {
  const before = await app.captureReviewEvidence(lines(), 'v1');
  const moved = await app.captureReviewEvidence(lines(10), 'v2');
  assert.equal(before.hunks[0].fingerprint, moved.hunks[0].fingerprint);
  assert.equal(moved.hunks[0].startLine, 10);
  const edited = await app.captureReviewEvidence(lines(10, '+different'), 'v3');
  assert.notEqual(before.hunks[0].fingerprint, edited.hunks[0].fingerprint);
  const crlf = lines(); crlf[2].patchContent = '+new\r';
  assert.notEqual(before.hunks[0].fingerprint, (await app.captureReviewEvidence(crlf, 'v4')).hunks[0].fingerprint);
});

test('unchanged files including binary files retain approval; mode or blob changes reopen them', async () => {
  const evidence = await app.captureReviewEvidence(lines(), 'blob-and-mode');
  const old = progress(evidence);
  old.evidence['image.png'] = { version: 'binary-blob', hunks: [] };
  old.approval.approvedFiles.push('image.png');
  const next = app.carryReviewProgress(old, { 'a.ts': 'blob-and-mode', 'image.png': 'binary-blob' }, 'head-1');
  assert.deepEqual(next.approval.approvedFiles, ['a.ts', 'image.png']);
  assert.deepEqual(app.carryReviewProgress(old, { 'a.ts': 'changed-mode', 'image.png': 'changed-binary' }, 'head-1').approval.approvedFiles, []);
});

test('changed files keep only unchanged unique hunks after loading the new diff', async () => {
  const old = progress(await app.captureReviewEvidence(lines(), 'v1'));
  const next = app.carryReviewProgress(old, { 'a.ts': 'v2' }, 'head-1');
  assert.deepEqual(next.approval.approvedHunks, {});
  const reconciled = app.reconcileReviewFile(next, 'a.ts', await app.captureReviewEvidence(lines(10, '+changed'), 'v2'));
  assert.deepEqual(reconciled.approval.approvedFiles, []);
  assert.deepEqual(reconciled.approval.approvedHunks['a.ts'], [29]);
  assert.deepEqual(reconciled.pending, {});
});

test('duplicate hunk contents never inherit approval through an ambiguous match', async () => {
  const identical = [{ startLine: 1, endLine: 1, fingerprint: 'same', context: 'x' }, { startLine: 20, endLine: 20, fingerprint: 'same', context: 'x' }];
  const next = app.carryReviewProgress(progress({ version: 'v1', hunks: identical }), { 'a.ts': 'v2' }, 'head-1');
  const reconciled = app.reconcileReviewFile(next, 'a.ts', { version: 'v2', hunks: identical.map(h => ({ ...h, startLine: h.startLine + 10 })) });
  assert.deepEqual(reconciled.approval.approvedHunks['a.ts'], []);
});

test('several new commits before opening a changed file retain only verifiable original hunks', async () => {
  const old = progress(await app.captureReviewEvidence(lines(), 'v1'));
  const once = app.carryReviewProgress(old, { 'a.ts': 'v2' }, 'head-1');
  const twice = app.carryReviewProgress(once, { 'a.ts': 'v3' }, 'head-2');
  const next = app.reconcileReviewFile(twice, 'a.ts', await app.captureReviewEvidence(lines(10, '+changed'), 'v3'));
  assert.deepEqual(next.approval.approvedHunks['a.ts'], [29]);
  assert.deepEqual(next.approval.approvedFiles, []);
});

test('moved findings retain original context; changed or removed code never auto-resolves findings', async () => {
  const evidence = await app.captureReviewEvidence(lines(), 'v1');
  const old = progress(evidence);
  old.comments = [{ id: 'note', path: 'a.ts', startLine: 20, endLine: 20, text: 'Check second', status: 'resolved', origin: {
    headHash: 'head-1', startLine: 20, endLine: 20, context: evidence.hunks[1].context, fingerprint: evidence.hunks[1].fingerprint,
  } }];
  const changed = app.carryReviewProgress(old, { 'a.ts': 'v2' }, 'head-1');
  assert.equal(changed.comments[0].status, 'needsReview');
  const moved = app.reconcileReviewFile(changed, 'a.ts', await app.captureReviewEvidence(lines(10, '+changed'), 'v2'));
  assert.equal(moved.comments[0].startLine, 29);
  assert.equal(moved.comments[0].anchorStale, false);
  assert.equal(moved.comments[0].status, 'needsReview');
  assert.deepEqual(moved.comments[0].origin, old.comments[0].origin);
  const fixed = app.reconcileReviewFile(changed, 'a.ts', await app.captureReviewEvidence(lines(10, '+changed', '+fixed'), 'v2'));
  assert.equal(fixed.comments[0].status, 'outdated');
  assert.equal(fixed.comments[0].text, 'Check second');
  assert.equal(app.carryReviewProgress(old, {}, 'head-1').comments[0].status, 'outdated');
  const manuallyResolved = { ...changed, comments: changed.comments.map(c => ({ ...c, status: 'resolved' })) };
  assert.equal(app.reconcileReviewFile(manuallyResolved, 'a.ts', await app.captureReviewEvidence(lines(10, '+changed', '+fixed'), 'v2')).comments[0].status, 'resolved');
});

test('unverifiable versions never retain file approval or reuse stale coordinates', async () => {
  const old = progress(await app.captureReviewEvidence(lines(), ''));
  old.comments = [{ id: 'old', path: 'a.ts', startLine: 1, endLine: 1, text: 'Old note' }];
  const next = app.carryReviewProgress(old, {}, 'head-1');
  assert.deepEqual(next.approval.approvedFiles, []);
  assert.equal(next.comments[0].anchorStale, true);
  assert.equal(next.comments[0].status, 'outdated');
  assert.equal(next.comments[0].origin.headHash, 'head-1');
});

test('real Git versions include full blob hashes, file modes, binary files and literal unusual paths', async () => {
  const repo = path.join(tmp, 'repo'); await fs.mkdir(repo);
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', windowsHide: true }).trim();
  git('init', '-q'); git('config', 'user.name', 'Review Test'); git('config', 'user.email', 'review@example.invalid');
  git('config', 'core.autocrlf', 'false');
  const name = '中文 [literal].ts';
  const source = Array.from({ length: 50 }, (_, i) => `line ${i + 1}`);
  await fs.writeFile(path.join(repo, name), source.join('\n') + '\n');
  await fs.writeFile(path.join(repo, 'image.bin'), Buffer.from([0, 1, 2]));
  git('add', '.'); git('commit', '-qm', 'base'); const base = git('rev-parse', 'HEAD');
  source[0] = 'first change'; source[39] = 'last change';
  await fs.writeFile(path.join(repo, name), source.join('\n') + '\n');
  await fs.writeFile(path.join(repo, 'image.bin'), Buffer.from([0, 1, 3]));
  git('add', '.'); git('commit', '-qm', 'reviewed'); const reviewed = git('rev-parse', 'HEAD');
  const service = new app.GitService();
  const versions = await service.getReviewFileVersions(repo, base, reviewed);
  assert.match(versions[name], /^:100644 100644 [0-9a-f]{40} [0-9a-f]{40} M$/);
  assert.ok(versions['image.bin']);
  const oldLines = await service.getRangeFileDiff(repo, base, reviewed, name);
  const before = await app.captureReviewEvidence(oldLines, versions[name]);
  assert.equal(before.hunks.length, 2);
  source[0] = 'first changed again';
  await fs.writeFile(path.join(repo, name), source.join('\n') + '\n');
  git('add', '.'); git('commit', '-qm', 'follow-up'); const head = git('rev-parse', 'HEAD');
  const nextVersions = await service.getReviewFileVersions(repo, base, head);
  assert.notEqual(nextVersions[name], versions[name]);
  assert.equal(nextVersions['image.bin'], versions['image.bin']);
  const newLines = await service.getRangeFileDiff(repo, base, head, name);
  const after = await app.captureReviewEvidence(newLines, nextVersions[name]);
  assert.notEqual(before.hunks[0].fingerprint, after.hunks[0].fingerprint);
  assert.equal(before.hunks[1].fingerprint, after.hunks[1].fingerprint);
  git('update-index', '--chmod=+x', name); git('commit', '-qm', 'mode');
  const modeVersions = await service.getReviewFileVersions(repo, base, git('rev-parse', 'HEAD'));
  assert.match(modeVersions[name], /^:100644 100755 /);
  assert.notEqual(modeVersions[name], nextVersions[name]);
});
