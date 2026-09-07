import React, { useState } from 'react';
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
} from 'lucide-react';
import { useGitHubStore } from '@/stores/githubStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/stores/toastStore';

interface GitHubAuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

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
    isLoading,
    error,
  } = useGitHubStore();

  const [tokenInput, setTokenInput] = useState('');

  if (!open) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) return;
    try {
      await login(tokenInput.trim());
      toast.success('GitHub 开发者账号连接成功！');
      setTokenInput('');
      onOpenChange(false);
    } catch (err: any) {
      toast.error('认证失败', err.message);
    }
  };

  const handleOpenTokenGenerator = () => {
    const url =
      'https://github.com/settings/tokens/new?scopes=repo,workflow,read:user&description=AuuGitDesktopClient';
    window.open(url, '_blank');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in-0 select-none"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-card shadow-2xl p-5 space-y-4 animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-foreground/10 text-foreground">
              <Github className="h-4 w-4" />
            </div>
            <div>
              <div className="font-semibold text-xs text-foreground">
                GitHub 开发者账号与凭证管理
              </div>
              <div className="text-[10px] text-muted-foreground">
                {currentOwner && currentRepoName
                  ? `当前已绑定远程仓库: ${currentOwner}/${currentRepoName}`
                  : '管理 GitHub API 认证以同步真实 Actions 与 PR'}
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* If already authenticated */}
        {isAuthenticated && user ? (
          <div className="space-y-4">
            <div className="p-3 rounded-lg border border-border bg-accent/30 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <img
                  src={user.avatar_url}
                  alt={user.login}
                  className="w-10 h-10 rounded-full border border-border/80 shadow-xs"
                />
                <div>
                  <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                    <span>{user.name || user.login}</span>
                    <Badge variant="success" className="h-3.5 text-[8px] px-1 gap-0.5">
                      <CheckCircle2 className="h-2.5 w-2.5" />
                      <span>已认证</span>
                    </Badge>
                  </div>
                  <div className="text-[11px] text-muted-foreground font-mono">@{user.login}</div>
                  {user.bio && (
                    <div className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">
                      {user.bio}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-1 items-end">
                <Button
                  variant="destructive"
                  size="xs"
                  onClick={() => {
                    logout();
                    toast.info('已注销 GitHub 认证凭证');
                  }}
                  className="h-6 text-xs gap-1"
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
                  className="h-6 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
                >
                  <RefreshCw className="h-2.5 w-2.5" />
                  <span>同步数据</span>
                </Button>
              </div>
            </div>

            <div className="text-[11px] text-muted-foreground leading-relaxed">
              Token 已在客户端加密保管，调用 GitHub API 读取工作流运行历史、检查状态及执行远程操作。
            </div>
          </div>
        ) : (
          /* Authentication Form */
          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <div className="p-2 rounded border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-medium text-foreground block">
                  GitHub Personal Access Token (PAT)
                </label>
                <button
                  type="button"
                  onClick={handleOpenTokenGenerator}
                  className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
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
                className="font-mono text-xs"
                autoFocus
              />
              <div className="text-[10px] text-muted-foreground leading-normal">
                点击上方链接可自动前往 GitHub 预设生成包含 <code className="bg-accent px-1 rounded font-mono">repo</code>,{' '}
                <code className="bg-accent px-1 rounded font-mono">workflow</code>,{' '}
                <code className="bg-accent px-1 rounded font-mono">read:user</code> 权限的专用 Token。
              </div>
            </div>

            <Button
              type="submit"
              disabled={!tokenInput.trim() || isLoading}
              className="w-full text-xs h-8 gap-1.5"
            >
              {isLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Key className="h-3.5 w-3.5" />
              )}
              <span>验证并连接真实 GitHub</span>
            </Button>

            <div className="border-t border-border pt-3">
              <div className="flex items-center justify-between text-xs">
                <div className="space-y-0.5">
                  <div className="font-medium text-foreground flex items-center gap-1">
                    <Sparkles className="h-3 w-3 text-amber-400" />
                    <span>高保真离线演示模式 (Demo Mode)</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    无需 GitHub 账号与 Token，即刻体验 Actions 与 PR 仪表盘
                  </div>
                </div>

                <Button
                  type="button"
                  variant={isDemoMode ? "default" : "outline"}
                  size="xs"
                  onClick={() => {
                    if (isDemoMode) {
                      disableDemoMode();
                      toast.info('已退出演示模式，正在尝试连接真实数据');
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
          </form>
        )}
      </div>
    </div>
  );
};
