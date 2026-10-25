import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/i18n';
import { toast } from '@/stores/toastStore';
import { signingService, type SigningStatus, type SshPublicKeyInfo } from '@/services/git/SigningService';
import { Loader2, KeyRound, Power, PowerOff, Copy, Check } from 'lucide-react';

/**
 * 提交签名面板：仓库工具弹窗的"提交签名"标签页。
 * 配置读写走 git 管线（dev 可用）；SSH 密钥列举/生成是桌面专属命令，不可用时
 * 降级为手动填写密钥路径。启用/停用互斥防重入。
 */
export const SigningPanel: React.FC<{ repoPath: string }> = ({ repoPath }) => {
  const { t } = useI18n();
  const [status, setStatus] = useState<SigningStatus | null>(null);
  const [keys, setKeys] = useState<SshPublicKeyInfo[] | null>(null);
  const [selected, setSelected] = useState('');
  const [manualKey, setManualKey] = useState('');
  const [keygenReady, setKeygenReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [genOpen, setGenOpen] = useState(false);
  const [genName, setGenName] = useState('');
  const [genComment, setGenComment] = useState('');

  const refresh = useCallback(async () => {
    const next = await signingService.status(repoPath);
    setStatus(next);
    if (!next.signingKey) return;
    // 已配置的 signingkey 预选：能对上某个已知公钥就选中它。
    try {
      const listed = await signingService.listPublicKeys();
      setKeys(listed);
      const match = listed.find((key) => key.path.replace(/\\/g, '/') === next.signingKey.replace(/\\/g, '/'));
      setSelected(match ? match.path : next.signingKey);
      setManualKey(match ? '' : next.signingKey);
    } catch {
      setKeys(null);
      setManualKey(next.signingKey);
    }
  }, [repoPath]);

  useEffect(() => {
    setStatus(null);
    setKeys(null);
    setSelected('');
    setManualKey('');
    setCopied(false);
    void (async () => {
      try {
        setKeygenReady((await signingService.detectKeygen()) !== null);
      } catch {
        setKeygenReady(false);
      }
      try {
        const listed = await signingService.listPublicKeys();
        setKeys(listed);
      } catch {
        setKeys(null);
      }
      try {
        await refresh();
      } catch (error) {
        toast.error(t('signing.actionFailed'), error instanceof Error ? error.message : String(error));
      }
    })();
  }, [refresh, t]);

  const effectiveKey = selected || manualKey.trim();

  const run = useCallback(async (action: () => Promise<void>, successTitle?: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      await refresh();
      if (successTitle) toast.success(successTitle);
    } catch (error) {
      toast.error(t('signing.actionFailed'), error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [busy, refresh, t]);

  const submitGenerate = useCallback(() => {
    const name = genName.trim();
    if (!name) {
      toast.error(t('signing.generateFailed'), t('signing.generateInvalid'));
      return;
    }
    void run(async () => {
      try {
        const created = await signingService.generateKey(name, genComment.trim());
        setGenName('');
        setGenComment('');
        setGenOpen(false);
        const listed = await signingService.listPublicKeys();
        setKeys(listed);
        setSelected(created.path);
      } catch (error) {
        toast.error(t('signing.generateFailed'), error instanceof Error ? error.message : String(error));
      }
    });
  }, [genName, genComment, run, t]);

  const copyPublicKey = useCallback(async () => {
    const key = keys?.find((entry) => entry.path === selected);
    if (!key?.content) return;
    try {
      await navigator.clipboard.writeText(key.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* 剪贴板不可用时静默 */
    }
  }, [keys, selected]);

  if (!status) {
    return (
      <div className="py-8 flex items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const selectedKey = keys?.find((entry) => entry.path === selected) ?? null;

  return (
    <div className="space-y-3">
      {/* 状态与开关 */}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant={status.commitSign ? 'success' : 'outline'} className="text-[10px]">
          {status.commitSign ? t('signing.repoEnabled') : t('signing.repoDisabled')}
        </Badge>
        <span className="flex-1" />
        {status.commitSign ? (
          <Button variant="ghost" size="xs" disabled={busy} onClick={() => void run(() => signingService.disable(repoPath), t('signing.applyDone'))}>
            <PowerOff className="h-3.5 w-3.5" />
            <span>{t('signing.disable')}</span>
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="xs"
            disabled={busy}
            onClick={() => void run(() => signingService.enable(repoPath, effectiveKey), t('signing.applyDone'))}
          >
            <Power className="h-3.5 w-3.5" />
            <span>{t('signing.enable')}</span>
          </Button>
        )}
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>
      <p className="text-[12px] text-muted-foreground">{t('signing.commitSignNote')}</p>

      {/* 密钥选择 */}
      <section className="space-y-1.5">
        <div className="flex items-center gap-2">
          <h3 className="text-[12px] font-semibold text-foreground">{t('signing.keysTitle')}</h3>
          {keygenReady && (
            <Button variant="ghost" size="xs" onClick={() => setGenOpen((open) => !open)}>
              <KeyRound className="h-3 w-3" />
              <span>{t('signing.generate')}</span>
            </Button>
          )}
          {!keygenReady && <span className="text-[11px] text-muted-foreground/70">{t('signing.keygenMissing')}</span>}
        </div>

        {genOpen && (
          <div className="rounded-lg border border-border bg-accent/20 p-3 space-y-2">
            <p className="text-[11px] text-muted-foreground/80">{t('signing.generateHint')}</p>
            <div className="flex items-center gap-2">
              <input
                value={genName}
                onChange={(event) => setGenName(event.target.value)}
                placeholder={t('signing.generateName')}
                className="flex-1 h-7 px-2 rounded border border-border bg-background text-[12px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:border-primary"
              />
              <input
                value={genComment}
                onChange={(event) => setGenComment(event.target.value)}
                placeholder={t('signing.generateComment')}
                className="w-44 h-7 px-2 rounded border border-border bg-background text-[12px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:border-primary"
              />
            </div>
            <div className="flex justify-end">
              <Button variant="default" size="xs" disabled={busy} onClick={submitGenerate}>
                {t('signing.generateSubmit')}
              </Button>
            </div>
          </div>
        )}

        {keys !== null ? (
          keys.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">{t('signing.noKey')}</p>
          ) : (
            <ul className="space-y-1">
              {keys.map((key) => (
                <li key={key.path}>
                  <button
                    type="button"
                    onClick={() => { setSelected(selected === key.path ? '' : key.path); setManualKey(''); }}
                    className={`w-full text-left rounded border px-3 py-1.5 flex items-center gap-2 transition-colors ${
                      selected === key.path ? 'border-primary bg-primary/5' : 'border-border bg-accent/10 hover:border-primary/40'
                    }`}
                  >
                    <span className="font-mono text-[12px] text-foreground truncate flex-1">{key.name}</span>
                    {key.fingerprint && (
                      <span className="text-[11px] text-muted-foreground/80 shrink-0 max-w-52 truncate" title={key.fingerprint}>
                        {key.fingerprint}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : (
          <p className="text-[11px] text-muted-foreground/70">{t('signing.selectKey')}</p>
        )}

        {/* 手动路径输入：非桌面环境或想用列表外密钥时的通用通道。 */}
        <input
          value={manualKey}
          onChange={(event) => { setManualKey(event.target.value); setSelected(''); }}
          placeholder={t('signing.manualKey')}
          className="w-full h-7 px-2 rounded border border-border bg-background text-[12px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:border-primary"
        />
      </section>

      {/* 选中密钥的公钥展示 */}
      {selectedKey?.content && (
        <section className="space-y-1.5">
          <div className="flex items-center gap-2">
            <h3 className="text-[12px] font-semibold text-foreground">{t('signing.pubKey')}</h3>
            <Button variant="ghost" size="xs" onClick={() => void copyPublicKey()}>
              {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
            </Button>
          </div>
          <pre className="rounded border border-border bg-accent/10 px-3 py-2 text-[11px] font-mono text-muted-foreground whitespace-pre-wrap break-all max-h-24 overflow-y-auto">
            {selectedKey.content}
          </pre>
          <p className="text-[11px] text-muted-foreground/70">{t('signing.verifyNote')}</p>
        </section>
      )}
    </div>
  );
};
