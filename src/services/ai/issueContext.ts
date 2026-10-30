import type { GitHubIssue, IssueDraftContext, IssueReference } from '@/services/github/issueTypes';
import { tNow } from '@/i18n';

const oneLine = (text: string) => text.replace(/[\r\n\0]+/g, ' ').trim().slice(0, 256);
const ref = (issue: IssueReference) => `${issue.owner}/${issue.repo}#${issue.number}`;
export const toIssueContext = (reference: IssueReference, issue: GitHubIssue): IssueDraftContext => ({
  ...reference, title: oneLine(issue.title), body: (issue.body || '').slice(0, 2000),
});
export function issuePromptContext(issues: IssueDraftContext[] = []) {
  if (!issues.length) return '';
  const data = JSON.stringify(issues.slice(0, 5).map(issue => ({ reference: ref(issue), title: oneLine(issue.title), body: issue.body.slice(0, 2000) })))
    .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
  return `\n<issue-context-json>\n${data}\n</issue-context-json>`;
}
export function withIssueReferences(message: string, issues: IssueDraftContext[] = []) {
  const lines = [...new Set(issues.map(issue => `Refs ${ref(issue)}`))].filter(line => !message.split('\n').some(item => item.trim().toLowerCase() === line.toLowerCase()));
  return [message.trim(), ...lines].filter(Boolean).join('\n\n');
}
export function issueCommitDraft(issue: IssueDraftContext, bug = false) {
  return `${bug ? 'fix' : 'feat'}: ${oneLine(issue.title)}\n\nRefs ${ref(issue)}`;
}
export function issuePRDraft(issues: IssueDraftContext[]) {
  return { title: issues.length ? oneLine(issues[0].title) : '',
    // The source descriptions stay out of the executable closing-reference prose.
    body: [`## ${tNow('issueFlow.background')}`, ...issues.map(issue => `- https://github.com/${issue.owner}/${issue.repo}/issues/${issue.number}`),
      `\n## ${tNow('issueFlow.changeSummary')}`, `- [ ] ${tNow('issueFlow.describeChanges')}`,
      `\n## ${tNow('issueFlow.validation')}`, `- [ ] ${tNow('issueFlow.describeValidation')}`].join('\n'),
  };
}
