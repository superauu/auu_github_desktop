import type { WorkingIssueOrigin } from '@/features/review/workingReviewReportLogic';
import type { WorkingReviewIssue, WorkingReviewRecord } from './workingReviewStore';

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const strings = (value: unknown): string[] => Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === 'string' && !!item))] : [];

function normalizeOrigin(value: unknown): WorkingIssueOrigin | undefined {
  if (!object(value) || typeof value.context !== 'string') return undefined;
  const source = value.source;
  return {
    source: source === 'staged' || source === 'unstaged' || source === 'untracked' ? source : 'unknown',
    context: value.context.slice(0, 8000), truncated: value.truncated === true || value.context.length > 8000,
    ...(typeof value.header === 'string' ? { header: value.header } : {}),
    ...(typeof value.headHash === 'string' ? { headHash: value.headHash } : {}),
  };
}

/** Storage is external input. Keep valid legacy records and notes, without trusting array-like strings. */
export function normalizeWorkingReviewRecords(value: unknown): Record<string, WorkingReviewRecord> | null {
  if (!object(value)) return null;
  const records: Record<string, WorkingReviewRecord> = {};
  for (const [key, record] of Object.entries(value)) {
    let parts: unknown;
    try { parts = JSON.parse(key); } catch { continue; }
    if (!Array.isArray(parts) || parts.length !== 3 || !parts.every(part => typeof part === 'string') || !object(record)) continue;
    const issues: WorkingReviewIssue[] = [];
    const seen = new Set<string>();
    for (const issue of Array.isArray(record.issues) ? record.issues : []) {
      if (!object(issue) || typeof issue.id !== 'string' || !issue.id || seen.has(issue.id)
        || typeof issue.snapshot !== 'string' || !issue.snapshot || typeof issue.text !== 'string' || !issue.text.trim()) continue;
      seen.add(issue.id);
      const origin = normalizeOrigin(issue.origin);
      issues.push({ id: issue.id, snapshot: issue.snapshot, text: issue.text.slice(0, 6000), resolved: issue.resolved === true,
        ...(typeof issue.hunk === 'string' && issue.hunk ? { hunk: issue.hunk } : {}),
        ...(Array.isArray(issue.hunks) ? { hunks: strings(issue.hunks) } : {}),
        ...(origin ? { origin } : {}),
      });
    }
    // Recover readable notes, but never carry approvals past missing/corrupt issue data.
    const trusted = Array.isArray(record.issues) && issues.length === record.issues.length
      && record.issues.every(issue => object(issue) && typeof issue.resolved === 'boolean')
      && Array.isArray(record.approvedHunks) && record.approvedHunks.every(id => typeof id === 'string')
      && (record.approvedFiles === undefined || Array.isArray(record.approvedFiles) && record.approvedFiles.every(id => typeof id === 'string'))
      && (record.approvedFile === undefined || typeof record.approvedFile === 'string');
    const approvedFiles = trusted ? strings(record.approvedFiles).slice(-20) : [];
    const approvedFile = trusted && typeof record.approvedFile === 'string' ? record.approvedFile : undefined;
    const approvedSnapshots = object(record.approvedSnapshots) ? Object.fromEntries(Object.entries(record.approvedSnapshots)
      .filter(([fingerprint, hunks]) => (approvedFiles.includes(fingerprint) || fingerprint === approvedFile) && Array.isArray(hunks) && hunks.every(id => typeof id === 'string'))
      .map(([fingerprint, hunks]) => [fingerprint, strings(hunks)])) : {};
    records[key] = { approvedFile, approvedFiles, approvedHunks: trusted ? strings(record.approvedHunks) : [], approvedSnapshots, issues };
  }
  return records;
}
