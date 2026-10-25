import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import {
  X,
  Loader2,
  MessageSquare,
  CheckCircle2,
  AlertCircle,
  GitPullRequest,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  GitBranch,
  GitMerge,
  XCircle,
  Clock,
} from 'lucide-react';
import { ModalSurface } from '@/components/ui/ModalSurface';
import { useI18n } from '@/i18n';
import {
  githubService,
  PR_FILES_SOFT_LIMIT,
  type GitHubIssueComment,
  type GitHubPullRequestFile,
  type GitHubPullRequestReview,
  type GitHubReviewComment,
  type ReviewEvent,
} from '@/services/github/GitHubService';
import type { GitHubPullRequest } from '@/services/github/types';
import {
  mergeTimeline,
  resolveReviewCapability,
  validateReviewSubmission,
  isAuthDeniedError,
} from './prReviewLogic';
import { PullRequestDiffPanel, type PendingCommentDraft } from './PullRequestDiffPanel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/stores/toastStore';
import { cn } from '@/utils/cn';

interface PullRequestDetailModalProps {
  pr: GitHubPullRequest;
  owner: string;
  repo: string;
  onClose: () => void;
}

const REVIEW_EVENTS: ReadonlyArray<{ event: ReviewEvent; labelKey: string; activeClass: string }> = [
  { event: 'APPROVE', labelKey: 'prReview.eventApprove', activeClass: 'border-emerald-500/60 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300' },
  { event: 'REQUEST_CHANGES', labelKey: 'prReview.eventRequestChanges', activeClass: 'border-rose-500/60 bg-rose-500/15 text-rose-600 dark:text-rose-300' },
  { event: 'COMMENT', labelKey: 'prReview.eventComment', activeClass: 'border-primary/60 bg-primary/15 text-primary' },
];

/**
 * PR 评审详情弹窗：状态自足（数据经 GitHubService 按 owner/repo/number 直取）。
 * - Conversation：issue comments + reviews 按时间合并的时间线；
 * - Files：文件列表 + 单文件 patch 渲染 + 行内评论锚点与草稿；
 * - 提交评审：Approve / Request changes / Comment + 总评 + 待提交行内评论；
 *   merged/closed 只读，401/403 隐藏提交区并给出可读提示。
 */
export const PullRequestDetailModal: React.FC<PullRequestDetailModalProps> = ({ pr, owner, repo, onClose }) => {
  const { t } = useI18n();

  const [tab, setTab] = useState('conversation');
  const [files, setFiles] = useState<GitHubPullRequestFile[] | null>(null);
  const [filesTruncated, setFilesTruncated] = useState(false);
  const [filesError, setFilesError] = useState('');
  const [reviews, setReviews] = useState<GitHubPullRequestReview[]>([]);
  const [reviewComments, setReviewComments] = useState<GitHubReviewComment[]>([]);
  const [issueComments, setIssueComments] = useState<GitHubIssueComment[]>([]);
  const [timelineError, setTimelineError] = useState('');
  const [timelineLoading, setTimelineLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);

  const [pending, setPending] = useState<PendingCommentDraft[]>([]);
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const [reviewEvent, setReviewEvent] = useState<ReviewEvent>('COMMENT');
  const [reviewBody, setReviewBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // 请求票据：弹窗目标（owner/repo/number）变化或手动刷新后，旧响应一律丢弃
  const sessionRef = useRef(0);
  useEffect(() => {
    const session = ++sessionRef.current;
    setFiles(null); setFilesTruncated(false); setFilesError('');
    setReviews([]); setReviewComments([]); setIssueComments([]);
    setTimelineError(''); setTimelineLoading(true); setForbidden(false);
    setPending([]); setExpandedFile(null); setReviewEvent('COMMENT');
    setReviewBody(''); setSubmitError(''); setSubmitting(false); setTab('conversation');
    if (!owner || !repo || !pr?.number) return;
    void githubService.getPullRequestFiles(owner, repo, pr.number)
      .then(result => {
        if (session !== sessionRef.current) return;
        setFiles(result.files); setFilesTruncated(result.truncated);
      })
      .catch(err => {
        if (session !== sessionRef.current) return;
        setFilesError(err?.message || t('prReview.filesLoadFailed'));
      });
    void Promise.all([
      githubService.getPullRequestReviews(owner, repo, pr.number),
      githubService.getPullRequestReviewComments(owner, repo, pr.number),
      githubService.getPullRequestIssueComments(owner, repo, pr.number),
    ])
      .then(([nextReviews, nextComments, nextIssues]) => {
        if (session !== sessionRef.current) return;
        setReviews(nextReviews); setReviewComments(nextComments); setIssueComments(nextIssues);
        setTimelineLoading(false);
      })
      .catch(err => {
        if (session !== sessionRef.current) return;
        // 401/403：无权限/只读 token，隐藏提交评审区并显示可读提示
        if (isAuthDeniedError(err)) { setForbidden(true); setTimelineError(''); }
        else setTimelineError(err?.message || t('prReview.loadFailed'));
        setTimelineLoading(false);
      });
    // t 仅用于错误兜底文案，语言切换不需要重新拉取
  }, [owner, repo, pr?.number, reloadTick]);

  const timeline = useMemo(() => mergeTimeline(issueComments, reviews), [issueComments, reviews]);
  const capability = useMemo(
    () => resolveReviewCapability({ state: pr.state, merged_at: pr.merged_at }, forbidden),
    [pr.state, pr.merged_at, forbidden]
  );
  const visibleFiles = useMemo(() => (files ? files.slice(0, PR_FILES_SOFT_LIMIT) : []), [files]);

  const handleAddDraft = (draft: Omit<PendingCommentDraft, 'id'>) => {
    setPending(prev => [...prev, { ...draft, id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }]);
  };
  const handleRemoveDraft = (id: string) => setPending(prev => prev.filter(draft => draft.id !== id));

  const handleSubmitReview = async () => {
    if (submitting || !capability.canReview) return;
    const errorKey = validateReviewSubmission(reviewEvent, reviewBody, pending);
    if (errorKey) { setSubmitError(t(errorKey)); return; } // 前端校验不过：不发请求
    const session = sessionRef.current;
    setSubmitting(true); setSubmitError('');
    try {
      await githubService.createPullRequestReview(owner, repo, pr.number, {
        event: reviewEvent,
        body: reviewBody.trim() || undefined,
        comments: pending.map(({ path, side, line, body }) => ({ path, side, line, body })),
      });
      if (session !== sessionRef.current) return;
      toast.success(t('prReview.submitted'), `${pr.title} #${pr.number}`);
      setPending([]); setReviewBody(''); setReviewEvent('COMMENT');
      const [nextReviews, nextComments] = await Promise.all([
        githubService.getPullRequestReviews(owner, repo, pr.number),
        githubService.getPullRequestReviewComments(owner, repo, pr.number),
      ]);
      if (session !== sessionRef.current) return;
      setReviews(nextReviews); setReviewComments(nextComments);
    } catch (err: any) {
      if (session !== sessionRef.current) return;
      const message: string = err?.message || '';
      if (isAuthDeniedError(err)) {
        setForbidden(true); setSubmitError('');
        toast.error(t('prReview.submitFailed'), message || t('prReview.noPermission'));
      } else {
        setSubmitError(message ? `${t('prReview.submitFailed')}: ${message}` : t('prReview.submitFailed'));
      }
    } finally {
      if (session === sessionRef.current) setSubmitting(false);
    }
  };

  const isMerged = !!pr.merged_at;
  const stateLabel = pr.state === 'open' ? t('pr.stateOpen') : isMerged ? t('pr.stateMerged') : t('pr.stateClosed');
  const readonlyHint = capability.reason === 'noPermission'
    ? t('prReview.noPermission')
    : capability.reason === 'readonlyMerged'
      ? t('prReview.readonlyMerged')
      : t('prReview.readonlyClosed');

  return (
    <ModalSurface onDismiss={onClose} dismissible={!submitting} label={t('prReview.dialogLabel')}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in-0 select-none"
    >
      <div
        className="w-full max-w-4xl h-[88vh] flex flex-col rounded-xl border border-border bg-card shadow-2xl overflow-hidden animate-in zoom-in-95"
        onClick={e => e.stopPropagation()}
        data-pr-review-modal={pr.number}
      >
        {/* 头部：标题/#号/状态/作者/分支对 */}
        <div className="p-4 border-b border-border/80 bg-accent/15 flex items-start justify-between gap-3 shrink-0">
          <div className="space-y-1.5 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <GitPullRequest className={cn('h-4 w-4 shrink-0',
                pr.state === 'open' ? 'text-git-added' : isMerged ? 'text-violet-400' : 'text-git-deleted')} />
              <span className="text-sm font-bold text-foreground">{pr.title}</span>
              <span className="text-xs font-mono text-muted-foreground">#{pr.number}</span>
              <Badge variant={pr.state === 'open' ? 'success' : isMerged ? 'secondary' : 'outline'}
                className={cn('h-4 text-[10px] px-1', isMerged && 'bg-violet-500/15 text-git-branch border-violet-500/30')}>
                {stateLabel}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground flex-wrap">
              <Badge variant="outline" className="h-4 text-[11px] gap-1">
                <GitBranch className="h-2.5 w-2.5 text-git-branch" />
                <span>{pr.head.ref}</span>
              </Badge>
              <span>{t('pr.mergeInto')}</span>
              <Badge variant="outline" className="h-4 text-[11px]">{pr.base.ref}</Badge>
              <span className="text-muted-foreground/60">•</span>
              <span>{t('pr.openedBy').replace('{user}', pr.user.login)}</span>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="xs" onClick={() => window.open(pr.html_url, '_blank')}
              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground" title={t('pr.viewOnWeb')}>
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="xs" onClick={onClose} disabled={submitting}
              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground" aria-label={t('common.close')} title={t('common.close')}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* 只读/降级提示条（merged、closed、401/403） */}
        {!capability.canReview && (
          <div role="status" data-pr-review-readonly="true"
            className="px-4 py-1.5 text-[11px] bg-muted/40 border-b border-border/40 text-muted-foreground flex items-center gap-1.5 shrink-0">
            {capability.reason === 'readonlyMerged'
              ? <GitMerge className="h-3 w-3 text-violet-400 shrink-0" />
              : capability.reason === 'readonlyClosed'
                ? <XCircle className="h-3 w-3 text-git-deleted shrink-0" />
                : <AlertCircle className="h-3 w-3 text-amber-500 shrink-0" />}
            <span>{readonlyHint}</span>
          </div>
        )}

        <Tabs.Root value={tab} onValueChange={setTab} className="flex-1 flex flex-col overflow-hidden">
          <Tabs.List aria-label={t('prReview.dialogLabel')}
            className="px-4 pt-2 border-b border-border/60 flex gap-1 shrink-0">
            {(['conversation', 'files'] as const).map(value => (
              <Tabs.Trigger key={value} value={value} className={cn(
                'px-3 py-1.5 text-xs rounded-t-md border border-b-0 border-transparent transition-colors',
                tab === value
                  ? 'bg-accent text-accent-foreground font-semibold border-border/60'
                  : 'text-muted-foreground hover:text-foreground'
              )}>
                {value === 'conversation' ? t('prReview.tabConversation') : t('prReview.tabFiles')}
              </Tabs.Trigger>
            ))}
          </Tabs.List>

          {/* Conversation：PR 描述 + issue comments / reviews 合并时间线 */}
          <Tabs.Content value="conversation" className="flex-1 overflow-hidden data-[state=inactive]:hidden">
            <ScrollArea className="h-full p-4">
              <div className="max-w-3xl space-y-4">
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-foreground uppercase tracking-wider">{t('pr.body')}</div>
                  <div className="p-3 rounded-lg border border-border/70 bg-background/50 text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap">
                    {pr.body || t('pr.noBody')}
                  </div>
                </div>

                {timelineLoading && (
                  <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {t('common.loading')}
                  </p>
                )}
                {timelineError && (
                  <div role="alert" className="text-xs text-destructive flex items-center gap-2 flex-wrap">
                    <span>{timelineError}</span>
                    <Button type="button" variant="outline" size="xs" className="h-6 text-[11px]" onClick={() => setReloadTick(v => v + 1)}>
                      {t('remote.retry')}
                    </Button>
                  </div>
                )}
                {!timelineLoading && !timelineError && timeline.length === 0 && (
                  <p className="text-xs text-muted-foreground">{t('prReview.timelineEmpty')}</p>
                )}

                <div className="space-y-2" data-pr-review-timeline="true">
                  {timeline.map(entry => {
                    const reviewBadge = entry.state === 'APPROVED'
                      ? { icon: <CheckCircle2 className="h-3 w-3 shrink-0" />, className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/30', label: t('prReview.badgeApproved') }
                      : entry.state === 'CHANGES_REQUESTED'
                        ? { icon: <AlertCircle className="h-3 w-3 shrink-0" />, className: 'bg-rose-500/10 text-rose-600 dark:text-rose-300 border-rose-500/30', label: t('prReview.badgeChangesRequested') }
                        : entry.state === 'DISMISSED'
                          ? { icon: <XCircle className="h-3 w-3 shrink-0" />, className: 'bg-muted text-muted-foreground border-border', label: t('prReview.badgeDismissed') }
                          : { icon: <MessageSquare className="h-3 w-3 shrink-0" />, className: 'bg-sky-500/10 text-sky-600 dark:text-sky-300 border-sky-500/30', label: t('prReview.badgeCommented') };
                    const timeText = entry.at && Number.isFinite(Date.parse(entry.at))
                      ? new Date(entry.at).toLocaleString()
                      : '';
                    return (
                      <div key={`${entry.kind}-${entry.id}`} data-pr-timeline-entry={entry.kind}
                        className="p-3 rounded-lg border border-border/60 bg-card/60 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap text-xs">
                          <span className="font-semibold text-foreground">{entry.user}</span>
                          {entry.kind === 'review' ? (
                            <Badge variant="outline" className={cn('h-4 text-[10px] gap-1', reviewBadge.className)}>
                              {reviewBadge.icon}
                              <span>{reviewBadge.label}</span>
                            </Badge>
                          ) : (
                            <MessageSquare className="h-3 w-3 text-muted-foreground shrink-0" />
                          )}
                          {timeText && (
                            <span className="ml-auto text-[10px] text-muted-foreground/70 flex items-center gap-1">
                              <Clock className="h-2.5 w-2.5" />
                              {timeText}
                            </span>
                          )}
                        </div>
                        {entry.body && (
                          <div className="text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap break-words">{entry.body}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </ScrollArea>
          </Tabs.Content>

          {/* Files：文件列表 + 单文件 patch + 行内评论锚点 */}
          <Tabs.Content value="files" className="flex-1 flex flex-col overflow-hidden data-[state=inactive]:hidden">
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-2" data-pr-review-files="true">
                <div className="text-xs font-semibold text-foreground uppercase tracking-wider">{t('prReview.filesTitle')}</div>
                {files === null && !filesError && (
                  <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {t('prReview.filesLoading')}
                  </p>
                )}
                {filesError && (
                  <div role="alert" className="text-xs text-destructive flex items-center gap-2 flex-wrap">
                    <span>{filesError}</span>
                    <Button type="button" variant="outline" size="xs" className="h-6 text-[11px]" onClick={() => setReloadTick(v => v + 1)}>
                      {t('remote.retry')}
                    </Button>
                  </div>
                )}
                {files !== null && !filesError && files.length === 0 && (
                  <p className="text-xs text-muted-foreground">{t('prReview.filesEmpty')}</p>
                )}
                {filesTruncated && (
                  <p role="status" className="text-[11px] text-amber-600 dark:text-amber-300">
                    {t('prReview.truncatedNotice').replace('{n}', String(PR_FILES_SOFT_LIMIT))}
                  </p>
                )}
                {visibleFiles.map(file => {
                  const expanded = expandedFile === file.filename;
                  const fileComments = reviewComments.filter(comment => comment.path === file.filename).length;
                  const fileDrafts = pending.filter(draft => draft.path === file.filename).length;
                  return (
                    <div key={file.sha + file.filename} className="rounded-lg border border-border/60 bg-card/40 overflow-hidden">
                      <button
                        type="button"
                        aria-expanded={expanded}
                        data-pr-file-row={file.filename}
                        onClick={() => setExpandedFile(expanded ? null : file.filename)}
                        className="w-full px-3 py-1.5 flex items-center gap-2 text-[11px] hover:bg-accent/40 transition-colors text-left"
                      >
                        {expanded
                          ? <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                          : <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />}
                        <span className="font-mono text-foreground break-all flex-1 min-w-0">{file.filename}</span>
                        <Badge variant="outline" className="h-4 text-[10px] px-1 shrink-0 font-normal">{file.status}</Badge>
                        <span className="shrink-0 font-mono">
                          <span className="text-git-added font-semibold">+{file.additions}</span>
                          <span className="text-muted-foreground"> / </span>
                          <span className="text-git-deleted font-semibold">-{file.deletions}</span>
                        </span>
                        {fileComments > 0 && (
                          <Badge variant="outline" className="h-4 text-[10px] px-1 shrink-0 gap-0.5 text-sky-600 dark:text-sky-300 border-sky-500/30">
                            <MessageSquare className="h-2.5 w-2.5" />
                            {t('prReview.fileComments').replace('{n}', String(fileComments))}
                          </Badge>
                        )}
                        {fileDrafts > 0 && (
                          <Badge variant="outline" className="h-4 text-[10px] px-1 shrink-0 border-amber-500/40 text-amber-600 dark:text-amber-300">
                            {t('prReview.badgePending')} · {fileDrafts}
                          </Badge>
                        )}
                      </button>
                      {expanded && (
                        <div className="p-2 border-t border-border/40">
                          <PullRequestDiffPanel
                            file={file}
                            comments={reviewComments.filter(comment => comment.path === file.filename)}
                            drafts={pending.filter(draft => draft.path === file.filename)}
                            canComment={capability.canReview}
                            onAddDraft={handleAddDraft}
                            onRemoveDraft={handleRemoveDraft}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>

            {/* 提交评审区（merged/closed/无权限时不渲染） */}
            {capability.canReview && (
              <div className="border-t border-border/60 p-3 space-y-2 shrink-0 bg-card/60" data-pr-review-submit="true">
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                  {t('prReview.submitTitle')}
                  {pending.length > 0 && (
                    <Badge variant="outline" className="h-4 text-[10px] border-amber-500/40 text-amber-600 dark:text-amber-300">
                      {t('prReview.pendingBadge').replace('{n}', String(pending.length))}
                    </Badge>
                  )}
                </div>

                <div role="radiogroup" aria-label={t('prReview.submitTitle')} className="flex flex-wrap gap-1.5">
                  {REVIEW_EVENTS.map(({ event, labelKey, activeClass }) => (
                    <button
                      key={event}
                      type="button"
                      role="radio"
                      aria-checked={reviewEvent === event}
                      data-pr-review-event={event}
                      onClick={() => setReviewEvent(event)}
                      className={cn(
                        'px-2.5 py-1 rounded-md border text-[11px] font-medium transition-colors',
                        reviewEvent === event
                          ? activeClass
                          : 'border-border/70 text-muted-foreground hover:text-foreground hover:bg-accent/40'
                      )}
                    >
                      {t(labelKey)}
                    </button>
                  ))}
                </div>

                <textarea
                  value={reviewBody}
                  onChange={e => setReviewBody(e.target.value)}
                  placeholder={t('prReview.bodyPlaceholder')}
                  aria-label={t('prReview.bodyLabel')}
                  rows={2}
                  className="w-full resize-none rounded-lg border border-input bg-background/80 p-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />

                {pending.length > 0 ? (
                  <div className="space-y-1">
                    {pending.map(draft => (
                      <div key={draft.id} data-pr-pending-draft={draft.id}
                        className="flex items-start gap-2 rounded-md bg-muted/40 border border-border/50 px-2 py-1 text-[11px]">
                        <span className="font-mono text-muted-foreground shrink-0 break-all">
                          {draft.path} · {t(draft.side === 'LEFT' ? 'prReview.sideLeft' : 'prReview.sideRight')} · {t('prReview.lineLabel').replace('{line}', String(draft.line))}
                        </span>
                        <span className="flex-1 min-w-0 truncate text-foreground/90">{draft.body}</span>
                        <button type="button" aria-label={t('prReview.draftRemove')} title={t('prReview.draftRemove')}
                          onClick={() => handleRemoveDraft(draft.id)}
                          className="text-muted-foreground hover:text-destructive shrink-0">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground">{t('prReview.draftHint')}</p>
                )}

                {submitError && <div role="alert" className="text-xs text-destructive">{submitError}</div>}

                <div className="flex justify-end">
                  <Button type="button" size="xs" onClick={handleSubmitReview} disabled={submitting}
                    className="h-7 text-xs gap-1.5 btn-neon dark:btn-neon" data-pr-review-submit-button="true">
                    {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                    <span>{submitting ? t('prReview.submitting') : t('prReview.submit')}</span>
                  </Button>
                </div>
              </div>
            )}
          </Tabs.Content>
        </Tabs.Root>
      </div>
    </ModalSurface>
  );
};
