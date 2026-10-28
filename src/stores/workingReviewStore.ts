import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { WorkingReviewIdentity, WorkingReviewSnapshot } from '@/services/git/WorkingReviewService';
import { captureWorkingIssueOrigin, type WorkingIssueOrigin } from '@/features/review/workingReviewReportLogic';

export interface WorkingReviewIssue { id: string; text: string; snapshot: string; hunk?: string; hunks?: string[]; resolved: boolean; origin?: WorkingIssueOrigin }
export interface WorkingReviewRecord { approvedFile?: string; approvedFiles?: string[]; approvedHunks: string[]; issues: WorkingReviewIssue[] }
export const workingReviewKey = (repo: string, branch: string, path: string) => JSON.stringify([repo.replace(/\\/g, '/').replace(/\/$/, ''), branch, path]);
const empty = (): WorkingReviewRecord => ({ approvedHunks: [], issues: [] });
const STORAGE_KEY = 'auugit-working-review';
export const useWorkingReviewStorageStatus = create<{ unavailable: boolean }>(() => ({ unavailable: false }));
const storageUnavailable = (unavailable: boolean) => {
  if (useWorkingReviewStorageStatus.getState().unavailable !== unavailable) useWorkingReviewStorageStatus.setState({ unavailable });
};
const reviewStorage = {
  getItem: (key: string) => { try { return localStorage.getItem(key); } catch { storageUnavailable(true); return null; } },
  setItem: (key: string, value: string) => { try { localStorage.setItem(key, value); storageUnavailable(false); } catch { storageUnavailable(true); } },
  removeItem: (key: string) => { try { localStorage.removeItem(key); } catch { storageUnavailable(true); } },
};
export const isWorkingIssueCurrent = (issue: WorkingReviewIssue, snapshot: WorkingReviewIdentity | null) => !snapshot || issue.snapshot === snapshot.fingerprint || snapshot.hunks.some(hunk => issue.hunk ? issue.hunk === hunk.id : issue.hunks?.includes(hunk.id));
export function workingReviewStatus(record: WorkingReviewRecord | undefined, snapshot: WorkingReviewIdentity | null) {
  const unresolved = record?.issues.filter(issue => !issue.resolved && isWorkingIssueCurrent(issue, snapshot)).length ?? 0;
  const approvedHunks = snapshot?.hunks.filter(hunk => record?.approvedHunks.includes(hunk.id)).length ?? 0;
  const approved = !!snapshot && !unresolved && (record?.approvedFile === snapshot.fingerprint || record?.approvedFiles?.includes(snapshot.fingerprint) || (snapshot.hunks.length > 0 && approvedHunks === snapshot.hunks.length));
  return { approved, approvedHunks, unresolved };
}

interface WorkingReviewState {
  records: Record<string, WorkingReviewRecord>;
  approveFile: (key: string, snapshot: WorkingReviewSnapshot, approved: boolean) => void;
  approveHunk: (key: string, id: string, approved: boolean) => void;
  addIssue: (key: string, snapshot: WorkingReviewSnapshot, text: string, hunk?: string, origin?: WorkingIssueOrigin) => void;
  recoverIssueOrigins: (key: string, snapshot: WorkingReviewSnapshot) => void;
  updateIssue: (key: string, id: string, resolved: boolean) => void;
  deleteIssue: (key: string, id: string) => void;
  restoreIssue: (key: string, issue: WorkingReviewIssue, index: number) => void;
  retrySave: () => boolean;
}

export const useWorkingReviewStore = create<WorkingReviewState>()(persist((set, get) => {
  const update = (key: string, change: (record: WorkingReviewRecord) => WorkingReviewRecord) => set(state => ({ records: { ...state.records, [key]: change(state.records[key] ?? empty()) } }));
  return {
    records: {},
    approveFile: (key, snapshot, approved) => update(key, record => ({ ...record, approvedFile: undefined,
      approvedFiles: approved ? [...new Set([...(record.approvedFiles ?? []), ...(record.approvedFile ? [record.approvedFile] : []), snapshot.fingerprint])].slice(-20) : (record.approvedFiles ?? []).filter(id => id !== snapshot.fingerprint),
      approvedHunks: approved ? [...new Set([...record.approvedHunks, ...snapshot.hunks.map(hunk => hunk.id)])] : record.approvedHunks.filter(id => !snapshot.hunks.some(hunk => hunk.id === id)),
    })),
    approveHunk: (key, id, approved) => update(key, record => ({ ...record, approvedFile: undefined, approvedFiles: [], approvedHunks: approved ? [...new Set([...record.approvedHunks, id])] : record.approvedHunks.filter(value => value !== id) })),
    addIssue: (key, snapshot, text, hunk, origin) => {
      if (!text.trim()) return;
      update(key, record => ({ ...record, approvedFile: undefined, approvedFiles: [], approvedHunks: record.approvedHunks.filter(id => hunk ? id !== hunk : !snapshot.hunks.some(item => item.id === id)), issues: [...record.issues, { id: crypto.randomUUID(), text: text.trim().slice(0, 6000), snapshot: snapshot.fingerprint, hunk, hunks: snapshot.hunks.map(item => item.id), resolved: false, origin: origin ?? captureWorkingIssueOrigin(snapshot, hunk) }] }));
    },
    recoverIssueOrigins: (key, snapshot) => update(key, record => ({ ...record, issues: record.issues.map(issue => !issue.origin && issue.snapshot === snapshot.fingerprint && (!issue.hunk || snapshot.hunks.some(hunk => hunk.id === issue.hunk)) ? { ...issue, origin: captureWorkingIssueOrigin(snapshot, issue.hunk) } : issue) })),
    updateIssue: (key, id, resolved) => update(key, record => ({ ...record, issues: record.issues.map(issue => issue.id === id ? { ...issue, resolved } : issue) })),
    deleteIssue: (key, id) => update(key, record => ({ ...record, issues: record.issues.filter(issue => issue.id !== id) })),
    restoreIssue: (key, issue, index) => update(key, record => {
      if (record.issues.some(item => item.id === issue.id)) return record;
      const issues = [...record.issues]; issues.splice(Math.min(index, issues.length), 0, issue);
      return { ...record, issues };
    }),
    retrySave: () => {
      reviewStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { records: get().records }, version: 0 }));
      return !useWorkingReviewStorageStatus.getState().unavailable;
    },
  };
}, { name: STORAGE_KEY, storage: createJSONStorage(() => reviewStorage), partialize: state => ({ records: state.records }) }));

/** Session drafts stay with their original file, exact diff version and note target. */
export const useWorkingReviewDraftStore = create<{
  drafts: Record<string, string>;
  setDraft: (key: string, text: string) => void;
}>((set) => ({ drafts: {}, setDraft: (key, text) => set(state => {
  const drafts = { ...state.drafts };
  if (text) drafts[key] = text.slice(0, 6000); else delete drafts[key];
  return { drafts };
}) }));
