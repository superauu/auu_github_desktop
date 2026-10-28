import { useEffect, useRef, useState } from 'react';
import type { GitFileChange, GitStatusResult } from '@/services/git/types';
import { captureWorkingReview, type WorkingReviewIdentity } from '@/services/git/WorkingReviewService';
import { useWorkingReviewStore, workingReviewKey, workingReviewStatus, type WorkingReviewRecord } from '@/stores/workingReviewStore';

export interface WorkingFileReviewState {
  kind: 'approved' | 'pending' | 'partial' | 'issues' | 'checking';
  approvedHunks: number; totalHunks: number; unresolved: number; failed?: boolean;
}
export const workingFileVersionKey = (file: GitFileChange) => JSON.stringify([file.path, !!file.staged, file.oldPath ?? '', file.status]);
const hasReview = (record?: WorkingReviewRecord) => !!record && (!!record.approvedFile || !!record.approvedFiles?.length || !!record.approvedHunks.length || record.issues.some(issue => !issue.resolved));
const pending: WorkingFileReviewState = { kind: 'pending', approvedHunks: 0, totalHunks: 0, unresolved: 0 };

/** Follow list order, wrap once and keep staged/unstaged versions distinct. */
export function nextWorkingReviewFile(files: readonly GitFileChange[], current: GitFileChange | undefined, stateFor: (file: GitFileChange) => WorkingFileReviewState) {
  const currentKey = current && workingFileVersionKey(current);
  const start = files.findIndex(file => workingFileVersionKey(file) === currentKey);
  for (let offset = 1; offset <= files.length; offset++) {
    const file = files[(start + offset) % files.length];
    if (workingFileVersionKey(file) !== currentKey && file.status !== 'conflicted' && stateFor(file).kind !== 'approved') return file;
  }
  return undefined;
}

/** Verify saved approvals for every list row, without reading diffs for never-reviewed files. */
export function useWorkingReviewFileList(repo: string, status: GitStatusResult | null, files: readonly GitFileChange[], revision = 0, selected?: { file?: GitFileChange; snapshot: WorkingReviewIdentity | null }) {
  const records = useWorkingReviewStore(state => state.records);
  const branch = status?.currentBranch ?? '';
  const scope = JSON.stringify([repo, branch, status?.headOid]);
  const fileSignature = JSON.stringify(files.map(workingFileVersionKey));
  const candidates = files.filter(file => file.status !== 'conflicted' && hasReview(records[workingReviewKey(repo, branch, file.path)]));
  const candidateSignature = JSON.stringify(candidates.map(workingFileVersionKey));
  const cache = useRef<{ scope: string; revision: number; status: GitStatusResult | null; files: string; snapshots: Map<string, WorkingReviewIdentity | null>; previous: Map<string, WorkingReviewIdentity | null> } | null>(null);
  const [, render] = useState(0);
  const selectedKey = selected?.file ? workingFileVersionKey(selected.file) : '';
  const selectedSnapshot = selected?.snapshot;

  useEffect(() => {
    if (!repo || !status) return;
    let cancelled = false, cursor = 0;
    if (cache.current?.scope !== scope || cache.current.revision !== revision || cache.current.status !== status || cache.current.files !== fileSignature) {
      const keys = new Set(files.map(workingFileVersionKey));
      const previous = cache.current?.scope === scope ? new Map([...cache.current.previous, ...cache.current.snapshots].filter(([key]) => keys.has(key))) : new Map<string, WorkingReviewIdentity | null>();
      cache.current = { scope, revision, status, files: fileSignature, snapshots: new Map(), previous };
    }
    const batch = cache.current;
    if (selectedKey && selectedSnapshot) batch.snapshots.set(selectedKey, { fingerprint: selectedSnapshot.fingerprint, hunks: selectedSnapshot.hunks });
    const missing = candidates.filter(file => !batch.snapshots.has(workingFileVersionKey(file)));
    render(value => value + 1);
    void Promise.all(Array.from({ length: Math.min(4, missing.length) }, async () => {
      while (!cancelled && cursor < missing.length) {
        const file = missing[cursor++], key = workingFileVersionKey(file);
        let identity: WorkingReviewIdentity | null = null;
        try { const snapshot = await captureWorkingReview(repo, file); identity = { fingerprint: snapshot.fingerprint, hunks: snapshot.hunks }; } catch { /* Failed verification must never keep a green approval. */ }
        if (cancelled || cache.current !== batch) return;
        // A newer selected-file read may already have supplied the current evidence.
        if (!batch.snapshots.has(key)) { batch.snapshots.set(key, identity); render(value => value + 1); }
      }
    }));
    return () => { cancelled = true; };
  }, [repo, scope, status, revision, fileSignature, candidateSignature]);

  useEffect(() => {
    const batch = cache.current;
    if (selectedKey && selectedSnapshot && batch?.scope === scope && batch.revision === revision && batch.status === status) {
      batch.snapshots.set(selectedKey, { fingerprint: selectedSnapshot.fingerprint, hunks: selectedSnapshot.hunks });
      render(value => value + 1);
    }
  }, [scope, status, revision, selectedKey, selectedSnapshot]);

  const states = new Map(files.map(file => {
    const key = workingFileVersionKey(file), record = records[workingReviewKey(repo, branch, file.path)];
    if (file.status === 'conflicted' || !hasReview(record)) return [key, pending] as const;
    const batch = cache.current;
    const fresh = batch?.scope === scope && batch.revision === revision && batch.status === status;
    // Periodic verification retains the last confirmed presentation until a new read completes.
    // Missing files, another branch/HEAD, and failed reads never inherit a green marker.
    const last = batch?.scope === scope ? batch.snapshots.has(key) ? batch.snapshots.get(key) : batch.previous.get(key) : undefined;
    const snapshot = selectedKey === key && selectedSnapshot ? selectedSnapshot : fresh && batch.snapshots.has(key) ? batch.snapshots.get(key) : last;
    if (snapshot === undefined) return [key, { ...pending, kind: 'checking' } as WorkingFileReviewState] as const;
    if (!snapshot) return [key, { ...pending, failed: true }] as const;
    const result = workingReviewStatus(record, snapshot);
    return [key, { ...result, totalHunks: snapshot.hunks.length, kind: result.unresolved ? 'issues' : result.approved ? 'approved' : result.approvedHunks ? 'partial' : 'pending' } as WorkingFileReviewState] as const;
  }));
  const values = [...states.values()];
  return {
    stateFor: (file: GitFileChange) => states.get(workingFileVersionKey(file)) ?? pending,
    approved: values.filter(state => state.kind === 'approved').length,
    checking: values.filter(state => state.kind === 'checking').length,
    pending: values.filter(state => state.kind !== 'approved' && state.kind !== 'checking').length,
  };
}
