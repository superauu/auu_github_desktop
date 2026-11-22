import { useRef, useState } from 'react';
import { FileDiff, Loader2, X } from 'lucide-react';
import { ModalSurface } from '@/components/ui/ModalSurface';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import { toast } from '@/stores/toastStore';
import { patchService, type PatchPreview } from '@/services/git/PatchService';

interface Props { repoPath: string; onClose: () => void }

/**
 * 应用补丁文件：选文件 → numstat 预览影响 → 确认后 apply 到工作区（不建提交，
 * 由用户在变更页审查后自行提交，贴合「AI 负责提交、AuuGit 负责放行」的工作流）。
 */
export function ApplyPatchDialog({ repoPath, onClose }: Props) {
  const { t, tf } = useI18n();
  const [path, setPath] = useState<string | null>(null);
  const [preview, setPreview] = useState<PatchPreview | null>(null);
  const patchRef = useRef<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);

  const pickAndPreview = async () => {
    const id = ++request.current;
    setError(null);
    setPreview(null);
    setPath(null);
    const picked = await patchService.pickPatchFile();
    if (!picked) return; // 用户取消 / 浏览器开发模式
    setBusy(true);
    try {
      const patch = await patchService.readPatchFile(picked);
      if (id !== request.current) return;
      patchRef.current = patch;
      const result = await patchService.previewPatch(repoPath, patch);
      if (id !== request.current) return;
      setPath(picked);
      setPreview(result);
    } catch (err) {
      if (id !== request.current) return;
      // apply --numstat 失败：不是有效补丁或与工作区冲突。
      setError(err instanceof Error ? err.message : t('patch.previewFailed'));
    } finally {
      if (id === request.current) setBusy(false);
    }
  };

  const apply = async () => {
    if (!preview || !path) return;
    setBusy(true);
    setError(null);
    try {
      await patchService.applyPatch(repoPath, patchRef.current);
      toast.success(t('patch.applied'), t('patch.appliedDesc'));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('patch.applyFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalSurface onDismiss={onClose} dismissible={!busy} label={t('patch.applyTitle')}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs animate-in fade-in-0 select-none">
      <div className="w-full max-w-lg rounded-xl border border-border bg-popover shadow-2xl p-4 space-y-3 text-[13px]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="ui-panel-title flex items-center gap-2"><FileDiff className="h-4 w-4 text-muted-foreground" />{t('patch.applyTitle')}</h2>
          <Button variant="ghost" size="icon" aria-label={t('common.close')} disabled={busy} onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <p className="text-muted-foreground leading-relaxed">{t('patch.applyDesc')}</p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void pickAndPreview()}>{t('patch.pickFile')}</Button>
          {path && <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground" title={path}>{path}</span>}
        </div>
        {preview && (
          <div className="rounded-lg border border-border/60 overflow-hidden">
            <p className="px-3 py-2 bg-muted/40 text-[12px] text-muted-foreground tabular-nums">
              {tf('patch.summary', { files: String(preview.files.length), added: String(preview.totalAdditions), removed: String(preview.totalDeletions) })}
              {preview.binaryCount > 0 && ` · ${tf('patch.binaryFiles', { n: String(preview.binaryCount) })}`}
            </p>
            <div className="max-h-48 overflow-y-auto divide-y divide-border/40">
              {preview.files.map((file, index) => (
                <div key={`${file.file}:${index}`} className="flex items-center gap-2 px-3 py-1.5 text-[12px]">
                  <span className="min-w-0 flex-1 truncate font-mono" title={file.file}>{file.file}</span>
                  {file.additions === null || file.deletions === null ? (
                    <span className="shrink-0 text-muted-foreground">{t('patch.binaryFile')}</span>
                  ) : (
                    <span className="shrink-0 font-mono tabular-nums"><span className="text-git-added">+{file.additions}</span> <span className="text-git-deleted">-{file.deletions}</span></span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {error && <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-[12px] text-destructive wrap-break-word">{error}</div>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" size="sm" disabled={busy} onClick={onClose}>{t('patch.cancelled')}</Button>
          <Button size="sm" disabled={!preview || busy} onClick={() => void apply()}>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{t('patch.confirmApply')}
          </Button>
        </div>
      </div>
    </ModalSurface>
  );
}
