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
import { useGitHubStore } from '@/stores/githubStore';
import { gitHubOAuthService, DeviceCodeResponse } from '@/services/github/GitHubOAuthService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/stores/toastStore';
import { cn } from '@/utils/cn';

interface GitHubAuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const openExternalUrl = async (url: string) => {
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
    isDemoMode,
    currentOwner,
    currentRepoName,
    login,
    logout,
    enableDemoMode,
    disableDemoMode,
    refreshActions,
    isLoading: isStoreLoading,
  } = useGitHubStore();

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

  // Clean up polling if dialog is closed
  useEffect(() => {
    if (!open) {
      handleCancelOAuth();
      setOauthError(null);
      setPatError(null);
    }
  }, [open, handleCancelOAuth]);

  if (!open) return null;

  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setHasCopied(true);
      toast.success('核验码已复制到剪贴板！');
      setTimeout(() => setHasCopied(false), 3000);
    } catch {
      toast.info(`核验码: ${code}`);
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
      toast.success('GitHub OAuth 授权登录成功！');
      handleCancelOAuth();
      onOpenChange(false);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // 用户主动取消，不报错
        return;
      }
      console.error('OAuth 授权失败:', err);
      setOauthError(err.message || 'OAuth 授权失败');
      toast.error('授权未完成', err.message);
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
      toast.success('GitHub 开发者账号连接成功！');
      setTokenInput('');
      onOpenChange(false);
    } catch (err: any) {
      setPatError(err.message || 'Token 验证失败');
      toast.error('认证失败', err.message);
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in-0 select-none"
      onClick={() => onOpenChange(false)}
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
                <span>GitHub 开发者账号认证</span>
                <Badge variant="outline" className="text-[10px] font-normal py-0 h-4 border-primary/30 text-primary">
                  OAuth 2.0
                </Badge>
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                {currentOwner && currentRepoName
                  ? `当前已关联仓库: ${currentOwner}/${currentRepoName}`
                  : '连接 GitHub 以同步云端 Actions 工作流、PR 与代码审查'}
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
                    <Badge variant="success" className="h-4 text-[9px] px-1.5 gap-0.5">
                      <CheckCircle2 className="h-2.5 w-2.5" />
                      <span>已连接</span>
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground font-mono">@{user.login}</div>
                  {user.bio && (
                    <div className="text-[11px] text-muted-foreground line-clamp-1 mt-1">
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
                    toast.info('已注销 GitHub 认证凭证');
                  }}
                  className="h-7 text-xs gap-1"
                >
                  <LogOut className="h-3 w-3" />
                  <span>注销断开</span>
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={async () => {
                    await refreshActions();
                    toast.success('已刷新 GitHub 数据');
                  }}
                  className="h-7 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
                >
                  <RefreshCw className="h-3 w-3" />
                  <span>刷新同步</span>
                </Button>
              </div>
            </div>

            <div className="text-xs text-muted-foreground leading-relaxed p-3 rounded-lg bg-accent/10 border border-border/50">
              已具备 <span className="text-foreground font-mono font-medium">repo</span>、
              <span className="text-foreground font-mono font-medium">workflow</span> 及{' '}
              <span className="text-foreground font-mono font-medium">read:user</span> 权限。可直接在客户端内触发 GitHub Actions 或查看 PR 详情。
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
                <span>GitHub OAuth 快速登录 (推荐)</span>
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
                <span>个人访问令牌 (PAT)</span>
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
                          <div className="font-medium text-foreground">免配置 Token · 安全极速授权</div>
                          <div className="text-muted-foreground leading-relaxed">
                            点击下方按钮将获取一组一次性 8 位核验码，并自动打开 GitHub 官方授权页面。在网页中点击确认后，客户端将自动完成登录握手。
                          </div>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-border/50 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                        <span className="px-2 py-0.5 rounded bg-background/60 border border-border">📦 仓库同步与 PR 查看</span>
                        <span className="px-2 py-0.5 rounded bg-background/60 border border-border">⚡ Actions 工作流查看与触发</span>
                        <span className="px-2 py-0.5 rounded bg-background/60 border border-border">🛡️ GitHub 官方 Device Flow 协议</span>
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
                          <span>正在获取 GitHub 授权码...</span>
                        </>
                      ) : (
                        <>
                          <Github className="h-4 w-4" />
                          <span>一键开启 GitHub OAuth 授权</span>
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
                          <span>授权码已生成 · 请在网页中确认</span>
                        </span>
                        {pollInfo && (
                          <span className="text-[10px] font-mono text-muted-foreground">
                            有效剩余: {formatRemainingTime(pollInfo.remainingSeconds)}
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
                          title="复制核验码"
                        >
                          {hasCopied ? (
                            <>
                              <Check className="h-4 w-4" />
                              <span className="text-xs">已复制</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-4 w-4" />
                              <span className="text-xs">复制</span>
                            </>
                          )}
                        </Button>
                      </div>

                      <div className="text-[11px] text-muted-foreground leading-relaxed flex items-center justify-between">
                        <span>已自动将授权码复制到剪贴板并尝试调起浏览器。</span>
                        <button
                          type="button"
                          onClick={() => openExternalUrl(deviceData.verification_uri)}
                          className="text-primary hover:underline inline-flex items-center gap-0.5 shrink-0 font-medium ml-2"
                        >
                          <span>重新打开网页</span>
                          <ExternalLink className="h-3 w-3" />
                        </button>
                      </div>
                    </div>

                    {/* Dynamic Polling Status Card */}
                    <div className="p-3 rounded-lg border border-border bg-accent/10 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2.5">
                        <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                        <span className="text-muted-foreground">
                          正在等待您在 GitHub 页面上授权确认 (第 {pollInfo?.attempt || 1} 次轮询)...
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={handleCancelOAuth}
                        className="h-6 text-[11px] text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                      >
                        取消授权
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
                      className="text-[11px] text-primary hover:underline flex items-center gap-0.5"
                    >
                      <span>一键前往网页生成</span>
                      <ExternalLink className="h-2.5 w-2.5" />
                    </button>
                  </div>

                  <Input
                    type="password"
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx 或 github_pat_..."
                    className="font-mono text-xs h-9"
                    autoFocus
                  />
                  <div className="text-[10px] text-muted-foreground leading-normal">
                    需包含 <code className="bg-accent px-1 rounded font-mono">repo</code>,{' '}
                    <code className="bg-accent px-1 rounded font-mono">workflow</code>,{' '}
                    <code className="bg-accent px-1 rounded font-mono">read:user</code> 权限。
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
                  <span>验证并连接真实 GitHub</span>
                </Button>
              </form>
            )}

            {/* Demo Mode Toggle */}
            <div className="border-t border-border pt-3">
              <div className="flex items-center justify-between text-xs">
                <div className="space-y-0.5">
                  <div className="font-medium text-foreground flex items-center gap-1">
                    <Sparkles className="h-3 w-3 text-amber-400" />
                    <span>离线演示模式 (Demo Mode)</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    无需 GitHub 账号，即刻体验 Actions 与 PR 仪表盘
                  </div>
                </div>

                <Button
                  type="button"
                  variant={isDemoMode ? "default" : "outline"}
                  size="xs"
                  onClick={() => {
                    if (isDemoMode) {
                      disableDemoMode();
                      toast.info('已退出演示模式');
                    } else {
                      enableDemoMode();
                      toast.success('已启用高保真演示模式');
                      onOpenChange(false);
                    }
                  }}
                  className="h-6 text-[10px]"
                >
                  {isDemoMode ? '已启用演示' : '一键启用演示'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
