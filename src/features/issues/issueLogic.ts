import type { IssueReference, IssueTimelineEvent } from '@/services/github/issueTypes';

export const issueKey = (issue: IssueReference) => `${issue.owner.toLowerCase()}/${issue.repo.toLowerCase()}#${issue.number}`;
export const issueUrl = (issue: IssueReference) => `https://github.com/${encodeURIComponent(issue.owner)}/${encodeURIComponent(issue.repo)}/issues/${issue.number}`;
export const issueBranchName = (number: number, title: string) => `issue/${number}-${title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 55).replace(/-$/, '') || 'task'}`;
const prose = (body: string) => body.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`|<!--[\s\S]*?-->/g, '');

/** Only references outside code blocks count as links; numbers and repository names are validated. */
export function issueReferences(body: string | null, owner: string, repo: string): IssueReference[] {
  const text = prose(body || '');
  const references = new Map<string, IssueReference>();
  const pattern = /https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/issues\/(\d+)|(?<![\w/])(?:([\w.-]+)\/([\w.-]+))?#(\d+)\b/g;
  for (const match of text.matchAll(pattern)) {
    const issue = { owner: match[1] || match[4] || owner, repo: match[2] || match[5] || repo, number: Number(match[3] || match[6]) };
    if (Number.isSafeInteger(issue.number) && issue.number > 0) references.set(issueKey(issue), issue);
    if (references.size >= 20) break;
  }
  return [...references.values()];
}

export function withClosingIssues(body: string, issues: IssueReference[]): string {
  // Keep user prose intact. Always include an explicit closing directive for selected issues.
  const directives = [...new Map(issues.map(issue => [issueKey(issue), issue])).values()]
    .map(issue => `Closes ${issue.owner}/${issue.repo}#${issue.number}`)
    .filter(line => !prose(body).split('\n').some(existing => existing.trim().toLowerCase() === line.toLowerCase()));
  return [body.trim(), ...directives].filter(Boolean).join('\n\n');
}

export function referencedPullRequests(events: IssueTimelineEvent[]) {
  const found = new Map<string, NonNullable<NonNullable<IssueTimelineEvent['source']>['issue']>>();
  for (const event of events) {
    const pr = event.source?.issue;
    if (event.event !== 'cross-referenced' || !pr?.pull_request) continue;
    // Never open an arbitrary URL returned by an untrusted payload.
    if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+$/.test(pr.html_url)) continue;
    found.set(pr.html_url, pr);
  }
  return [...found.values()];
}
