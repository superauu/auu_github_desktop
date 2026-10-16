import { useEffect, useRef } from 'react';
import { AlertTriangle, FileText } from 'lucide-react';
import { useConfirmStore } from '@/stores/confirmStore';
import { useRepoStore } from '@/stores/repoStore';
import { useI18n } from '@/i18n';
import { ModalSurface } from './ModalSurface';
import { Button } from './button';

export function ConfirmDialog() {
  const { pending, settle } = useConfirmStore();
  const repoPath = useRepoStore((state) => state.currentRepo?.path);
  const branch = useRepoStore((state) => state.status?.currentBranch || state.currentRepo?.currentBranch);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const { t } = useI18n();
  useEffect(() => {
    if (pending && (pending.repoPath !== repoPath || pending.branch !== branch)) settle(false);
  }, [repoPath, branch, pending, settle]);
  useEffect(() => { if (pending) cancelRef.current?.focus(); }, [pending]);
  if (!pending) return null;
  return <ModalSurface label={pending.title} onDismiss={() => settle(false)} className="fixed inset-0 z-[100] bg-black/45 flex items-center justify-center p-6">
    <div className="w-full max-w-lg rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl p-6 space-y-4">
      <h2 className="text-base font-semibold flex items-center gap-2">{pending.danger === false ? <FileText className="h-5 w-5 text-muted-foreground" /> : <AlertTriangle className="h-5 w-5 text-destructive" />}{pending.title}</h2>
      {pending.repoPath && <p className="text-[12px] text-muted-foreground break-all">{pending.repoPath} · {pending.branch}</p>}
      <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{pending.description}</p>
      {pending.detail && <pre className="max-h-48 overflow-auto rounded-md bg-muted p-3 text-[12px] whitespace-pre-wrap break-words">{pending.detail}</pre>}
      <div className="flex justify-end gap-2 pt-2">
        <Button ref={cancelRef} variant="outline" onClick={() => settle(false)}>{t('common.cancel')}</Button>
        <Button variant={pending.danger === false ? 'default' : 'destructive'} onClick={() => settle(true)}>{pending.confirmLabel || t('common.confirm')}</Button>
      </div>
    </div>
  </ModalSurface>;
}
