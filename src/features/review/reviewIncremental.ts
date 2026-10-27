import type { ParsedDiffLine } from '@/services/git/PorcelainParser';
import type { ReviewProgress } from '@/stores/reviewProgressStore';
import { commentStatus, isFileApproved, parseHunks, type ReviewFileEvidence, type ReviewHunkEvidence } from './reviewLogic';

/** 不把行号放进指纹,保留原始字节(CRLF/缺少末尾换行也必须区分)。 */
export async function captureReviewEvidence(lines: ParsedDiffLine[], version: string): Promise<ReviewFileEvidence> {
  const hunks = parseHunks(lines);
  return { version, hunks: await Promise.all(hunks.map(async (hunk, index) => {
    const body = lines.slice(hunk.index + 1, hunks[index + 1]?.index ?? lines.length);
    const bytes = new TextEncoder().encode(JSON.stringify(body.map((line) => [line.type, line.patchContent ?? line.content])));
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return {
      startLine: hunk.newStart,
      endLine: hunk.newStart + Math.max(1, hunk.count) - 1,
      fingerprint: Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(''),
      context: [lines[hunk.index].content, ...body.map((line) => line.patchContent ?? line.content)].join('\n').slice(0, 8000),
    };
  })) };
}

/** 重复代码块不能只靠内容猜位置;两侧都必须恰好匹配一次。 */
function uniqueMatch(oldHunk: ReviewHunkEvidence, previous: ReviewHunkEvidence[], next: ReviewHunkEvidence[]) {
  if (previous.filter((hunk) => hunk.fingerprint === oldHunk.fingerprint).length !== 1) return undefined;
  const matches = next.filter((hunk) => hunk.fingerprint === oldHunk.fingerprint);
  return matches.length === 1 ? matches[0] : undefined;
}

export function carryReviewProgress(previous: ReviewProgress, versions: Record<string, string>, previousHead: string): ReviewProgress {
  const next: ReviewProgress = { approval: { approvedFiles: [], approvedHunks: {} }, comments: [], evidence: {}, pending: {} };
  for (const path of new Set([...Object.keys(previous.evidence ?? {}), ...Object.keys(previous.pending ?? {})])) {
    const pending = previous.pending?.[path];
    const evidence = pending?.evidence ?? previous.evidence![path];
    const approvedHunks = pending?.approvedHunks ?? previous.approval.approvedHunks[path] ?? [];
    const fileApproved = pending?.fileApproved ?? isFileApproved(previous.approval, path);
    if (evidence.version && evidence.version === versions[path]) {
      next.evidence![path] = evidence;
      if (fileApproved) next.approval.approvedFiles.push(path);
      if (approvedHunks.length) next.approval.approvedHunks[path] = approvedHunks;
    } else if (versions[path]) {
      // 变化文件先清空有效通过状态,待读取新 diff 后逐块校验。
      next.pending![path] = pending ?? { evidence, approvedHunks, fileApproved };
    }
  }
  next.comments = previous.comments.map((comment) => {
    const evidence = previous.evidence?.[comment.path] ?? previous.pending?.[comment.path]?.evidence;
    const same = Boolean(evidence?.version && evidence.version === versions[comment.path]);
    const hunk = evidence?.hunks.find((item) => item.startLine === comment.startLine);
    return {
      ...comment,
      origin: comment.origin ?? {
        headHash: previousHead, startLine: comment.startLine, endLine: comment.endLine,
        context: hunk?.context ?? '', fingerprint: hunk?.fingerprint,
      },
      anchorStale: same ? comment.anchorStale : comment.startLine !== null || !versions[comment.path],
      status: same ? commentStatus(comment) : versions[comment.path] && (evidence || comment.startLine === null) ? 'needsReview' : 'outdated',
    };
  });
  return next;
}

export function reconcileReviewFile(progress: ReviewProgress, path: string, evidence: ReviewFileEvidence): ReviewProgress {
  const pending = progress.pending?.[path];
  const previous = pending?.evidence;
  const approvedHunks = [...(progress.approval.approvedHunks[path] ?? [])];
  if (pending && previous) {
    for (const oldHunk of previous.hunks) {
      const match = uniqueMatch(oldHunk, previous.hunks, evidence.hunks);
      if (match && (pending.fileApproved || pending.approvedHunks.includes(oldHunk.startLine))) approvedHunks.push(match.startLine);
    }
  }
  const remaining = { ...progress.pending };
  delete remaining[path];
  const comments = progress.comments.map((comment) => {
    if (comment.path !== path || !pending) return comment;
    if (comment.startLine === null) return comment;
    const oldHunk = previous?.hunks.find((hunk) => hunk.fingerprint === comment.origin?.fingerprint);
    const match = oldHunk && uniqueMatch(oldHunk, previous!.hunks, evidence.hunks);
    return match ? { ...comment, startLine: match.startLine, endLine: match.endLine, anchorStale: false }
      : { ...comment, status: commentStatus(comment) === 'resolved' ? 'resolved' as const : 'outdated' as const, anchorStale: true };
  });
  return {
    ...progress, comments, pending: remaining,
    evidence: { ...progress.evidence, [path]: evidence },
    approval: { ...progress.approval, approvedHunks: { ...progress.approval.approvedHunks, [path]: [...new Set(approvedHunks)] } },
  };
}
