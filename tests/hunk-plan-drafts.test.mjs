import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const root = process.cwd();
let tmp, app;
const values = new Map();
const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
const plan = () => ({ repoPath: '/repo', branch: 'main', head: 'a'.repeat(40), baseTree: 'b'.repeat(40), indexTree: 'c'.repeat(40), index: 'PRIVATE_INDEX', flags: 'PRIVATE_FLAGS', files: [], units: [
  { id: 'h0:0', path: 'a.ts', paths: ['a.ts'], kind: 'hunk', label: '@@ -1 +1 @@', patch: 'PRIVATE_SOURCE_PATCH' },
  { id: 'f1', path: 'b.bin', paths: ['old.bin', 'b.bin'], kind: 'file', label: 'Whole file', patch: 'PRIVATE_BINARY_METADATA' },
] });
const groups = () => [{ id: 'ui-2', title: 'second', body: 'Detailed message', reason: 'Related changes', units: ['f1'] }, { id: 'ui-1', title: '', body: '', units: [] }];
before(async () => {
  tmp = await fs.mkdtemp(path.join(root, '.test-tmp-hunk-drafts-'));
  const outfile = path.join(tmp, 'drafts.cjs');
  await build({ entryPoints: ['src/services/git/HunkPlanDraftService.ts'], outfile, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' });
  app = createRequire(import.meta.url)(outfile);
});
beforeEach(() => { values.clear(); globalThis.localStorage = storage; });
after(async () => { if (tmp && path.dirname(tmp) === root && path.basename(tmp).startsWith('.test-tmp-hunk-drafts-')) await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5 }); });

test('round-trips incomplete groups, messages, reasons, order and unassigned units across a fresh session', async () => {
  const session = await app.createHunkDraftSession(plan());
  assert.deepEqual(session.load(), { status: 'missing' }); assert.equal(session.save(groups()), true);
  const reopened = await app.createHunkDraftSession(structuredClone(plan()));
  const result = reopened.load(); assert.equal(result.status, 'matching');
  assert.deepEqual(result.groups.map(({ id, ...group }) => group), groups().map(({ id, ...group }) => group));
  result.groups[0].units.push('h0:0'); assert.deepEqual(reopened.load().groups[0].units, ['f1']);
});

test('persists only messages, assignments and a digest, without source, index, raw plan or extra properties', async () => {
  const session = await app.createHunkDraftSession(plan());
  assert.equal(session.save(groups().map(group => ({ ...group, patch: 'DO_NOT_STORE', apiKey: 'PRIVATE_KEY' }))), true);
  const raw = values.get(app.HUNK_DRAFT_KEY);
  assert.doesNotMatch(raw, /PRIVATE_|DO_NOT_STORE|indexTree|baseTree|apiKey|"patch"|"files"/);
  assert.match(JSON.parse(raw).drafts[0].fingerprint, /^[a-f\d]{64}$/);
});

test('rejects restoration after any snapshot identity or code-unit change', async () => {
  const mutations = [p => { p.head = 'd'.repeat(40); }, p => { p.indexTree = 'd'.repeat(40); }, p => { p.baseTree = 'd'.repeat(40); },
    p => { p.index += ' changed'; }, p => { p.flags += ' changed'; }, p => { p.units[0].patch += '\n+new'; },
    p => { p.units[0].id = 'other'; }, p => { p.units[0].path = 'other.ts'; }, p => { p.units[0].paths.push('other.ts'); }, p => { p.units[0].kind = 'file'; },
    p => { p.units.reverse(); }];
  for (const mutate of mutations) {
    const original = await app.createHunkDraftSession(plan()); original.save(groups()); const changed = plan(); mutate(changed);
    assert.equal((await app.createHunkDraftSession(changed)).load().status, 'stale');
  }
});

test('repository and branch drafts stay isolated and clearing one preserves the other', async () => {
  const a = await app.createHunkDraftSession(plan()); a.save(groups());
  const b = await app.createHunkDraftSession({ ...plan(), branch: 'other' }); assert.equal(b.load().status, 'missing'); b.save([{ ...groups()[0], title: 'other branch' }]);
  const c = await app.createHunkDraftSession({ ...plan(), repoPath: '/other-repo' }); assert.equal(c.load().status, 'missing'); c.save(groups());
  assert.equal(a.clear(), true); assert.equal(a.load().status, 'missing'); assert.equal(b.load().groups[0].title, 'other branch'); assert.equal(c.load().status, 'matching');
});

test('language-only labels and unstaged changes do not invalidate a staged draft', async () => {
  (await app.createHunkDraftSession(plan())).save(groups()); const changed = plan();
  changed.units[1].label = '整体文件 / 元数据'; changed.unstaged = 'unsaved unrelated source';
  assert.equal((await app.createHunkDraftSession(changed)).load().status, 'matching');
});

test('rejects malformed groups and unknown or duplicate assignments while allowing empty messages', async () => {
  const session = await app.createHunkDraftSession(plan());
  const invalid = [[], Array(13).fill(groups()[0]), [{ ...groups()[0], title: 'bad\nsubject' }], [{ ...groups()[0], body: 'bad\0body' }],
    [{ ...groups()[0], reason: 'x'.repeat(2001) }], [{ ...groups()[0], units: ['missing'] }], [{ ...groups()[0], units: ['f1', 'f1'] }],
    [{ ...groups()[0], units: 'f1' }], [{ ...groups()[0], title: 'x'.repeat(121) }], [{ ...groups()[0], body: 'x'.repeat(6001) }]];
  for (const value of invalid) assert.equal(session.save(value), false);
  assert.equal(session.load().status, 'missing'); assert.equal(session.save(groups()), true);
  const raw = JSON.parse(values.get(app.HUNK_DRAFT_KEY)); raw.drafts[0].groups[0].units = ['missing']; values.set(app.HUNK_DRAFT_KEY, JSON.stringify(raw));
  assert.equal(session.load().status, 'stale');
});

test('invalid, oversized and unsupported storage cannot restore a plan and can be replaced by an explicit edit', async () => {
  const session = await app.createHunkDraftSession(plan());
  for (const raw of ['{broken', '{}', JSON.stringify({ version: 999, drafts: [] }), 'x'.repeat(1_000_001)]) {
    values.set(app.HUNK_DRAFT_KEY, raw); assert.equal(session.load().status, 'invalid');
    assert.equal(session.save(groups()), true); assert.equal(session.load().status, 'matching');
  }
  values.set(app.HUNK_DRAFT_KEY, '{}'); assert.equal(session.clear(), true); assert.equal(session.load().status, 'missing');
});

test('storage failures are reported without throwing or claiming that edits were saved', async () => {
  const session = await app.createHunkDraftSession(plan());
  globalThis.localStorage = { getItem() { throw Error('denied'); }, setItem() { throw Error('quota'); }, removeItem() { throw Error('denied'); } };
  assert.equal(session.load().status, 'unavailable'); assert.equal(session.save(groups()), false); assert.equal(session.clear(), false);
  globalThis.localStorage = { ...storage, setItem() { throw Error('quota'); } }; assert.equal(session.save(groups()), false); assert.equal(session.load().status, 'missing');
});

test('expired drafts are ignored and storage keeps at most the 20 most recently saved contexts', async context => {
  let now = Date.now(); context.mock.method(Date, 'now', () => now);
  const first = await app.createHunkDraftSession(plan()); first.save(groups());
  now += 31 * 24 * 60 * 60 * 1000; assert.equal(first.load().status, 'missing');
  for (let index = 0; index < 25; index++) { now++; (await app.createHunkDraftSession({ ...plan(), branch: `b${index}` })).save(groups()); }
  const stored = JSON.parse(values.get(app.HUNK_DRAFT_KEY)); assert.equal(stored.drafts.length, 20); assert.equal(stored.drafts[0].branch, 'b24'); assert.equal(stored.drafts.at(-1).branch, 'b5');
});
