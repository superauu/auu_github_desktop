/**
 * 修复工作流纯函数（PRD §8.1/§8.2，M4）：分支名模板、中性引用标记、PR 引用块。
 * 中性 trailer 而非 `Fixes`：Git 平台的自动关闭关键字对错误平台短 ID 无意义（§8.2），
 * Git 工作流状态与错误平台状态保持解耦。
 */
import type { UnifiedErrorIssue } from './types';

export const BRANCH_NAME_TEMPLATE = 'fix/{provider}-{shortId}-{titleSlug}';

/** 标题 → 分支安全 slug：非字母数字折叠为 '-'，去首尾，限长 48。 */
export function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '');
}

export interface BranchNameParts {
  providerId: string;
  /** 平台短 ID（如 FRONTEND-ABC）；缺失时回落 issueId 尾段保证可辨识。 */
  shortId?: string;
  issueId: string;
  title: string;
}

export function buildBranchName(template: string = BRANCH_NAME_TEMPLATE, parts: BranchNameParts): string {
  const shortId = parts.shortId || parts.issueId.split('/').pop() || parts.issueId;
  const name = template
    .replace('{provider}', parts.providerId)
    .replace('{shortId}', shortId)
    .replace('{titleSlug}', slugifyTitle(parts.title));
  // 分支名安全化：白名单字符，折叠分隔符（模板变量替换后仍可能混入非法字符）
  return name.replace(/[^a-zA-Z0-9/._-]+/g, '-').replace(/-{2,}/g, '-').replace(/^-+|\.lock$/g, '');
}

/** 中性提交 trailer（§8.2）：`Error-Tracking: sentry/FRONTEND-ABC`。 */
export function buildCommitTrailer(providerId: string, shortId: string): string {
  return `Error-Tracking: ${providerId}/${shortId}`;
}

export function trailerForIssue(issue: Pick<UnifiedErrorIssue, 'providerId' | 'shortId' | 'issueId'>): string {
  const shortId = issue.shortId || issue.issueId.split('/').pop() || issue.issueId;
  return buildCommitTrailer(issue.providerId, shortId);
}

export interface PrReferenceParts {
  providerName: string;
  shortId: string;
  externalUrl: string;
}

/** PR 描述引用块（§8.2 模板）：中性陈述 + 修复摘要清单，不含自动关闭语义。 */
export function buildPrReferenceBlock(parts: PrReferenceParts): string {
  return [
    `Related production error: ${parts.providerName} ${parts.shortId} (${parts.externalUrl})`,
    '',
    'Fix summary:',
    '- [ ] Describe the fix',
    '- [ ] Verify against the linked error',
  ].join('\n');
}

/** PR 描述附加引用块（已存在则原样返回，幂等）。 */
export function appendPrReferenceBlock(body: string, parts: PrReferenceParts): string {
  const marker = `Related production error: ${parts.providerName} ${parts.shortId} `;
  if (body.includes(marker)) return body;
  const block = buildPrReferenceBlock(parts);
  return body.trim() ? `${body.trimEnd()}\n\n${block}` : block;
}

/** 消息追加 trailer（幂等：已含同一行则原样返回）。 */
export function appendCommitTrailer(message: string, trailer: string): string {
  if (message.split('\n').some((line) => line.trim() === trailer)) return message;
  return `${message.trimEnd()}\n\n${trailer}`;
}

/** 链接分支的新鲜度（§5.3 stale 规则）：本地分支清单里找不到即 stale，绝不指向其他分支。 */
export function splitBranchFreshness(
  branchNames: readonly string[],
  localBranches: readonly string[],
): { active: string[]; stale: string[] } {
  const known = new Set(localBranches);
  const active: string[] = [];
  const stale: string[] = [];
  for (const name of branchNames) (known.has(name) ? active : stale).push(name);
  return { active, stale };
}
