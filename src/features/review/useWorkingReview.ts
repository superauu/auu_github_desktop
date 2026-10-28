import { useEffect, useMemo, useState } from 'react';
import { captureWorkingReview, type WorkingReviewSnapshot } from '@/services/git/WorkingReviewService';
import type { GitFileChange, GitStatusResult } from '@/services/git/types';
import type { ParsedDiffLine } from '@/services/git/PorcelainParser';
import { useWorkingReviewStore, workingReviewKey, workingReviewStatus } from '@/stores/workingReviewStore';
import { isImagePath } from '@/services/git/ImageDiffService';
import { captureWorkingIssueOrigin } from './workingReviewReportLogic';

export function useWorkingReview(repo: string, status: GitStatusResult | null, file: GitFileChange | undefined, lines: ParsedDiffLine[], loading: boolean, filtered: boolean, error: string | null, revision = 0) {
  const key = workingReviewKey(repo, status?.currentBranch ?? '', file?.path ?? '');
  const view = JSON.stringify([key, status?.headOid, file?.staged, file?.status, file?.oldPath]);
  const record = useWorkingReviewStore(state => state.records[key]);
  const [evidence, setEvidence] = useState<{ view: string; lines: ParsedDiffLine[]; snapshot: WorkingReviewSnapshot | null; revision: number; status: GitStatusResult | null } | null>(null);
  const [retry, setRetry] = useState(0);
  const [noteTarget, setNoteTarget] = useState<string | null | undefined>(undefined);
  useEffect(() => { setNoteTarget(undefined); }, [view]);
  useEffect(() => {
    if (!repo || !file || loading || error || file.status === 'conflicted') return;
    let active = true;
    captureWorkingReview(repo, file).then(snapshot => {
      if (active) setEvidence(previous => ({ view, lines, revision, status,
        snapshot: previous?.view === view && previous.snapshot?.fingerprint === snapshot.fingerprint ? previous.snapshot : snapshot,
      }));
    }, () => { if (active) setEvidence({ view, lines, snapshot: null, revision, status }); });
    return () => { active = false; };
  }, [repo, view, lines, loading, error, retry, status, revision]);
  const currentEvidence = evidence?.view === view && evidence.lines === lines && evidence.revision === revision && evidence.status === status;
  const snapshot = evidence?.view === view && evidence.lines === lines ? evidence.snapshot : null;
  const matches = useMemo(() => !!snapshot && (isImagePath(file?.path ?? '') || snapshot.lines.length === lines.length && snapshot.lines.every((line, index) => {
    const visible = lines[index];
    // Full-index evidence has different patch headers from the rendered diff. Compare
    // actual line bytes and locations instead; display text alone strips CR bytes.
    return line.type === visible.type && line.oldNo === visible.oldNo && line.newNo === visible.newNo
      && (line.patchContent ?? line.content) === (visible.patchContent ?? visible.content);
  })), [snapshot, lines, file?.path]);
  const displayReady = !!snapshot && matches && !loading && !filtered && !error && file?.status !== 'conflicted';
  // Review actions apply to the exact code currently displayed. A background verification
  // must not disable/re-enable them; a changed view, changed code or failed read still does.
  const ready = displayReady;
  const summary = workingReviewStatus(record, snapshot);
  useEffect(() => {
    if (snapshot && matches && record?.issues.some(issue => !issue.origin && issue.snapshot === snapshot.fingerprint && (!issue.hunk || snapshot.hunks.some(hunk => hunk.id === issue.hunk)))) {
      useWorkingReviewStore.getState().recoverIssueOrigins(key, snapshot);
    }
  }, [key, record, snapshot, matches]);
  return {
    key, record, snapshot, verifiedSnapshot: currentEvidence ? snapshot : null, ready, displayReady, ...summary, noteTarget, setNoteTarget,
    failed: currentEvidence && (!snapshot || !matches),
    retry: () => setRetry(value => value + 1),
    approveFile: () => { if (ready) useWorkingReviewStore.getState().approveFile(key, snapshot, !summary.approved); },
    approveHunk: (id: string) => { if (ready) useWorkingReviewStore.getState().approveHunk(key, id, !record?.approvedHunks.includes(id)); },
    addIssue: (text: string) => { if (ready && (noteTarget === null || snapshot.hunks.some(hunk => hunk.id === noteTarget))) useWorkingReviewStore.getState().addIssue(key, snapshot, text, noteTarget ?? undefined,
      captureWorkingIssueOrigin(snapshot, noteTarget ?? undefined, file?.staged ? 'staged' : file?.status === 'untracked' ? 'untracked' : 'unstaged', /^[0-9a-f]{40,64}$/.test(status?.headOid ?? '') ? status!.headOid : undefined)); },
  };
}
export type WorkingReviewController = ReturnType<typeof useWorkingReview>;
