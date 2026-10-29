import React, { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { useI18n } from '@/i18n';
import { toast } from '@/stores/toastStore';
import { useRepoStore } from '@/stores/repoStore';
import { useForgeStore } from '@/stores/forgeStore';
import type { ForgePullRequest } from '@/services/forge/types';
import { ForgePullDetailDialog } from './ForgePullDetailDialog';
import { Loader2, RefreshCw, GitMerge, Unplug } from 'lucide-react';

/** 状态徽标配色：open=青、merged=紫外不碰（用绿系）、closed=中性灰。 */
const STATE_VARIANTS: Record<string, { variant: 'info' | 'success' | 'outline'; key: string }> = {
  open: { variant: 'info', key: 'forge.state.open' },
  merged: { variant: 'success', key: 'forge.state.merged' },
  closed: { variant: 'outline', key: 'forge.state.closed' },
};

/**
 * GitLab / Gitea 托管视图：自动识别 origin 远程 → 连接账号（PAT）→
 * 浏览打开的合并请求与详情。GitHub 仓库不进入本视图（沿用既有深度界面）。
 */
export const ForgeView: React.FC = () => {
  const { t } = useI18n();
  const currentRepo = useRepoStore((state) => state.currentRepo);
  const { gitlab, gitea, detection, pulls, pullsLoading, pullsError, restoreAccounts, detect, loadPulls, disconnect } = useForgeStore(
    useShallow((state) => ({
      gitlab: state.gitlab, gitea: state.gitea, detection: state.detection,
      pulls: state.pulls, pullsLoading: state.pullsLoading, pullsError: state.pullsError,
      restoreAccounts: state.restoreAccounts, detect: state.detect, loadPulls: state.loadPulls, disconnect: state.disconnect,
    })),
  );
  const [selected, setSelected] = useState<ForgePullRequest | null>(null);
  const [connectOpen, setConnectOpen] = useState<'gitlab' | 'gitea' | null>(null);

  useEffect(() => { void restoreAccounts(); }, [restoreAccounts]);
  useEffect(() => {
    if (currentRepo?.path) void detect(currentRepo.path);
    else useForgeStore.getState().resetTransient();
  }, [currentRepo?.path, detect]);
  useEffect(() => {
    if (detection) void loadPulls();
  }, [detection, loadPulls]);

  const account = detection?.kind === 'gitlab' ? gitlab : gitea;

  return (
    <div className="flex-1 h-full flex flex-col overflow-hidden">
      {/* 头部：平台徽标 + 命名空间 + 账号 + 操作 */}
      <div className="h-9 px-3 border-b border-border flex items-center gap-2 text-xs shrink-0 bg-accent/20">
        <Badge variant="info" className="text-[10px] font-semibold">{detection?.kind === 'gitea' ? 'Gitea' : 'GitLab'}</Badge>
        {detection && (
          <span className="font-mono text-[12px] text-foreground truncate">
            {detection.ownerPath}/{detection.repo}
          </span>
        )}
        <span className="flex-1" />
        {account?.user && (
          <span className="text-[11px] text-muted-foreground truncate max-w-40" title={account.server}>
            {t('forge.connected')} · {account.user.login}
          </span>
        )}
        {detection && (
          <>
            <Button variant="ghost" size="xs" disabled={pullsLoading} onClick={() => void loadPulls()} title={t('forge.refresh')}>
              <RefreshCw className={`h-3.5 w-3.5 ${pullsLoading ? 'animate-spin' : ''}`} />
            </Button>
            <Button
              variant="ghost"
              size="xs"
              title={t('forge.disconnect')}
              onClick={() => void disconnect(detection.kind).catch(() => {})}
              className="text-muted-foreground hover:text-git-deleted"
            >
              <Unplug className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </div>

      {/* 主体 */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
        {!currentRepo ? (
          <EmptyState title={t('forge.empty.noRepo')} />
        ) : !detection ? (
          <div className="space-y-3">
            <p className="text-[12px] text-muted-foreground px-1">{t('forge.empty.noDetect')}</p>
            <div className="flex items-center gap-2 px-1">
              <Button variant="outline" size="xs" onClick={() => setConnectOpen(connectOpen === 'gitlab' ? null : 'gitlab')}>
                {t('forge.connect.gitlab')}
              </Button>
              <Button variant="outline" size="xs" onClick={() => setConnectOpen(connectOpen === 'gitea' ? null : 'gitea')}>
                {t('forge.connect.gitea')}
              </Button>
            </div>
            {connectOpen && <ConnectForm kind={connectOpen} onDone={() => { setConnectOpen(null); if (currentRepo?.path) void detect(currentRepo.path); }} />}
          </div>
        ) : pullsLoading ? (
          <div className="py-10 flex items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : pullsError ? (
          <div className="space-y-2">
            <p className="text-[12px] text-git-deleted px-1">{t('forge.pulls.loadFailed')}: {pullsError}</p>
            {(detection.kind === 'gitlab' ? !gitlab : !gitea) && <ConnectForm kind={detection.kind} onDone={() => void loadPulls()} />}
          </div>
        ) : pulls.length === 0 ? (
          <EmptyState title={t('forge.pulls.empty')} />
        ) : (
          <ul className="space-y-1.5">
            {pulls.map((pull) => {
              const state = STATE_VARIANTS[pull.state] ?? STATE_VARIANTS.open;
              return (
                <li key={pull.number}>
                  <button
                    type="button"
                    onClick={() => setSelected(pull)}
                    className="w-full text-left rounded-lg border border-border bg-accent/10 px-3 py-2 flex items-center gap-2 hover:border-primary/40 transition-colors"
                  >
                    <Badge variant={state.variant} className="text-[10px] shrink-0">{t(state.key)}</Badge>
                    <GitMerge className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-[13px] text-foreground truncate flex-1" title={pull.title}>
                      {pull.draft && <span className="text-muted-foreground mr-1">[Draft]</span>}
                      {pull.title}
                    </span>
                    <span className="text-[11px] text-muted-foreground shrink-0 font-mono">!{pull.number}</span>
                    <span className="text-[11px] text-muted-foreground/80 shrink-0 max-w-28 truncate">{pull.author}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {selected && (
        <ForgePullDetailDialog
          pull={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
};

/** 连接表单：服务器地址 + PAT，验证通过即保存（keyring）并回调。 */
const ConnectForm: React.FC<{ kind: 'gitlab' | 'gitea'; onDone: () => void }> = ({ kind, onDone }) => {
  const { t } = useI18n();
  const connect = useForgeStore((state) => state.connect);
  const [server, setServer] = useState(kind === 'gitlab' ? 'https://gitlab.com' : '');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = () => {
    if (busy) return;
    if (!server.trim() || !token.trim()) {
      toast.error(t('forge.connectFailed'), t('forge.token'));
      return;
    }
    setBusy(true);
    connect(kind, server, token)
      .then(onDone)
      .catch((error: unknown) => toast.error(t('forge.connectFailed'), error instanceof Error ? error.message : String(error)))
      .finally(() => setBusy(false));
  };

  return (
    <div className="rounded-lg border border-border bg-accent/20 p-3 space-y-2">
      <input
        value={server}
        onChange={(event) => setServer(event.target.value)}
        placeholder={t('forge.serverUrl')}
        className="w-full h-7 px-2 rounded border border-border bg-background text-[12px] text-foreground placeholder:text-muted-foreground/70 focus:outline-hidden focus:border-primary"
      />
      <input
        type="password"
        value={token}
        onChange={(event) => setToken(event.target.value)}
        placeholder={t('forge.token')}
        autoComplete="off"
        className="w-full h-7 px-2 rounded border border-border bg-background text-[12px] text-foreground placeholder:text-muted-foreground/70 focus:outline-hidden focus:border-primary"
      />
      <p className="text-[11px] text-muted-foreground/70">{t('forge.tokenHint')}</p>
      <div className="flex justify-end">
        <Button variant="default" size="xs" disabled={busy} onClick={submit}>
          {busy && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
          {t('forge.connectSubmit')}
        </Button>
      </div>
    </div>
  );
};
