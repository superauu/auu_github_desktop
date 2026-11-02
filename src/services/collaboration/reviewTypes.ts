/** PR 评审事件枚举（create review 的 event 字段） */
export type ReviewEvent = 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';

/** createPullRequestReview 的单条行内评论输入；对 diff 可见行评论（v1 不支持跨行区间） */
export interface ReviewCommentInput {
  path: string;
  /** 评论锚定的行号（RIGHT=新文件行号，LEFT=旧文件行号），由调用方传入 */
  line?: number;
  side?: 'LEFT' | 'RIGHT';
  body: string;
}

export interface CreateReviewParams {
  event: ReviewEvent;
  body?: string;
  comments?: ReviewCommentInput[];
}

/** GET /pulls/{n}/files 的单个文件（patch 为 unified diff 文本，二进制/超大文件为 undefined） */
export interface CollaborationPullRequestFile {
  sha: string;
  filename: string;
  previous_filename?: string;
  status: 'added' | 'removed' | 'modified' | 'renamed' | 'changed' | 'copied' | 'unchanged';
  additions: number;
  deletions: number;
  changes: number;
  blob_url?: string;
  raw_url?: string;
  patch?: string;
}

export interface CollaborationPullRequestFilesResult {
  files: CollaborationPullRequestFile[];
  /** 文件数超过软上限（>300）时为 true，UI 据此显示截断提示 */
  truncated: boolean;
}

/** 评审时间线条目（含 body 的完整 review；PENDING 无 submitted_at） */
export interface CollaborationPullRequestReview {
  id: number;
  user: { login: string; avatar_url?: string };
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED' | 'PENDING';
  body: string;
  submitted_at: string | null;
  commit_id?: string | null;
  html_url?: string;
}

/** 行内评审评论（GET /pulls/{n}/comments）；LEFT 侧评论 line 为 null，行号在 original_line */
export interface CollaborationReviewComment {
  id: number;
  path: string;
  side?: 'LEFT' | 'RIGHT';
  line?: number | null;
  original_line?: number | null;
  in_reply_to_id?: number | null;
  body: string;
  user: { login: string; avatar_url?: string };
  diff_hunk?: string;
  created_at: string;
  updated_at: string;
  html_url?: string;
}

/** PR 对话区评论（GET issues/{n}/comments） */
export interface CollaborationIssueComment {
  id: number;
  user: { login: string; avatar_url?: string };
  body: string;
  created_at: string;
  updated_at: string;
  html_url?: string;
}

/** 文件列表的展示软上限：超过即标记截断（UI 只渲染前 300 个文件） */
export const PR_FILES_SOFT_LIMIT = 300;

