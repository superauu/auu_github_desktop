import { ModalSurface } from '@/components/ui/ModalSurface';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Github,
  Key,
  X,
  Sparkles,
  LogOut,
  Loader2,
  AlertCircle,
  ExternalLink,
  CheckCircle2,
  RefreshCw,
  Copy,
  Check,
  ShieldCheck,
  ArrowRight,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useI18n } from '@/i18n';
import { useGitHubStore } from '@/stores/githubStore';
import { gitHubOAuthService, DeviceCodeResponse } from '@/services/github/GitHubOAuthService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/stores/toastStore';
import { cn } from '@/utils/cn';
import { validateGitHubUrl } from '@/utils/externalUrl';

interface GitHubAuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const openExternalUrl = async (url: string) => {
  url = validateGitHubUrl(url);
  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  if (isTauri) {
    try {
      const { open } = await import('@tauri-apps/plugin-shell');
      await open(url);
      return;
    } catch {
      // fallback
    }
  }
  window.open(url, '_blank');
};

export const GitHubAuthDialog: React.FC<GitHubAuthDialogProps> = ({
  open,
  onOpenChange,
}) => {
  const {
    user,
    isAuthenticated,
    currentOwner,
    currentRepoName,
    isAddingProfile,
    login,
    logout,
    refreshActions,
    isLoading: isStoreLoading,
  } = useGitHubStore(useShallow(state => ({ user: state.user, isAuthenticated: state.isAuthenticated, currentOwner: state.currentOwner, currentRepoName: state.currentRepoName, isAddingProfile: state.isAddingProfile, login: state.login, logout: state.logout, refreshActions: state.refreshActions, isLoading: state.isLoading })));
  const { t } = useI18n();

  const [authMode, setAuthMode] = useState<'oauth' | 'pat'>('oauth');
  const [tokenInput, setTokenInput] = useState('');
  const [patError, setPatError] = useState<string | null>(null);

  // Device Flow State
  const [deviceData, setDeviceData] = useState<DeviceCodeResponse | null>(null);
  const [isStartingOAuth, setIsStartingOAuth] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [pollInfo, setPollInfo] = useState<{ attempt: number; remainingSeconds: number } | null>(null);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [hasCopied, setHasCopied] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);

  const handleCancelOAuth = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setDeviceData(null);
    setIsPolling(false);
    setIsStartingOAuth(false);
    setPollInfo(null);
  }, []);

  // Clean up polling if dialog is closed；若正处于“添加账号”流程且未完成登录，则回退到原账号
  useEffect(() => {
    if (!open) {
      handleCancelOAuth();
      setOauthError(null);
      setPatError(null);
      useGitHubStore.getState().cancelAddProfile();
    }
  }, [open, handleCancelOAuth]);

  if (!open) return null;

  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setHasCopied(true);
      toast.success(t('auth.codeCopied'));
      setTimeout(() => setHasCopied(false), 3000);
    } catch {
      toast.info(`${t('auth.codeIs')}: ${code}`);
    }
  };

  const handleStartOAuth = async () => {
    setOauthError(null);
    setIsStartingOAuth(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await gitHubOAuthService.requestDeviceCode();
      setDeviceData(res);
      setIsStartingOAuth(false);
      setIsPolling(true);

      // 自动复制核验码并自动唤起浏览器
      await handleCopyCode(res.user_code);
      await openExternalUrl(res.verification_uri);

      // 开始轮询换取 Access Token
      const token = await gitHubOAuthService.pollForToken(
        res.device_code,
        res.interval,
        res.expires_in,
        {
          signal: controller.signal,
          onPollStep: (step) => {
            setPollInfo({
              attempt: step.attempt,
              remainingSeconds: step.remainingSeconds,
            });
          },
        }
      );

      // 成功获取 Token，调用登录流程
      await login(token);
      toast.success(t('auth.oauthSuccess'));
      handleCancelOAuth();
      onOpenChange(false);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // 用户主动取消，不报错
        return;
      }
      console.error(t('auth.oauthFailedLog'), err);
      setOauthError(err.message || t('auth.oauthFailed'));
      toast.error(t('auth.incomplete'), err.message);
      setIsPolling(false);
      setIsStartingOAuth(false);
    }
  };

  const handlePatLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) return;
    setPatError(null);
    try {
      await login(tokenInput.trim());
      toast.success(t('auth.patSuccess'));
      setTokenInput('');
      onOpenChange(false);
    } catch (err: any) {
      setPatError(err.message || t('auth.patVerifyFailed'));
      toast.error(t('auth.authFailed'), err.message);
    }
  };

  const handleOpenTokenGenerator = () => {
    const url =
      'https://github.com/settings/tokens/new?scopes=repo,workflow,read:user&description=AuuGitDesktopClient';
    openExternalUrl(url);
  };

  const formatRemainingTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <ModalSurface onDismiss={() => onOpenChange(false)} dismissible label={'GitHub'}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in-0 select-none"
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl p-6 space-y-5 animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20">
              <Github className="h-5 w-5" />
            </div>
            <div>
              <div className="font-semibold text-sm text-foreground flex items-center gap-2">
                <span>{t('auth.title')}</span>
                <Badge variant="outline" className="text-[11px] font-normal py-0 h-4 border-primary/30 text-primary">
                  OAuth 2.0
                </Badge>
              </div>
              <div className="text-[12px] text-muted-foreground mt-0.5">
                {isAddingProfile
                  ? t('profiles.addingHint')
                  : currentOwner && currentRepoName
                    ? `${t('auth.boundRepo')}: ${currentOwner}/${currentRepoName}`
                    : t('auth.boundNone')}
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground rounded-lg"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* If already authenticated */}
        {isAuthenticated && user ? (
          <div className="space-y-4">
            <div className="p-4 rounded-xl border border-border bg-accent/20 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img
                  src={user.avatar_url}
                  alt={user.login}
                  className="w-12 h-12 rounded-full border-2 border-primary/20 shadow-sm"
                />
                <div>
                  <div className="font-semibold text-sm text-foreground flex items-center gap-2">
                    <span>{user.name || user.login}</span>
                    <Badge variant="success" className="h-4 text-[10px] px-1.5 gap-0.5">
                      <CheckCircle2 className="h-2.5 w-2.5" />
                      <span>{t('common.connected')}</span>
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground font-mono">@{user.login}</div>
                  {user.bio && (
                    <div className="text-[12px] text-muted-foreground line-clamp-1 mt-1">
                      {user.bio}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-1.5 items-end">
                <Button
                  variant="destructive"
                  size="xs"
                  onClick={() => {
                    logout();
                    toast.info(t('auth.logoutToast'));
                    // 登出会按 Profile 语义移除当前凭据并自动切到剩余账号，关闭对话框避免中间态闪烁
                    onOpenChange(false);
                  }}
                  className="h-7 text-xs gap-1"
                >
                  <LogOut className="h-3 w-3" />
                  <span>{t('auth.logout')}</span>
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={async () => {
                    await refreshActions();
                    toast.success(t('auth.refreshToast'));
                  }}
                  className="h-7 text-[12px] gap-1 text-muted-foreground hover:text-foreground"
                >
                  <RefreshCw className="h-3 w-3" />
                  <span>{t('auth.refresh')}</span>
                </Button>
              </div>
            </div>

            <div className="text-xs text-muted-foreground leading-relaxed p-3 rounded-lg bg-accent/10 border border-border/50">
              {t('auth.scopesPrefix')} <span className="text-foreground font-mono font-medium">repo</span>、
              <span className="text-foreground font-mono font-medium">workflow</span> {t('auth.scopesDot')}{' '}
              <span className="text-foreground font-mono font-medium">read:user</span> {t('auth.scopesSuffix')}
            </div>
          </div>
        ) : (
          /* Authentication Form */
          <div className="space-y-4">
            {/* Mode Switch Tabs */}
            <div className="flex rounded-lg bg-muted/60 p-1 border border-border/60">
              <button
                type="button"
                onClick={() => {
                  if (isPolling) handleCancelOAuth();
                  setAuthMode('oauth');
                }}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition-all',
                  authMode === 'oauth'
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                <span>{t('auth.oauthTab')}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (isPolling) handleCancelOAuth();
                  setAuthMode('pat');
                }}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition-all',
                  authMode === 'pat'
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Key className="h-3.5 w-3.5" />
                <span>{t('auth.patTab')}</span>
              </button>
            </div>

            {/* Mode 1: OAuth Device Flow */}
            {authMode === 'oauth' && (
              <div className="space-y-4">
                {oauthError && (
                  <div className="p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{oauthError}</span>
                  </div>
                )}

                {!deviceData ? (
                  /* Ready to start OAuth */
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl border border-border/80 bg-accent/20 space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-lg bg-primary/10 text-primary mt-0.5">
                          <Sparkles className="h-4 w-4" />
                        </div>
                        <div className="space-y-1 text-xs">
                          <div className="font-medium text-foreground">{t('auth.oauthCard.title')}</div>
                          <div className="text-muted-foreground leading-relaxed">
                            {t('auth.oauthCard.desc')}
                          </div>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-border/50 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                        <span className="px-2 py-0.5 rounded bg-background/60 border border-border">{t('auth.badge.repo')}</span>
                        <span className="px-2 py-0.5 rounded bg-background/60 border border-border">{t('auth.badge.actions')}</span>
                        <span className="px-2 py-0.5 rounded bg-background/60 border border-border">{t('auth.badge.deviceFlow')}</span>
                      </div>
                    </div>

                    <Button
                      onClick={handleStartOAuth}
                      disabled={isStartingOAuth}
                      className="w-full text-xs h-9 gap-2 shadow-sm font-medium"
                    >
                      {isStartingOAuth ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>{t('auth.gettingCode')}</span>
                        </>
                      ) : (
                        <>
                          <Github className="h-4 w-4" />
                          <span>{t('auth.startOauth')}</span>
                          <ArrowRight className="h-3.5 w-3.5 ml-auto opacity-70" />
                        </>
                      )}
                    </Button>
                  </div>
                ) : (
                  /* OAuth In Progress (Code Display & Polling) */
                  <div className="space-y-4 animate-in fade-in-50">
                    <div className="p-4 rounded-xl border border-primary/40 bg-primary/5 space-y-3.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                          <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                          <span>{t('auth.codeReady')}</span>
                        </span>
                        {pollInfo && (
                          <span className="text-[11px] font-mono text-muted-foreground">
                            {t('auth.remaining')}: {formatRemainingTime(pollInfo.remainingSeconds)}
                          </span>
                        )}
                      </div>

                      {/* Big Monospace User Code Block */}
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-background/90 border-2 border-primary/30 rounded-xl py-2.5 px-4 text-center font-mono text-2xl font-bold tracking-widest text-primary shadow-inner select-all">
                          {deviceData.user_code}
                        </div>
                        <Button
                          variant={hasCopied ? "default" : "outline"}
                          size="sm"
                          onClick={() => handleCopyCode(deviceData.user_code)}
                          className={cn(
                            "h-12 px-3 gap-1.5 rounded-xl shrink-0 transition-colors",
                            hasCopied && "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600"
                          )}
                          title={t('auth.copyCode')}
                        >
                          {hasCopied ? (
                            <>
                              <Check className="h-4 w-4" />
                              <span className="text-xs">{t('logs.copied')}</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-4 w-4" />
                              <span className="text-xs">{t('logs.copy')}</span>
                            </>
                          )}
                        </Button>
                      </div>

                      <div className="text-[12px] text-muted-foreground leading-relaxed flex items-center justify-between">
                        <span>{t('auth.autoCopied')}</span>
                        <button
                          type="button"
                          onClick={() => { void openExternalUrl(deviceData.verification_uri).catch(error => toast.error(t('auth.oauthFailed'), error.message)); }}
                          className="text-primary hover:underline inline-flex items-center gap-0.5 shrink-0 font-medium ml-2"
                        >
                          <span>{t('auth.reopenPage')}</span>
                          <ExternalLink className="h-3 w-3" />
                        </button>
                      </div>
                    </div>

                    {/* Dynamic Polling Status Card */}
                    <div className="p-3 rounded-lg border border-border bg-accent/10 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2.5">
                        <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                        <span className="text-muted-foreground">
                          {t('auth.waitingConfirm')} ({t('auth.pollAttempt').replace('{n}', String(pollInfo?.attempt || 1))})...
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={handleCancelOAuth}
                        className="h-6 text-[12px] text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                      >
                        {t('auth.cancelOauth')}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Mode 2: PAT Token Input */}
            {authMode === 'pat' && (
              <form onSubmit={handlePatLogin} className="space-y-4">
                {patError && (
                  <div className="p-2.5 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs flex items-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    <span>{patError}</span>
                  </div>
                )}

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-foreground block">
                      GitHub Personal Access Token (PAT)
                    </label>
                    <button
                      type="button"
                      onClick={handleOpenTokenGenerator}
                      className="text-[12px] text-primary hover:underline flex items-center gap-0.5"
                    >
                      <span>{t('auth.openGeneratePage')}</span>
                      <ExternalLink className="h-2.5 w-2.5" />
                    </button>
                  </div>

                  <Input
                    type="password"
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    placeholder={t('auth.patPlaceholder')}
                    className="font-mono text-xs h-9"
                    autoFocus
                  />
                  <div className="text-[11px] text-muted-foreground leading-normal">
                    {t('auth.patScopesPrefix')} <code className="bg-accent px-1 rounded font-mono">repo</code>,{' '}
                    <code className="bg-accent px-1 rounded font-mono">workflow</code>,{' '}
                    <code className="bg-accent px-1 rounded font-mono">read:user</code> {t('auth.scopesDot')}
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={!tokenInput.trim() || isStoreLoading}
                  className="w-full text-xs h-8 gap-1.5"
                >
                  {isStoreLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Key className="h-3.5 w-3.5" />
                  )}
                  <span>{t('settings.github.login')}</span>
                </Button>
              </form>
            )}

          </div>
        )}
      </div>
    </ModalSurface>
  );
};
