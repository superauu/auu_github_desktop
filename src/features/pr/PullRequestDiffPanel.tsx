import React, { useEffect, useMemo, useState } from 'react';
import { MessageSquare, X, FileDiff, ChevronDown, ChevronRight } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { GitHubPullRequestFile, GitHubReviewComment } from '@/services/github/GitHubService';
import { parsePatch, type PatchLine } from './prReviewLogic';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';

/** 待提交的行内评论草稿（提交评审时随 createPullRequestReview 一起发送） */
export interface PendingCommentDraft {
  id: string;
  path: string;
  side: 'LEFT' | 'RIGHT';
  line: number;
  body: string;
}

interface PullRequestDiffPanelProps {
  file: GitHubPullRequestFile;
  /** 该文件已提交的行内评论（父组件从全量 comments 里按 path 过滤） */
  comments: GitHubReviewComment[];
  /** 该文件待提交的草稿 */
  drafts: PendingCommentDraft[];
  /** false = merged/closed/无权限，隐藏评论按钮，只读展示 */
  canComment: boolean;
  onAddDraft: (draft: Omit<PendingCommentDraft, 'id'>) => void;
  onRemoveDraft: (id: string) => void;
}

/** 单文件 patch 行数超过该值时折叠各 hunk（避免一次渲染数千行 DOM） */
const HUNK_COLLAPSE_THRESHOLD = 500;

export const anchorKey = (side: 'LEFT' | 'RIGHT', line: number) => `${side}:${line}`;

/** 已提交评论的锚点：LEFT 侧 line 为 null，旧文件行号在 original_line */
export const commentAnchor = (comment: GitHubReviewComment): { side: 'LEFT' | 'RIGHT'; line: number | null } => {
  const side = comment.side === 'LEFT' ? 'LEFT' : 'RIGHT';
  const line = side === 'LEFT'
    ? (comment.original_line ?? comment.line ?? null)
    : (comment.line ?? comment.original_line ?? null);
  return { side, line };
};

interface Segment { header: PatchLine; body: PatchLine[] }

/** 把解析结果按 hunk 分段（首个 hunk 之前的 meta 文件头归入 intro） */
function segmentPatch(lines: PatchLine[]): { intro: PatchLine[]; segments: Segment[] } {
  const intro: PatchLine[] = [];
  const segments: Segment[] = [];
  let current: Segment | null = null;
  for (const line of lines) {
    if (line.type === 'hunk') {
      current = { header: line, body: [] };
      segments.push(current);
    } else if (current) {
      current.body.push(line);
    } else {
      intro.push(line);
    }
  }
  return { intro, segments };
}

interface DraftTarget { anchor: string; side: 'LEFT' | 'RIGHT'; line: number }

/**
 * 单文件 unified diff 渲染：add/del/context/hunk 着色行 + 行内评论锚点
 * （已提交评论气泡、待提交草稿气泡、行级"评论"按钮与内联输入框）。
 * patch 行数 >500 时按 hunk 折叠。
 */
export const PullRequestDiffPanel: React.FC<PullRequestDiffPanelProps> = ({
  file,
  comments,
  drafts,
  canComment,
  onAddDraft,
  onRemoveDraft,
}) => {
  const { t } = useI18n();
  const [draftTarget, setDraftTarget] = useState<DraftTarget | null>(null);
  const [draftText, setDraftText] = useState('');
  const [expandedHunks, setExpandedHunks] = useState<ReadonlySet<number>>(new Set());

  const lines = useMemo(() => parsePatch(file.patch || ''), [file.patch]);
  const { intro, segments } = useMemo(() => segmentPatch(lines), [lines]);
  const collapsible = lines.length > HUNK_COLLAPSE_THRESHOLD;

  // 切换文件时重置内联输入与折叠状态
  useEffect(() => {
    setDraftTarget(null); setDraftText(''); setExpandedHunks(new Set());
  }, [file.sha, file.filename]);

  const draftsByAnchor = useMemo(() => {
    const map = new Map<string, PendingCommentDraft[]>();
    for (const draft of drafts) {
      const key = anchorKey(draft.side, draft.line);
      map.set(key, [...(map.get(key) || []), draft]);
    }
    return map;
  }, [drafts]);

  const commentsByAnchor = useMemo(() => {
    const map = new Map<string, GitHubReviewComment[]>();
    for (const comment of comments) {
      const anchor = commentAnchor(comment);
      if (anchor.line == null) continue;
      const key = anchorKey(anchor.side, anchor.line);
      map.set(key, [...(map.get(key) || []), comment]);
    }
    return map;
  }, [comments]);

  if (!file.patch) {
    return (
      <div className="rounded-lg border border-border/60 bg-background/40 p-4 flex items-center gap-2 text-xs text-muted-foreground">
        <FileDiff className="h-3.5 w-3.5 shrink-0" />
        <span className="font-mono break-all">{file.filename}</span>
        <span>· {t('prReview.binaryFile')}</span>
      </div>
    );
  }

  const startDraft = (anchor: string, side: 'LEFT' | 'RIGHT', line: number) => {
    setDraftTarget({ anchor, side, line });
    setDraftText('');
  };

  const submitDraft = () => {
    if (!draftTarget || !draftText.trim()) return;
    onAddDraft({ path: file.filename, side: draftTarget.side, line: draftTarget.line, body: draftText.trim() });
    setDraftTarget(null);
    setDraftText('');
  };

  /** 渲染某锚点下挂的已提交评论气泡、待提交草稿气泡与内联输入框 */
  const renderAnchors = (key: string): React.ReactNode => {
    const nodes: React.ReactNode[] = [];
    const anchoredComments = commentsByAnchor.get(key);
    anchoredComments?.forEach(comment => {
      nodes.push(
        <div key={`c-${comment.id}`} data-pr-review-comment={comment.id}
          className="mx-9 my-1 rounded-lg border border-border/70 bg-muted/40 px-2.5 py-1.5 text-xs space-y-0.5">
          <div className="flex items-center gap-1.5">
            <MessageSquare className="h-3 w-3 text-primary shrink-0" />
            <span className="font-semibold text-foreground">{comment.user?.login}</span>
            <span className="text-[10px] font-mono text-muted-foreground">{key.replace(':', ' · ')}</span>
          </div>
          <div className="whitespace-pre-wrap text-foreground/90 leading-relaxed">{comment.body}</div>
        </div>
      );
    });
    draftsByAnchor.get(key)?.forEach(draft => {
      nodes.push(
        <div key={`d-${draft.id}`} data-pr-review-draft={draft.id}
          className="mx-9 my-1 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 font-medium text-amber-600 dark:text-amber-300">
              <MessageSquare className="h-3 w-3 shrink-0" />
              {t('prReview.badgePending')}
            </span>
            <button
              type="button"
              aria-label={t('prReview.draftRemove')}
              title={t('prReview.draftRemove')}
              onClick={() => onRemoveDraft(draft.id)}
              className="text-muted-foreground hover:text-destructive"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          <div className="whitespace-pre-wrap text-foreground/90 leading-relaxed">{draft.body}</div>
        </div>
      );
    });
    if (draftTarget?.anchor === key) {
      nodes.push(
        <div key="draft-input" data-pr-review-draft-input="true" className="mx-9 my-1.5 rounded-lg border border-primary/40 bg-background/70 p-2 space-y-1.5">
          <textarea
            autoFocus
            value={draftText}
            onChange={e => setDraftText(e.target.value)}
            placeholder={t('prReview.commentPlaceholder')}
            aria-label={t('prReview.commentPlaceholder')}
            rows={2}
            className="w-full resize-none rounded-md border border-input bg-background/80 p-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <div className="flex items-center justify-end gap-1.5">
            <Button type="button" variant="ghost" size="xs" className="h-6 text-[11px]" onClick={() => { setDraftTarget(null); setDraftText(''); }}>
              {t('common.cancel')}
            </Button>
              <Button type="button" variant="outline" size="xs" className="h-6 text-[11px] gap-1" disabled={!draftText.trim()} onClick={submitDraft} data-pr-add-draft="true">
                <MessageSquare className="h-2.5 w-2.5" />
                <span>{t('prReview.commentSubmit')}</span>
              </Button>
          </div>
        </div>
      );
    }
    return nodes;
  };

  const renderRow = (line: PatchLine, key: string): React.ReactNode => {
    if (line.type === 'hunk') {
      return (
        <div key={key} className="diff-line-header px-4 py-1 font-semibold select-none font-mono text-[12px]">
          <span className="truncate">{line.text}</span>
        </div>
      );
    }
    if (line.type === 'meta') {
      return (
        <div key={key} className="px-4 py-0.5 font-mono text-[11px] text-muted-foreground/70 select-none truncate">{line.text}</div>
      );
    }
    const isDel = line.type === 'del';
    // v1 语义：add/context 行评论锚定 RIGHT 侧新行号；del 行锚定 LEFT 侧旧行号
    const commentSide: 'LEFT' | 'RIGHT' = isDel ? 'LEFT' : 'RIGHT';
    const commentLine = (isDel ? line.oldLine : line.newLine) as number;
    const anchors: string[] = [];
    if (line.oldLine != null) anchors.push(anchorKey('LEFT', line.oldLine));
    if (line.newLine != null) anchors.push(anchorKey('RIGHT', line.newLine));
    const mainAnchor = anchorKey(commentSide, commentLine);
    return (
      <React.Fragment key={key}>
        <div data-pr-line={mainAnchor}
          className={cn('group/line relative flex text-[12px] font-mono leading-5 select-text',
            line.type === 'add' && 'diff-line-add',
            line.type === 'del' && 'diff-line-del',
            line.type === 'context' && 'text-foreground/90')}>
          <span className="w-10 px-1.5 text-right text-muted-foreground/70 select-none shrink-0 bg-muted/40 border-r border-border/40">
            {line.oldLine ?? ''}
          </span>
          <span className="w-10 px-1.5 text-right text-muted-foreground/70 select-none shrink-0 bg-muted/40 border-r border-border/40">
            {line.newLine ?? ''}
          </span>
          <span className="px-2.5 whitespace-pre flex-1 break-all">{line.text || ' '}</span>
          {canComment && (
            <button
              type="button"
              aria-label={t('prReview.addCommentAria').replace('{line}', String(commentLine))}
              title={t('prReview.addCommentAria').replace('{line}', String(commentLine))}
              onClick={() => startDraft(mainAnchor, commentSide, commentLine)}
              className="absolute right-1 top-0.5 h-4 px-1 rounded bg-card border border-border/70 opacity-0 group-hover/line:opacity-100 focus:opacity-100 transition-opacity text-muted-foreground hover:text-primary"
            >
              <MessageSquare className="h-3 w-3" />
            </button>
          )}
        </div>
        {anchors.map(anchor => <React.Fragment key={`a-${anchor}`}>{renderAnchors(anchor)}</React.Fragment>)}
      </React.Fragment>
    );
  };

  return (
    <div className="rounded-lg border border-border/60 bg-background/40 overflow-hidden" data-pr-diff-file={file.filename}>
      {/* 文件头 */}
      <div className="px-3 py-1.5 bg-muted/30 border-b border-border/60 flex items-center gap-2 text-[11px]">
        <FileDiff className="h-3 w-3 text-primary shrink-0" />
        <span className="font-mono text-foreground break-all">{file.filename}</span>
        <span className="ml-auto shrink-0 font-mono">
          <span className="text-git-added font-semibold">+{file.additions}</span>
          <span className="text-muted-foreground"> / </span>
          <span className="text-git-deleted font-semibold">-{file.deletions}</span>
        </span>
      </div>

      {intro.map((line, index) => renderRow(line, `intro-${index}`))}

      {collapsible && (
        <div className="px-3 py-1 text-[11px] text-muted-foreground bg-muted/20 border-b border-border/40">
          {t('prReview.hunksCollapsed')}
        </div>
      )}

      {segments.map((segment, segmentIndex) => {
        const expanded = !collapsible || expandedHunks.has(segmentIndex);
        return (
          <div key={`hunk-${segmentIndex}`}>
            <div className="diff-line-header px-4 py-1 font-semibold select-none font-mono text-[12px] flex items-center justify-between gap-2">
              <span className="truncate">{segment.header.text}</span>
              {collapsible && (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="h-5 px-1 text-[10px] gap-0.5 shrink-0"
                  aria-expanded={expanded}
                  onClick={() => setExpandedHunks(prev => {
                    const next = new Set(prev);
                    if (next.has(segmentIndex)) next.delete(segmentIndex); else next.add(segmentIndex);
                    return next;
                  })}
                >
                  {expanded ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />}
                  <span>{expanded ? t('prReview.collapseHunk') : t('prReview.expandHunk')}</span>
                </Button>
              )}
            </div>
            {expanded && segment.body.map((line, index) => renderRow(line, `${segmentIndex}-${index}`))}
          </div>
        );
      })}
    </div>
  );
};
