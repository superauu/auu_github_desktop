/**
 * PR Review 流的纯函数层（无 React / 无网络依赖，便于单测）：
 * - parsePatch：GitHub files API 返回的 unified diff patch 文本 → 行分类（add/del/context/hunk 头/文件头元数据）
 * - mergeTimeline：issue comments + reviews 按时间合并为对话时间线
 * - validateReviewSubmission：提交评审的前端校验（返回 i18n 键，null 表示通过）
 * - resolveReviewCapability：评审区可见性降级（merged/closed/401·403）
 * - isAuthDeniedError：识别 401/403 类错误
 */
import type {
  GitHubIssueComment,
  GitHubPullRequestReview,
  ReviewEvent,
} from '@/services/github/GitHubService';

/** 评审事件的合法枚举（与 GitHubService.REVIEW_EVENTS 保持一致，独立维护避免运行时循环依赖） */
const REVIEW_EVENTS: readonly ReviewEvent[] = ['APPROVE', 'REQUEST_CHANGES', 'COMMENT'];

/** unified diff 单行的分类与双侧行号 */
export interface PatchLine {
  /** add=新增行（RIGHT 侧）、del=删除行（LEFT 侧）、context=上下文、hunk=hunk 头、meta=文件头/No newline 标记等 */
  type: 'add' | 'del' | 'context' | 'hunk' | 'meta';
  /** 行内容：add/del/context 已去掉前导符号；hunk/meta 为原文 */
  text: string;
  /** LEFT 侧（旧文件）行号，仅 del/context/hunk 有值 */
  oldLine: number | null;
  /** RIGHT 侧（新文件）行号，仅 add/context/hunk 有值 */
  newLine: number | null;
}

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/**
 * 解析 unified diff patch 文本。
 * - 第一个 @@ 之前的行（---/+++/diff --git/index 等）与 `\ No newline at end of file` 归为 meta；
 * - add/del/context 按各 hunk 头声明的起始行号连续编号；
 * - 空行按 context 处理（统一 diff 中空上下文行渲染为单个空格，剥离后为空串）。
 */
export function parsePatch(patch: string): PatchLine[] {
  if (!patch) return [];
  const out: PatchLine[] = [];
  let oldLine = 0;
  let newLine = 0;
  let inHunks = false;
  for (const raw of patch.split('\n')) {
    if (raw.startsWith('@@')) {
      const match = HUNK_HEADER.exec(raw);
      if (match) {
        oldLine = parseInt(match[1], 10);
        newLine = parseInt(match[3], 10);
        inHunks = true;
        out.push({ type: 'hunk', text: raw, oldLine: oldLine || null, newLine: newLine || null });
      } else {
        out.push({ type: 'meta', text: raw, oldLine: null, newLine: null });
      }
      continue;
    }
    if (!inHunks) {
      // 文件头：--- a/...、+++ b/...、diff --git、index、new file mode、Binary files 等
      out.push({ type: 'meta', text: raw, oldLine: null, newLine: null });
      continue;
    }
    if (raw.startsWith('+')) {
      out.push({ type: 'add', text: raw.slice(1), oldLine: null, newLine: newLine++ });
    } else if (raw.startsWith('-')) {
      out.push({ type: 'del', text: raw.slice(1), oldLine: oldLine++, newLine: null });
    } else if (raw.startsWith('\\')) {
      // "\ No newline at end of file" 标记，不占行号
      out.push({ type: 'meta', text: raw, oldLine: null, newLine: null });
    } else {
      // context（含空行的退化形式）
      out.push({ type: 'context', text: raw.startsWith(' ') ? raw.slice(1) : raw, oldLine: oldLine++, newLine: newLine++ });
    }
  }
  return out;
}

/** 对话时间线条目：issue comment 或 review */
export interface TimelineEntry {
  kind: 'issue-comment' | 'review';
  id: number;
  user: string;
  avatarUrl?: string;
  body: string;
  /** 仅 review 有；PENDING 评审会被过滤 */
  state?: GitHubPullRequestReview['state'];
  /** ISO 时间字符串（缺省为空串，如无 submitted_at 的异常数据） */
  at: string;
  /** 排序用毫秒时间戳，无效时间按 0 处理并以 id 兜底 */
  timestamp: number;
}

/** issue comments + reviews 合并为按时间升序的时间线（过滤 PENDING 评审；时间相同按 id 升序） */
export function mergeTimeline(
  issueComments: GitHubIssueComment[],
  reviews: GitHubPullRequestReview[]
): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  for (const comment of issueComments) {
    const at = comment.created_at || '';
    entries.push({
      kind: 'issue-comment',
      id: comment.id,
      user: comment.user?.login || 'ghost',
      avatarUrl: comment.user?.avatar_url,
      body: comment.body || '',
      at,
      timestamp: Date.parse(at) || 0,
    });
  }
  for (const review of reviews) {
    if (review.state === 'PENDING') continue;
    const at = review.submitted_at || '';
    entries.push({
      kind: 'review',
      id: review.id,
      user: review.user?.login || 'ghost',
      avatarUrl: review.user?.avatar_url,
      body: review.body || '',
      state: review.state,
      at,
      timestamp: Date.parse(at) || 0,
    });
  }
  return entries.sort((a, b) => a.timestamp - b.timestamp || a.id - b.id);
}

/**
 * 提交评审前端校验：通过返回 null，否则返回错误 i18n 键（调用方 t() 后展示）。
 * - REQUEST_CHANGES 必须填写总评 body（GitHub 端同样拒绝，但这里先拦截避免无效请求）；
 * - 行内评论草稿不允许空 body。
 */
export function validateReviewSubmission(
  event: ReviewEvent,
  body: string,
  comments: ReadonlyArray<{ body: string }>
): string | null {
  if (!REVIEW_EVENTS.includes(event)) return 'prReview.invalidEvent';
  if (event === 'REQUEST_CHANGES' && !body.trim()) return 'prReview.changesNeedBody';
  if (comments.some(comment => !comment.body.trim())) return 'prReview.commentEmpty';
  return null;
}

export type ReviewBlockReason = 'readonlyMerged' | 'readonlyClosed' | 'noPermission' | null;

/** 评审提交区可见性：merged/closed 只读，401/403 无权限降级，其余可提交 */
export function resolveReviewCapability(
  pr: { state: 'open' | 'closed'; merged_at: string | null },
  forbidden: boolean
): { canReview: boolean; reason: ReviewBlockReason } {
  if (forbidden) return { canReview: false, reason: 'noPermission' };
  if (pr.merged_at) return { canReview: false, reason: 'readonlyMerged' };
  if (pr.state === 'closed') return { canReview: false, reason: 'readonlyClosed' };
  return { canReview: true, reason: null };
}

/** 401/403（凭据无效 / 无权限 / 只读 token）识别：优先取 GitHubApiError.status，消息文本兜底 */
export function isAuthDeniedError(err: unknown): boolean {
  const status = (err as { status?: number } | null)?.status;
  if (status === 401 || status === 403) return true;
  const message = (err as { message?: string } | null)?.message || '';
  return /http (401|403)|bad credentials|forbidden|not authorized|resource not accessible/i.test(message);
}
