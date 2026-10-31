import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ModalSurface } from '@/components/ui/ModalSurface';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { tNow, useI18n } from '@/i18n';
import { confirmAction } from '@/stores/confirmStore';
import { toast } from '@/stores/toastStore';
import { gitService } from '@/services/git/GitService';
import { bisectService } from '@/services/git/BisectService';
import type { BisectCandidate } from '@/services/git/BisectService';
import type { GitCommit, GitFileChange } from '@/services/git/types';
import {
  Split,
  X,
  Loader2,
  ThumbsUp,
  ThumbsDown,
  SkipForward,
  RotateCcw,
  ScrollText,
  ChevronDown,
  Bug,
} from 'lucide-react';
import { cn } from '@/utils/cn';

interface BisectWizardDialogProps {
  repoPath: string;
  /** 当前已加载的提交列表（供范围选择的下拉使用）。 */
  commits: GitCommit[];
  /** 预选的坏提交（如历史面板中选中的提交）；缺省 HEAD。 */
  defaultBadHash?: string;
  onClose: () => void;
}

type Phase = 'boot' | 'range' | 'testing' | 'result';

// 服务层会检查工作区；这些特征也可读化外部并发修改导致的 Git 检出失败。
const DIRTY_TREE = /local changes|would be overwritten by checkout|untracked working tree|please commit|需要先提交|会覆盖本地修改/i;

const MAX_SELECT_COMMITS = 300;

export const BisectWizardDialog: React.FC<BisectWizardDialogProps> = ({ repoPath, commits, defaultBadHash, onClose }) => {
  const { t } = useI18n();
  const [phase, setPhase] = useState<Phase>('boot');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // 步骤1 范围
  const [badRef, setBadRef] = useState(defaultBadHash || 'HEAD');
  const [goodRef, setGoodRef] = useState('');
  const [span, setSpan] = useState<number | null>(null);

  // 步骤2 测试循环
  const [candidate, setCandidate] = useState<BisectCandidate | null>(null);
  const [steps, setSteps] = useState<number | null>(null);
  const [logText, setLogText] = useState('');
  const [logOpen, setLogOpen] = useState(false);

  // 步骤3 结果
  const [firstBad, setFirstBad] = useState<BisectCandidate | null>(null);
  const [files, setFiles] = useState<GitFileChange[]>([]);

  const request = useRef(0);
  const invalidate = useCallback(() => { request.current++; }, []);

  /** 把 bisect 相关 git 报错可读化：脏工作区给出明确指引，其余原样透出。 */
  const readable = useCallback((err: unknown) => {
    const raw = err instanceof Error ? err.message : String(err);
    if (DIRTY_TREE.test(raw)) return `${tNow('bisect.dirtyBlocked')}\n${raw}`;
    return raw;
  }, []);

  /** 进入/恢复测试步骤：刷新当前候选与剩余估算。 */
  const refreshTesting = useCallback(async (myRequest: number) => {
    const [info, remaining, log] = await Promise.all([
      bisectService.candidateInfo(repoPath),
      bisectService.stepsRemaining(repoPath).catch(() => null),
      bisectService.log(repoPath),
    ]);
    if (myRequest !== request.current) return;
    setCandidate(info);
    setSteps(remaining);
    setLogText(log);
  }, [repoPath]);

  /** 展示结果步骤：拉取首个坏提交信息与变更文件概要。 */
  const showResult = useCallback(async (hash: string, known?: BisectCandidate) => {
    const id = request.current;
    const [info, changed] = await Promise.all([
      known && known.hash === hash ? known : bisectService.commitInfo(repoPath, hash),
      gitService.getCommitFiles(repoPath, hash).catch(() => []),
    ]);
    if (id !== request.current) return;
    setFirstBad(info); setFiles(changed);
    setPhase('result');
  }, [repoPath]);

  // 启动探测：已有收敛结果 → 结果步骤；仍在 bisect → 恢复测试步骤；否则范围选择。
  useEffect(() => {
    let cancelled = false;
    const myRequest = ++request.current;
    (async () => {
      try {
        const finished = await bisectService.resultHash(repoPath);
        if (cancelled) return;
        if (finished) { await showResult(finished); return; }
        if (await bisectService.isBisecting(repoPath)) {
          if (cancelled) return;
          setPhase('testing');
          toast.info(tNow('bisect.resumed'));
          await refreshTesting(myRequest);
          return;
        }
        if (!cancelled) setPhase('range');
      } catch (err) {
        if (!cancelled) { setError(readable(err)); setPhase('range'); }
      }
    })();
    return () => { cancelled = true; invalidate(); };
  }, [repoPath, showResult, refreshTesting, readable, invalidate]);

  // 范围预览：好..坏之间待测提交数（方向错误时为 0，由开始按钮拦截）。
  useEffect(() => {
    if (phase !== 'range' || !goodRef || !badRef || goodRef === badRef) { setSpan(null); return; }
    let cancelled = false;
    const myRequest = ++request.current;
    bisectService.rangeCount(repoPath, goodRef, badRef)
      .then((count) => { if (!cancelled && myRequest === request.current) setSpan(count); })
      .catch(() => { if (!cancelled && myRequest === request.current) setSpan(null); });
    return () => { cancelled = true; };
  }, [phase, repoPath, badRef, goodRef]);

  const handleStart = async () => {
    if (!repoPath || busy) return;
    setBusy(true); setError('');
    try {
      await bisectService.start(repoPath, badRef, goodRef);
      const finished = await bisectService.resultHash(repoPath);
      if (finished) { await showResult(finished); return; }
      const myRequest = ++request.current;
      setPhase('testing');
      await refreshTesting(myRequest);
    } catch (err) {
      setError(readable(err));
    } finally { setBusy(false); }
  };

  const handleMark = async (kind: 'good' | 'bad' | 'skip') => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const outcome = await (kind === 'good'
        ? bisectService.markGood(repoPath)
        : kind === 'bad' ? bisectService.markBad(repoPath) : bisectService.markSkip(repoPath));
      const finishedHash = outcome.firstBad?.hash ?? (outcome.finished ? await bisectService.resultHash(repoPath) : null);
      if (outcome.finished && finishedHash) {
        await showResult(finishedHash, outcome.firstBad ?? undefined);
      } else {
        const myRequest = ++request.current;
        await refreshTesting(myRequest);
      }
    } catch (err) {
      setError(readable(err));
    } finally { setBusy(false); }
  };

  const handleReset = async () => {
    if (busy) return;
    if (!await confirmAction({ title: t('bisect.resetConfirmTitle'), description: t('bisect.resetConfirmDesc'), danger: true })) return;
    setBusy(true); setError('');
    try {
      await bisectService.reset(repoPath);
      toast.success(t('bisect.resetDone'));
      setPhase('range');
      setSpan(null);
      setCandidate(null);
      setLogText('');
      setLogOpen(false);
    } catch (err) {
      setError(readable(err));
    } finally { setBusy(false); }
  };

  const handleFinish = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      await bisectService.reset(repoPath);
      toast.success(t('bisect.resetDone'));
      onClose();
    } catch (err) {
      setError(readable(err));
      setBusy(false);
    }
  };

  /** 关闭守卫：测试中/结果未还原时先询问（会话在 git 侧仍存活，可随时恢复）。 */
  const requestClose = useCallback(async () => {
    if (busy) return;
    if (phase === 'testing') {
      if (!await confirmAction({ title: t('bisect.leaveConfirmTitle'), description: t('bisect.leaveConfirmDesc') })) return;
    } else if (phase === 'result') {
      if (!await confirmAction({ title: t('bisect.leaveConfirmTitle'), description: t('bisect.resultLeaveConfirmDesc') })) return;
    }
    onClose();
  }, [busy, phase, t, onClose]);

  const selectableCommits = commits.slice(0, MAX_SELECT_COMMITS);
  const stepIndex = phase === 'result' ? 3 : phase === 'testing' ? 2 : 1;

  const renderCandidate = (info: BisectCandidate | null) => (
    <div className="rounded-lg border border-border bg-secondary/30 px-3 py-2">
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-mono text-[12px] text-primary shrink-0">{info?.shortHash || '—'}</span>
        <span className="text-[13px] text-foreground truncate" title={info?.subject}>{info?.subject || '—'}</span>
      </div>
      {(info?.authorName || info?.dateIso) && (
        <div className="text-[11px] text-muted-foreground mt-0.5">{info?.authorName} · {info?.dateIso}</div>
      )}
    </div>
  );

  return (
    <ModalSurface
      onDismiss={requestClose}
      dismissible={!busy}
      label={t('bisect.title')}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs animate-in fade-in-0 select-none"
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] rounded-xl border border-border bg-card shadow-2xl flex flex-col animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 p-4 pb-3 border-b border-border/70 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0"><Split className="h-4 w-4" /></div>
            <div className="min-w-0">
              <div className="font-semibold text-xs text-foreground">{t('bisect.title')}</div>
              <div className="text-[11px] text-muted-foreground truncate">{t('bisect.subtitle')}</div>
            </div>
          </div>
          <Button variant="ghost" size="xs" disabled={busy} onClick={() => void requestClose()} aria-label={t('common.close')} className="p-0 text-muted-foreground hover:text-foreground shrink-0">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Steps indicator */}
        <div className="px-4 py-2 border-b border-border/50 flex items-center gap-2 text-[11px] shrink-0">
          {(['range', 'testing', 'result'] as const).map((key, index) => (
            <React.Fragment key={key}>
              {index > 0 && <span className="text-border">→</span>}
              <span className={cn(
                'px-1.5 py-0.5 rounded font-medium',
                stepIndex === index + 1 ? 'bg-primary/10 text-primary' : stepIndex > index + 1 ? 'text-foreground/70' : 'text-muted-foreground/60',
              )}>
                {index + 1}. {t(`bisect.step.${key}`)}
              </span>
            </React.Fragment>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-auto p-4 space-y-3 text-xs">
          {error && <p role="alert" className="whitespace-pre-wrap rounded-md border border-destructive/40 bg-destructive/10 text-destructive px-3 py-2">{error}</p>}

          {phase === 'boot' && (
            <div className="py-12 flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
              <span>{t('common.loading')}</span>
            </div>
          )}

          {phase === 'range' && (
            <>
              <p className="rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400 px-3 py-2">{t('bisect.dirtyHint')}</p>
              <div className="space-y-1">
                <label className="block text-[12px] font-medium text-foreground" htmlFor="bisect-bad">{t('bisect.badRef')}</label>
                <select
                  id="bisect-bad"
                  value={badRef}
                  onChange={(e) => setBadRef(e.target.value)}
                  className="w-full max-w-full rounded border border-input bg-background p-1.5 text-[12px]"
                >
                  <option value="HEAD">{t('bisect.badHead')}</option>
                  {selectableCommits.map((commit) => (
                    <option key={commit.hash} value={commit.hash}>{commit.shortHash} {commit.subject}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-[12px] font-medium text-foreground" htmlFor="bisect-good">{t('bisect.goodRef')}</label>
                <select
                  id="bisect-good"
                  value={goodRef}
                  onChange={(e) => setGoodRef(e.target.value)}
                  className="w-full max-w-full rounded border border-input bg-background p-1.5 text-[12px]"
                >
                  <option value="">{t('bisect.rangeMissing')}</option>
                  {selectableCommits.map((commit) => (
                    <option key={commit.hash} value={commit.hash}>{commit.shortHash} {commit.subject}</option>
                  ))}
                </select>
              </div>
              {span !== null && span > 0 && (
                <p className="text-muted-foreground">{t('bisect.rangeCount').replace('{n}', String(span))}</p>
              )}
            </>
          )}

          {phase === 'testing' && (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-medium text-foreground">{t('bisect.candidate')}</span>
                {steps !== null && <Badge variant="outline" className="h-4 text-[12px] font-mono shrink-0">{t('bisect.stepsRemaining').replace('{n}', String(steps))}</Badge>}
              </div>
              {renderCandidate(candidate)}
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" disabled={busy} onClick={() => void handleMark('good')} aria-label={t('bisect.markGood')}>
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsUp className="h-3.5 w-3.5 text-git-added" />}
                  {t('bisect.markGood')}
                </Button>
                <Button variant="outline" size="sm" disabled={busy} onClick={() => void handleMark('bad')} aria-label={t('bisect.markBad')}>
                  <ThumbsDown className="h-3.5 w-3.5 text-destructive" />
                  {t('bisect.markBad')}
                </Button>
                <Button variant="outline" size="sm" disabled={busy} onClick={() => void handleMark('skip')} aria-label={t('bisect.markSkip')}>
                  <SkipForward className="h-3.5 w-3.5" />
                  {t('bisect.markSkip')}
                </Button>
                <div className="flex-1" />
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => setLogOpen((open) => !open)} aria-label={logOpen ? t('bisect.hideLog') : t('bisect.viewLog')}>
                  {logOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ScrollText className="h-3.5 w-3.5" />}
                  {logOpen ? t('bisect.hideLog') : t('bisect.viewLog')}
                </Button>
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => void handleReset()} aria-label={t('bisect.reset')} className="text-destructive hover:text-destructive">
                  <RotateCcw className="h-3.5 w-3.5" />
                  {t('bisect.reset')}
                </Button>
              </div>
              {logOpen && (
                <pre className="rounded-md border border-border bg-muted/30 p-2 max-h-48 overflow-auto font-mono text-[11px] leading-relaxed whitespace-pre-wrap select-text">
                  {logText || t('bisect.logEmpty')}
                </pre>
              )}
            </>
          )}

          {phase === 'result' && firstBad && (
            <>
              <p className="rounded-md border border-destructive/40 bg-destructive/10 text-destructive px-3 py-2 flex items-center gap-2">
                <Bug className="h-4 w-4 shrink-0" />
                <span className="font-semibold">{t('bisect.firstBad')}</span>
              </p>
              {renderCandidate(firstBad)}
              <p className="text-muted-foreground">{t('bisect.resultHint')}</p>
              <div>
                <div className="text-[12px] font-medium text-foreground mb-1">{t('bisect.files').replace('{n}', String(files.length))}</div>
                {files.length === 0 ? (
                  <p className="text-muted-foreground">{t('bisect.logEmpty')}</p>
                ) : (
                  <ul className="rounded-md border border-border divide-y divide-border/60 max-h-40 overflow-auto">
                    {files.map((file) => (
                      <li key={file.path} className="flex items-center gap-2 px-2 py-1 font-mono text-[11px]">
                        <Badge
                          variant="outline"
                          className={cn(
                            'h-4 px-1 text-[12px] shrink-0',
                            file.status === 'added' && 'text-git-added',
                            file.status === 'deleted' && 'text-git-deleted',
                            file.status === 'renamed' && 'text-primary',
                          )}
                        >
                          {file.status.charAt(0).toUpperCase()}
                        </Badge>
                        <span className="truncate" title={file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}>{file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 pt-3 border-t border-border/70 shrink-0">
          {phase === 'range' && (
            <Button size="sm" disabled={busy || !goodRef || !badRef || goodRef === badRef || span === 0} onClick={() => void handleStart()}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Split className="h-3.5 w-3.5" />}
              {t('bisect.start')}
            </Button>
          )}
          {phase === 'result' && (
            <Button size="sm" disabled={busy} onClick={() => void handleFinish()}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
              {t('bisect.finish')}
            </Button>
          )}
          {(phase === 'testing' || phase === 'result') && (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => void requestClose()}>{t('common.close')}</Button>
          )}
        </div>
      </div>
    </ModalSurface>
  );
};
