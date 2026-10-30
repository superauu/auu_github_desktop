import type { HunkCommitGroup, HunkCommitPlan } from './HunkCommitService';

export const HUNK_DRAFT_KEY = 'auugit-hunk-plan-drafts';
const MAX_SIZE = 1_000_000, MAX_AGE = 30 * 24 * 60 * 60 * 1000;
interface Draft { repoPath: string; branch: string; fingerprint: string; savedAt: number; groups: HunkCommitGroup[] }
export type HunkDraftResult = { status: 'missing' | 'unavailable' | 'invalid' } | { status: 'matching' | 'stale'; groups: HunkCommitGroup[] };
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max && !value.includes('\0');

// Drafts may be incomplete. Treat persisted values as data and rebuild explicit
// fields rather than restoring an executable plan, patch or temporary index.
function parseGroups(value: unknown): HunkCommitGroup[] | null {
  if (!Array.isArray(value) || !value.length || value.length > 12) return null;
  const used = new Set<string>();
  const groups: HunkCommitGroup[] = [];
  for (const [index, group] of value.entries()) {
    if (!record(group) || !text(group.title, 120) || /[\r\n]/.test(group.title) || !text(group.body, 6000)
      || (group.reason !== undefined && !text(group.reason, 2000)) || !Array.isArray(group.units) || group.units.length > 1000) return null;
    const units: string[] = [];
    for (const id of group.units) {
      if (!text(id, 128) || !id || used.has(id)) return null;
      used.add(id); units.push(id);
    }
    groups.push({ id: `draft-${index}`, title: group.title, body: group.body, units, ...(group.reason === undefined ? {} : { reason: group.reason }) });
  }
  return groups;
}

function readDrafts(): Draft[] {
  const raw = localStorage.getItem(HUNK_DRAFT_KEY);
  if (!raw) return [];
  if (raw.length > MAX_SIZE) throw Error('Invalid draft storage');
  const data: unknown = JSON.parse(raw);
  if (!record(data) || data.version !== 1 || !Array.isArray(data.drafts) || data.drafts.length > 20) throw Error('Invalid draft storage');
  const drafts: Draft[] = [];
  for (const value of data.drafts) {
    if (!record(value) || !text(value.repoPath, 32768) || !text(value.branch, 1024) || typeof value.fingerprint !== 'string'
      || !/^[a-f\d]{64}$/.test(value.fingerprint) || typeof value.savedAt !== 'number' || !Number.isFinite(value.savedAt)) continue;
    if (value.savedAt < Date.now() - MAX_AGE || value.savedAt > Date.now() + 300_000) continue;
    const groups = parseGroups(value.groups);
    if (groups) drafts.push({ repoPath: value.repoPath, branch: value.branch, fingerprint: value.fingerprint, savedAt: value.savedAt, groups });
  }
  return drafts;
}

function writeDrafts(drafts: Draft[]) {
  const kept = drafts.sort((a, b) => b.savedAt - a.savedAt).slice(0, 20);
  let raw = JSON.stringify({ version: 1, drafts: kept });
  while (raw.length > MAX_SIZE && kept.length > 1) { kept.pop(); raw = JSON.stringify({ version: 1, drafts: kept }); }
  if (raw.length > MAX_SIZE) throw Error('Draft too large');
  if (kept.length) localStorage.setItem(HUNK_DRAFT_KEY, raw);
  else localStorage.removeItem(HUNK_DRAFT_KEY);
}

/** Capture a digest of a freshly verified snapshot; never persist its source. */
export async function createHunkDraftSession(plan: HunkCommitPlan) {
  const source = JSON.stringify([plan.repoPath, plan.branch, plan.head, plan.baseTree, plan.indexTree, plan.index, plan.flags,
    plan.units.map(unit => [unit.id, unit.path, unit.paths, unit.kind, unit.patch])]);
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
  const fingerprint = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
  const repoPath = plan.repoPath, branch = plan.branch, units = new Set(plan.units.map(unit => unit.id));
  const same = (draft: Draft) => draft.repoPath === repoPath && draft.branch === branch;
  return {
    load(): HunkDraftResult {
      try {
        const draft = readDrafts().find(same);
        if (!draft) return { status: 'missing' };
        return { status: draft.fingerprint === fingerprint && draft.groups.every(group => group.units.every(id => units.has(id))) ? 'matching' : 'stale', groups: draft.groups };
      } catch (error) { return { status: error instanceof SyntaxError || (error instanceof Error && error.message === 'Invalid draft storage') ? 'invalid' : 'unavailable' }; }
    },
    save(groups: HunkCommitGroup[]): boolean {
      try {
        const parsed = parseGroups(groups);
        if (!parsed || parsed.some(group => group.units.some(id => !units.has(id)))) return false;
        const draft = { repoPath, branch, fingerprint, savedAt: Date.now(), groups: parsed };
        // A malformed old envelope can be replaced by a new, explicitly edited draft.
        let previous: Draft[];
        try { previous = readDrafts(); } catch (error) { if (error instanceof SyntaxError || (error instanceof Error && error.message === 'Invalid draft storage')) previous = []; else throw error; }
        writeDrafts([draft, ...previous.filter(value => !same(value))]); return true;
      } catch { return false; }
    },
    clear(): boolean {
      try {
        let drafts: Draft[];
        try { drafts = readDrafts(); } catch (error) { if (error instanceof SyntaxError || (error instanceof Error && error.message === 'Invalid draft storage')) drafts = []; else throw error; }
        writeDrafts(drafts.filter(value => !same(value))); return true;
      } catch { return false; }
    },
  };
}
export type HunkDraftSession = Awaited<ReturnType<typeof createHunkDraftSession>>;
