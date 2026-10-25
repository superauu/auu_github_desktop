import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { useI18n } from '@/i18n';
import { confirmAction } from '@/stores/confirmStore';
import { toast } from '@/stores/toastStore';
import { submoduleService, type SubmoduleEntry, type SubmoduleStatusKind } from '@/services/git/SubmoduleService';
import { Loader2, RefreshCw, Plus, X, DownloadCloud, Link2, Trash2 } from 'lucide-react';

/** 状态徽标的配色：modified=琥珀、conflict=玫红（与文件列表冲突徽标同系）、其余中性。 */
const STATUS_STYLES: Record<SubmoduleStatusKind, string> = {
  initialized: 'bg-accent text-muted-foreground border-border',
  uninitialized: 'bg-accent/50 text-muted-foreground/80 border-border',
  modified: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  conflict: 'bg-rose-500/20 text-git-deleted border-rose-500/40',
};

const STATUS_KEYS: Record<SubmoduleStatusKind, string> = {
  initialized: 'submodules.status.initialized',
  uninitialized: 'submodules.status.initialized',
  modified: 'submodules.status.modified',
  conflict: 'submodules.status.conflict',
};

/**
 * 子模块面板：仓库工具弹窗的"子模块"标签页。列表/添加/更新/取消初始化/同步；
 * 破坏性操作（deinit）走确认对话框，全部操作互斥防重入。
 */
export const SubmodulesPanel: React.FC<{ repoPath: string }> = ({ repoPath }) => {
  const { t } = useI18n();
  const [entries, setEntries] = useState<SubmoduleEntry[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addUrl, setAddUrl] = useState('');
  const [addPath, setAddPath] = useState('');
  const [addBranch, setAddBranch] = useState('');
  const [showCommitHint, setShowCommitHint] = useState(false);

  const refresh = useCallback(async () => {
    setLoadError('');
    try {
      setEntries(await submoduleService.list(repoPath));
    } catch (error) {
      setEntries(null);
      setLoadError(error instanceof Error ? error.message : t('submodules.loadFailed'));
    }
  }, [repoPath, t]);

  useEffect(() => {
    setEntries(null);
    setLoadError('');
    setAddOpen(false);
    setShowCommitHint(false);
    void refresh();
  }, [refresh]);

  /** 全部操作共用一把互斥锁：子模块命令慢且会互相干扰（clone/checkout）。 */
  const run = useCallback(async (action: () => Promise<void>, successTitle?: string, successDesc?: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      await refresh();
      if (successTitle) toast.success(successTitle, successDesc);
    } catch (error) {
      toast.error(t('submodules.actionFailed'), error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [busy, refresh, t]);

  const submitAdd = useCallback(() => {
    if (!addUrl.trim() || !addPath.trim()) {
      toast.error(t('submodules.addFailed'), t('submodules.addMissing'));
      return;
    }
    void run(
      async () => {
        await submoduleService.add(repoPath, { url: addUrl, path: addPath, branch: addBranch });
        setAddUrl('');
        setAddPath('');
        setAddBranch('');
        setAddOpen(false);
        setShowCommitHint(true);
      },
      t('submodules.add'),
    );
  }, [addUrl, addPath, addBranch, repoPath, run, t]);

  const deinit = useCallback((entry: SubmoduleEntry) => {
    void (async () => {
      const confirmed = await confirmAction({
        title: t('submodules.deinitConfirmTitle'),
        description: t('submodules.deinitConfirmBody'),
        detail: entry.path,
        danger: true,
      });
      if (!confirmed) return;
      await run(() => submoduleService.deinit(repoPath, entry.path), t('submodules.deinit'));
    })();
  }, [repoPath, run, t]);

  return (
    <div className="space-y-3">
      {/* 工具行：刷新 / 添加入口 / 递归更新 / 同步 */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <Button variant="ghost" size="xs" disabled={busy} onClick={() => void refresh()} title={t('submodules.refresh')}>
          <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
        </Button>
        <Button variant="ghost" size="xs" disabled={busy} onClick={() => setAddOpen((open) => !open)}>
          {addOpen ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          <span>{t('submodules.add')}</span>
        </Button>
        {(entries?.length ?? 0) > 0 && (
          <>
            <Button
              variant="ghost"
              size="xs"
              disabled={busy}
              onClick={() => void run(() => submoduleService.updateInit(repoPath), t('submodules.updateRecursive'))}
              title={t('submodules.updateRecursive')}
            >
              <DownloadCloud className="h-3.5 w-3.5" />
              <span>{t('submodules.update')}</span>
            </Button>
            <Button
              variant="ghost"
              size="xs"
              disabled={busy}
              onClick={() => void run(() => submoduleService.sync(repoPath), t('submodules.sync'))}
            >
              <Link2 className="h-3.5 w-3.5" />
              <span>{t('submodules.sync')}</span>
            </Button>
          </>
        )}
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>

      {/* 添加子模块表单（可折叠） */}
      {addOpen && (
        <div className="rounded-lg border border-border bg-accent/20 p-3 space-y-2">
          <input
            value={addUrl}
            onChange={(event) => setAddUrl(event.target.value)}
            placeholder={t('submodules.addUrl')}
            className="w-full h-7 px-2 rounded border border-border bg-background text-[12px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:border-primary"
          />
          <div className="flex items-center gap-2">
            <input
              value={addPath}
              onChange={(event) => setAddPath(event.target.value)}
              placeholder={t('submodules.addPath')}
              className="flex-1 h-7 px-2 rounded border border-border bg-background text-[12px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:border-primary"
            />
            <input
              value={addBranch}
              onChange={(event) => setAddBranch(event.target.value)}
              placeholder={t('submodules.addBranch')}
              className="w-40 h-7 px-2 rounded border border-border bg-background text-[12px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:border-primary"
            />
          </div>
          <div className="flex justify-end">
            <Button variant="default" size="xs" disabled={busy} onClick={submitAdd}>
              {t('submodules.addSubmit')}
            </Button>
          </div>
        </div>
      )}

      {showCommitHint && (
        <div className="rounded border border-primary/30 bg-primary/5 px-3 py-2 text-[12px] text-muted-foreground">
          {t('submodules.commitHint')}
        </div>
      )}

      {/* 列表 / 空态 / 错误 */}
      {loadError ? (
        <div className="space-y-2">
          <p className="text-[12px] text-git-deleted">{loadError}</p>
          <Button variant="ghost" size="xs" onClick={() => void refresh()}>
            <RefreshCw className="h-3.5 w-3.5" />
            <span>{t('submodules.refresh')}</span>
          </Button>
        </div>
      ) : entries === null ? (
        <div className="py-8 flex items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : entries.length === 0 ? (
        <EmptyState title={t('submodules.empty')} />
      ) : (
        <ul className="space-y-1.5">
          {entries.map((entry) => (
            <li
              key={entry.path}
              className="rounded-lg border border-border bg-accent/10 px-3 py-2 flex items-center gap-2"
              title={entry.status === 'modified' ? t('submodules.dirtyHint') : undefined}
            >
              <Badge className={`text-[10px] px-1.5 border ${STATUS_STYLES[entry.status]}`}>
                {t(STATUS_KEYS[entry.status])}
              </Badge>
              <span className="font-mono text-[12px] text-foreground truncate flex-1" title={entry.path}>
                {entry.path}
              </span>
              <span className="font-mono text-[11px] text-muted-foreground shrink-0" title={t('submodules.currentCommit')}>
                {entry.sha.slice(0, 8)}
              </span>
              {entry.describe && (
                <span className="text-[11px] text-muted-foreground/80 shrink-0 max-w-32 truncate" title={t('submodules.describe')}>
                  {entry.describe}
                </span>
              )}
              <Button
                variant="ghost"
                size="xs"
                disabled={busy}
                title={t('submodules.deinit')}
                onClick={() => deinit(entry)}
                className="text-muted-foreground hover:text-git-deleted"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
