/**
 * AI 修复提案对话框（PRD §8.5，M5）：
 * 工作区保护（脏树先拒绝，避免基于过期内容生成补丁）→ 受限上下文收集 → 提案生成
 * → 预览 → 用户放行应用（git apply 进工作区）。
 * 拒绝路径零 git 变更；应用后不提交——改动留在工作区走用户自己的审查提交流
 * （AI 负责生成，用户负责放行，禁止自动提交）。
 */
import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Sparkles, X } from 'lucide-react';
import { useI18n } from '@/i18n';
import { toast } from '@/stores/toastStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useRepoStore } from '@/stores/repoStore';
import { gitService } from '@/services/git/GitService';
import { executeGit } from '@/services/git/GitExecutor';
import { requestErrorFixProposal, type AiErrorFixProposal } from '@/services/ai/AiErrorFixService';
import { collectFixTargets, selectContextFiles } from '@/services/errors/aiFixContext';
import type { UnifiedErrorIssue } from '@/services/errors/types';
import { Button } from '@/components/ui/button';
import { ModalSurface } from '@/components/ui/ModalSurface';

type Phase = 'idle' | 'working' | 'ready' | 'applying';

export const AiFixDialog: React.FC<{
  open: boolean;
  issue: UnifiedErrorIssue;
  repoPath: string;
  trackedFiles: string[];
  /** 详情页已加载的最新事件堆栈（列表接口不含堆栈，必须显式传入）。 */
  frames: { file: string; line: number | null }[];
  prefixMap?: readonly { from: string; to: string }[];
  onDismiss: () => void;
}> = ({ open, issue, frames, repoPath, trackedFiles, prefixMap, onDismiss }) => {
  const { t, lang } = useI18n();
  const config = useSettingsStore((state) => state.aiConfig);
  const [phase, setPhase] = useState<Phase>('working');
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState('');
  const [contextNote, setContextNote] = useState('');
  const [proposal, setProposal] = useState<AiErrorFixProposal | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sessionRef = useRef(0);

  useEffect(() => {
    sessionRef.current += 1;
    const session = sessionRef.current;
    abortRef.current?.abort();
    if (!open) return;
    setPhase('working');
    setStatusText('');
    setError('');
    setContextNote('');
    setProposal(null);
    // 错误即终态：停掉 spinner（否则看起来像永远在收集）
    const fail = (message: string) => {
      setPhase('idle');
      setError(message);
    };
    void (async () => {
      try {
        // 工作区保护（§8.5）：脏树先拒绝
        setStatusText(t('errors.ai.dirtyCheck'));
        const status = await gitService.getStatus(repoPath);
        if (session !== sessionRef.current) return;
        if (!status.isClean) {
          fail(t('errors.ai.dirtyWorktree'));
          return;
        }

        // 收集受限上下文：干净工作区下 HEAD 内容即工作区内容
        setStatusText(t('errors.ai.collecting'));
        const targets = collectFixTargets(frames, { prefixMap, trackedFiles });
        const contents = new Map<string, string | null>();
        for (const target of targets) {
          try {
            const result = await executeGit(['--literal-pathspecs', 'show', `HEAD:${target.path}`], repoPath);
            contents.set(target.path, result.stdout);
          } catch {
            contents.set(target.path, null); // 不可读（二进制/不存在）由 select 层跳过
          }
        }
        const { files, skipped, truncated } = selectContextFiles(targets, (path) => contents.get(path) ?? null);
        if (session !== sessionRef.current) return;
        if (!files.length) {
          // 给出可行动的线索：展示堆栈原始路径样例，引导配置路径前缀映射
          const sample = frames.map((frame) => frame.file).filter(Boolean).slice(0, 2).join(' , ');
          fail(sample ? t('errors.ai.noContextHint').replace('{sample}', sample) : t('errors.ai.noContext'));
          return;
        }
        setContextNote(
          [skipped > 0 ? t('errors.ai.skippedFiles').replace('{n}', String(skipped)) : '', truncated ? t('errors.ai.truncated') : '']
            .filter(Boolean)
            .join(' '),
        );

        // 生成提案
        setStatusText(t('errors.ai.requesting'));
        const controller = new AbortController();
        abortRef.current = controller;
        const result = await requestErrorFixProposal(
          {
            issue: {
              shortId: issue.shortId,
              title: issue.title,
              message: issue.message,
              severity: issue.severity,
              rawStatus: issue.rawStatus,
              environment: issue.environment,
              release: issue.release,
            },
            stack: frames.map((frame) => ({ file: frame.file, line: frame.line })),
            files,
          },
          config,
          lang,
          controller.signal,
        );
        if (session !== sessionRef.current) return;
        if (!result.patch.trim()) {
          // 平台明确说上下文不足：把分析当错误说明展示
          fail(`${t('errors.ai.noPatch')}\n${result.analysis}`);
          return;
        }
        setProposal(result);
        setPhase('ready');
      } catch (cause) {
        if (session !== sessionRef.current) return;
        fail(cause instanceof DOMException && cause.name === 'AbortError' ? t('explain.cancelled') : String(cause instanceof Error ? cause.message : cause));
      }
    })();
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 会话生命周期以 open 为界
  }, [open]);

  const close = () => {
    abortRef.current?.abort();
    onDismiss();
  };

  const apply = async () => {
    if (!proposal || phase !== 'ready') return;
    setPhase('applying');
    try {
      // 竞态守卫：应用前复检工作区仍干净（§8.5）
      const status = await gitService.getStatus(repoPath);
      if (!status.isClean) {
        setError(t('errors.ai.dirtyWorktree'));
        setPhase('ready');
        return;
      }
      await executeGit(['apply', '--whitespace=nowarn', '-'], repoPath, proposal.patch);
      await useRepoStore.getState().refreshStatus();
      toast.success(t('errors.ai.applied'));
      onDismiss();
    } catch (cause) {
      setError(`${t('errors.ai.applyFailed')}: ${String(cause instanceof Error ? cause.message : cause)}`);
      setPhase('ready');
    }
  };

  return (
    <ModalSurface
      label={t('errors.ai.dialogTitle')}
      onDismiss={close}
      className="fixed inset-0 z-60 bg-background/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in-0"
    >
      <div className="w-full max-w-2xl max-h-[85dvh] flex flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-2xl animate-in zoom-in-95" onClick={(event) => event.stopPropagation()} data-testid="errors-ai-fix-dialog">
        <header className="flex items-center justify-between">
          <h2 className="font-semibold flex gap-2 items-center text-sm">
            <Sparkles className="w-4 h-4 text-primary" />
            {t('errors.ai.dialogTitle')}
          </h2>
          <Button variant="ghost" size="icon-xs" aria-label={t('common.close')} onClick={close}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </header>

        <p className="text-[12px] text-muted-foreground">{t('errors.ai.consent')} <span className="font-mono">{config.model} · {config.endpoint}</span></p>

        <div className="min-h-0 flex-1 overflow-y-auto space-y-3 text-xs">
          {phase === 'working' && (
            <p role="status" className="flex items-center gap-2 text-[12px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {statusText || t('errors.ai.requesting')}
            </p>
          )}
          {error && <p role="alert" className="text-[12px] text-destructive whitespace-pre-wrap select-text">{error}</p>}
          {contextNote && <p className="text-[11px] text-muted-foreground">{contextNote}</p>}
          {proposal && (
            <>
              <section>
                <h3 className="mb-1 text-[12px] font-medium">{t('errors.ai.analysis')}</h3>
                <div className="whitespace-pre-wrap rounded-md border border-border p-2 text-[12px] leading-relaxed select-text">{proposal.analysis}</div>
              </section>
              <section>
                <h3 className="mb-1 text-[12px] font-medium">{t('errors.ai.patch')}</h3>
                <pre className="max-h-64 overflow-auto rounded-md border border-border p-2 font-mono text-[11px] whitespace-pre-wrap select-text">{proposal.patch}</pre>
              </section>
            </>
          )}
        </div>

        <footer className="flex justify-end gap-2">
          <Button variant="ghost" size="xs" onClick={close}>{t('common.close')}</Button>
          {proposal && (
            <Button variant="outline" size="xs" disabled={phase !== 'ready'} onClick={() => void apply()}>
              {phase === 'applying' ? t('errors.ai.applying') : t('errors.ai.apply')}
            </Button>
          )}
        </footer>
      </div>
    </ModalSurface>
  );
};
