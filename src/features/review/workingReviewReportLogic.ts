import { groupDiffIntoHunks } from '@/services/git/PorcelainParser';
import type { WorkingReviewSnapshot } from '@/services/git/WorkingReviewService';
import type { WorkingReviewRecord } from '@/stores/workingReviewStore';
import { buildReviewReport, type ReportFile } from './reviewLogic';

export interface WorkingIssueOrigin {
  source: 'staged' | 'unstaged' | 'untracked' | 'unknown';
  headHash?: string;
  header?: string;
  context: string;
  truncated: boolean;
}

/** Keep the code that was actually reviewed, rather than attaching later edits to an old note. */
export function captureWorkingIssueOrigin(snapshot: WorkingReviewSnapshot, hunkId?: string, source: WorkingIssueOrigin['source'] = 'unknown', headHash?: string): WorkingIssueOrigin {
  const hunk = snapshot.hunks.find(item => item.id === hunkId);
  if (hunkId && !hunk) return { source, headHash, context: '', truncated: false };
  const lines = hunk ? groupDiffIntoHunks(snapshot.lines).find(item => item[0].content === hunk.header) ?? [] : snapshot.lines;
  const context = [...snapshot.metadata, ...lines.map(line => line.patchContent ?? line.content)].join('\n');
  return { source, headHash, header: hunk?.header, context: context.slice(0, 8000), truncated: context.length > 8000 };
}

export function workingReviewEntries(records: Record<string, WorkingReviewRecord>, repoPath: string, branch: string, activePaths?: readonly string[], includeHistory = false) {
  const normalize = (path: string) => path.replace(/\\/g, '/').replace(/\/$/, '');
  const active = activePaths === undefined ? null : new Set(activePaths);
  return Object.entries(records).flatMap(([key, record]) => {
    try {
      const parts: unknown = JSON.parse(key);
      return Array.isArray(parts) && parts.length === 3 && typeof parts[0] === 'string' && normalize(parts[0]) === normalize(repoPath) && parts[1] === branch && typeof parts[2] === 'string' && record && Array.isArray(record.issues)
        && (!active || includeHistory || active.has(parts[2])) ? [{ key, path: parts[2], record }] : [];
    } catch { return []; }
  }).sort((a, b) => a.path.localeCompare(b.path));
}

export function buildWorkingReviewReport({ records, repoPath, branch, includeResolved = false, activePaths, includeHistory = false, t }: {
  records: Record<string, WorkingReviewRecord>; repoPath: string; branch: string; includeResolved?: boolean; activePaths?: readonly string[]; includeHistory?: boolean; t: (key: string) => string;
}) {
  const files: ReportFile[] = workingReviewEntries(records, repoPath, branch, activePaths, includeHistory).map(({ path, record }) => ({
    path,
    lines: record.issues.filter(issue => includeResolved || !issue.resolved).map(issue => {
      const origin = issue.origin;
      const location = [
        t(`workingReview.source.${origin?.source ?? 'unknown'}`),
        origin?.headHash ? `HEAD ${origin.headHash.slice(0, 10)}` : '',
        origin?.header ?? t(issue.hunk ? 'workingReview.reportUnknownHunk' : 'workingReview.wholeFile'),
        t(issue.resolved ? 'workingReview.resolved' : 'workingReview.unresolved'),
        `${t('workingReview.reportSnapshot')} ${issue.snapshot.slice(0, 12)}`,
      ].filter(Boolean).join(' · ');
      return {
        location, text: issue.text,
        context: origin?.context ? origin.context + (origin.truncated ? `\n${t('workingReview.reportTruncated')}` : '') : undefined,
        missingContext: !origin?.context,
      };
    }).map(({ missingContext, ...line }) => ({ ...line, location: line.location + (missingContext ? ` · ${t('workingReview.reportMissingContext')}` : '') })),
  }));
  const count = files.reduce((sum, file) => sum + file.lines.length, 0);
  return buildReviewReport([
    t('workingReview.reportTitle'),
    `${t('workingReview.reportRepository')}: ${repoPath}`,
    `${t('workingReview.reportBranch')}: ${branch}`,
    t('workingReview.reportIntro').replace('{n}', String(count)),
    t('workingReview.reportContextHint'),
  ], files);
}
