import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/i18n';
import { toast } from '@/stores/toastStore';
import { lfsService, type LfsFile, type LfsTrack } from '@/services/git/LfsService';
import { Loader2, RefreshCw, DownloadCloud, Power, PowerOff, Trash2 } from 'lucide-react';

/**
 * LFS 面板：仓库工具弹窗的"Git LFS"标签页。git-lfs 缺失时整体降级为安装提示；
 * 已安装时提供仓库过滤开关、跟踪模式管理与 LFS 文件列表/拉取。全部操作互斥防重入。
 */
export const LfsPanel: React.FC<{ repoPath: string }> = ({ repoPath }) => {
  const { t } = useI18n();
  const [version, setVersion] = useState<string | null | undefined>(undefined);
  const [filtersOn, setFiltersOn] = useState(false);
  const [tracks, setTracks] = useState<LfsTrack[]>([]);
  const [files, setFiles] = useState<LfsFile[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [pattern, setPattern] = useState('');

  const refresh = useCallback(async (detected: string | null) => {
    if (detected === null) {
      setFiltersOn(false);
      setTracks([]);
      setFiles(null);
      return;
    }
    const [enabled, trackList] = await Promise.all([
      lfsService.repoFilterEnabled(repoPath),
      lfsService.tracks(repoPath).catch(() => [] as LfsTrack[]),
    ]);
    setFiltersOn(enabled);
    setTracks(trackList);
  }, [repoPath]);

  useEffect(() => {
    let alive = true;
    setVersion(undefined);
    void (async () => {
      try {
        const detected = await lfsService.detect(repoPath);
        if (!alive) return;
        setVersion(detected);
        await refresh(detected);
      } catch {
        if (alive) setVersion(null);
      }
    })();
    return () => { alive = false; };
  }, [repoPath, refresh]);

  const run = useCallback(async (action: () => Promise<void>, successTitle?: string, successDesc?: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      await refresh(version ?? null);
      if (successTitle) toast.success(successTitle, successDesc);
    } catch (error) {
      toast.error(t('lfs.actionFailed'), error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [busy, refresh, version, t]);

  const submitTrack = useCallback(() => {
    const trimmed = pattern.trim();
    if (!trimmed) {
      toast.error(t('lfs.actionFailed'), t('lfs.trackInvalid'));
      return;
    }
    void run(
      async () => {
        await lfsService.addTrack(repoPath, trimmed);
        setPattern('');
      },
      t('lfs.trackAdded').replace('{pattern}', trimmed),
    );
  }, [pattern, repoPath, run, t]);

  // 探测中
  if (version === undefined) {
    return (
      <div className="py-8 flex items-center justify-center gap-2 text-[12px] text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>{t('lfs.detecting')}</span>
      </div>
    );
  }

  // 未安装：降级为安装指引（仓库级操作不可用）。
  if (version === null) {
    return (
      <div className="space-y-2">
        <p className="text-[12px] text-muted-foreground">{t('lfs.notInstalled')}</p>
        <Button variant="ghost" size="xs" onClick={() => setVersion(undefined)}>
          <RefreshCw className="h-3.5 w-3.5" />
          <span>{t('lfs.detecting')}</span>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* 状态行：版本 + 仓库过滤开关 */}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="info" className="text-[10px]">git-lfs {version.split(/\s+/)[0].split('/').pop()}</Badge>
        <span className="text-[12px] text-muted-foreground">{filtersOn ? t('lfs.repoEnabled') : t('lfs.repoDisabled')}</span>
        <span className="flex-1" />
        <Button
          variant="ghost"
          size="xs"
          disabled={busy}
          onClick={() => void run(
            filtersOn ? () => lfsService.disableRepoFilters(repoPath) : () => lfsService.enableRepoFilters(repoPath),
            filtersOn ? t('lfs.disableDone') : t('lfs.enableDone'),
          )}
        >
          {filtersOn ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
          <span>{filtersOn ? t('lfs.disable') : t('lfs.enable')}</span>
        </Button>
        <Button
          variant="ghost"
          size="xs"
          disabled={busy}
          onClick={() => void run(() => lfsService.pull(repoPath), t('lfs.pullDone'))}
        >
          <DownloadCloud className="h-3.5 w-3.5" />
          <span>{t('lfs.pull')}</span>
        </Button>
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>
      {!filtersOn && <p className="text-[12px] text-muted-foreground/80">{t('lfs.installHint')}</p>}

      {/* 跟踪模式 */}
      <section className="space-y-1.5">
        <h3 className="text-[12px] font-semibold text-foreground">{t('lfs.tracks')}</h3>
        <div className="flex items-center gap-2">
          <input
            value={pattern}
            onChange={(event) => setPattern(event.target.value)}
            placeholder={t('lfs.trackPattern')}
            className="flex-1 h-7 px-2 rounded border border-border bg-background text-[12px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:border-primary"
          />
          <Button variant="default" size="xs" disabled={busy} onClick={submitTrack}>
            {t('lfs.addTrack')}
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground/70">{t('lfs.trackHint')}</p>
        {tracks.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">{t('lfs.noTracks')}</p>
        ) : (
          <ul className="space-y-1">
            {tracks.map((track) => (
              <li key={`${track.pattern}@${track.source}`} className="rounded border border-border bg-accent/10 px-3 py-1.5 flex items-center gap-2">
                <span className="font-mono text-[12px] text-foreground truncate flex-1">{track.pattern}</span>
                <span className="text-[11px] text-muted-foreground/80 shrink-0">{track.source}</span>
                <Button
                  variant="ghost"
                  size="xs"
                  disabled={busy}
                  title={t('lfs.trackRemoved').replace('{pattern}', track.pattern)}
                  onClick={() => void run(
                    () => lfsService.removeTrack(repoPath, track.pattern),
                    t('lfs.trackRemoved').replace('{pattern}', track.pattern),
                  )}
                  className="text-muted-foreground hover:text-git-deleted"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* LFS 文件（按需加载：大仓库 ls-files 可能慢） */}
      <section className="space-y-1.5">
        <div className="flex items-center gap-2">
          <h3 className="text-[12px] font-semibold text-foreground">{t('lfs.files')}</h3>
          <Button
            variant="ghost"
            size="xs"
            disabled={busy}
            onClick={() => void run(async () => { setFiles(await lfsService.files(repoPath)); })}
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
        {files !== null && files.length === 0 && <p className="text-[12px] text-muted-foreground">{t('lfs.noFiles')}</p>}
        {files !== null && files.length > 0 && (
          <ul className="space-y-1">
            {files.map((file) => (
              <li key={`${file.oid}@${file.path}`} className="rounded border border-border bg-accent/10 px-3 py-1.5 flex items-center gap-2">
                <span className="font-mono text-[11px] text-muted-foreground shrink-0">{file.oid.slice(0, 8)}</span>
                <span className="font-mono text-[12px] text-foreground truncate flex-1" title={file.path}>{file.path}</span>
                {file.downloaded && <Badge variant="success" className="text-[10px]">✓</Badge>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};
