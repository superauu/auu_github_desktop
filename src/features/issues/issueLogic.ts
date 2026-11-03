import { externalIssueUrl, scopeIssueReference, isCurrentPlatformUrl, currentPlatformPath } from '@/services/integrations/links';
import { getTaskPlugin } from '@/services/integrations/plugins';
import type { IssueReference, IssueTimelineEvent } from '@/services/collaboration/issueTypes';

export const issueKey = (reference: IssueReference) => { const issue = scopeIssueReference(reference); return `${issue.providerId && issue.server ? `${issue.providerId}:${issue.server}:` : ''}${issue.owner}/${issue.repo}#${issue.number}`; };
export const issueUrl = externalIssueUrl;
/** 提交/PR 文案里的引用键：任务引用优先 identifier（ENG-123），托管保持 owner/repo#n。 */
export const issueLabel = (issue: IssueReference) => issue.providerId && getTaskPlugin(issue.providerId) && issue.identifier ? issue.identifier : `${issue.owner}/${issue.repo}#${issue.number}`;
export const issueBranchName = (key: number | string, title: string) => `issue/${key}-${title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 55).replace(/-$/, '') || 'task'}`;
const prose = (body: string) => body.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`|<!--[\s\S]*?-->/g, '');

/** Only references outside code blocks count as links; numbers and repository names are validated. */
export function issueReferences(body: string | null, owner: string, repo: string): IssueReference[] {
  const text = prose(body || '');
  const references = new Map<string, IssueReference>();
  const pattern = /https?:\/\/[^\s<>"')]+|(?<![\w/])(?:([\w.-]+(?:\/[\w.-]+)+))?#(\d+)\b/g;
  for (const match of text.matchAll(pattern)) {
    let targetOwner = owner, targetRepo = repo, number = Number(match[2]);
    if (/^https?:/.test(match[0])) {
      if (!isCurrentPlatformUrl(match[0])) continue;
      const parts = currentPlatformPath(match[0])?.match(/^\/(.+?)\/(?:-\/)?issues\/(\d+)$/);
      if (!parts) continue;
      const segments = parts[1].split('/'); targetRepo = segments.pop()!; targetOwner = segments.join('/'); number = Number(parts[2]);
    } else if (match[1]) { const segments = match[1].split('/'); targetRepo = segments.pop()!; targetOwner = segments.join('/'); }
    const issue = scopeIssueReference({ owner: targetOwner, repo: targetRepo, number });
    if (Number.isSafeInteger(issue.number) && issue.number > 0) references.set(issueKey(issue), issue);
    if (references.size >= 20) break;
  }
  return [...references.values()];
}

export function withClosingIssues(body: string, issues: IssueReference[]): string {
  // Keep user prose intact. Always include an explicit closing directive for selected issues.
  // 托管引用用 Closes 指令（平台会在合并时关闭）；任务引用（Linear 等）没有该语义，
  // 退化为纯引用（identifier 键），由平台的 Git 集成按分支/标题自行关联。
  const directives = [...new Map(issues.map(issue => [issueKey(issue), issue])).values()]
    .map(issue => issue.providerId && getTaskPlugin(issue.providerId)
      ? `Refs ${issueLabel(issue)}`
      : `Closes ${issue.owner}/${issue.repo}#${issue.number}`)
    .filter(line => !prose(body).split('\n').some(existing => existing.trim().toLowerCase() === line.toLowerCase()));
  return [body.trim(), ...directives].filter(Boolean).join('\n\n');
}

export function referencedPullRequests(events: IssueTimelineEvent[]) {
  const found = new Map<string, NonNullable<NonNullable<IssueTimelineEvent['source']>['issue']>>();
  for (const event of events) {
    const pr = event.source?.issue;
    if (event.event !== 'cross-referenced' || !pr?.pull_request) continue;
    // Never open an arbitrary URL returned by an untrusted payload.
    if (!isCurrentPlatformUrl(pr.html_url) || !/\/(?:pull|pulls|merge_requests)\/\d+$/.test(new URL(pr.html_url).pathname)) continue;
    found.set(pr.html_url, pr);
  }
  return [...found.values()];
}
