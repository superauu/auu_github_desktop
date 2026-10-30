import type { HunkCommitGroup } from '@/services/git/HunkCommitService';
import type { IssueReference } from '@/services/github/issueTypes';
import { tNow } from '@/i18n';

function proseLines(body: string) {
  let fence = '', length = 0;
  const outside = body.split(/\r?\n/).filter(line => {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (marker && marker[1][0] === fence && marker[1].length >= length && !marker[2].trim()) fence = '';
      return false;
    }
    if (marker) { fence = marker[1][0]; length = marker[1].length; return false; }
    if (/^(?: {4}|\t)/.test(line)) return false;
    return true;
  }).join('\n');
  let commentOpen = false;
  const prose = outside.replace(/<!--[\s\S]*?(?:-->|$)/g, comment => { if (!comment.endsWith('-->')) commentOpen = true; return ''; }).replace(/(`+)[\s\S]*?\1/g, '');
  return { lines: prose.split('\n'), open: !!fence || commentOpen };
}

/** Preserve prose and assignments; only add explicit, fully qualified references. */
export function proposeHunkIssueReferences(groups: HunkCommitGroup[], selected: string[], issue: IssueReference) {
  if (!/^[\w.-]+$/.test(issue.owner) || !/^[\w.-]+$/.test(issue.repo) || !Number.isSafeInteger(issue.number) || issue.number <= 0
    || !selected.length || new Set(selected).size !== selected.length || selected.some(id => !groups.some(group => group.id === id))) throw new Error(tNow('hunkIssue.invalid'));
  const line = `Refs ${issue.owner}/${issue.repo}#${issue.number}`;
  const changed: string[] = [];
  const proposed = groups.map(group => {
    if (!selected.includes(group.id)) return { ...group, units: [...group.units] };
    // Fenced/inline examples and HTML comments do not count as actual references.
    const prose = proseLines(group.body);
    if (prose.lines.some(value => value.trim().toLowerCase() === line.toLowerCase())) return { ...group, units: [...group.units] };
    if (prose.open) throw new Error(tNow('hunkIssue.unclosed'));
    const newline = group.body.includes('\r\n') ? '\r\n' : '\n';
    const body = group.body + (group.body ? newline + newline : '') + line;
    if (body.length > 6000) throw new Error(tNow('hunkIssue.tooLong'));
    changed.push(group.id);
    return { ...group, body, units: [...group.units] };
  });
  return { groups: proposed, changed };
}
