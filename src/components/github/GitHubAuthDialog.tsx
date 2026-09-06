import React, { useState } from 'react';
import {
  Github,
  Key,
  X,
  Sparkles,
  LogOut,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { useGitHubStore } from '@/stores/githubStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

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
    login,
    logout,
    enableDemoMode,
    disableDemoMode,
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
      setTokenInput('');
      onOpenChange(false);
    } catch {
      // Error handled in store
    }
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
                GitHub 开发者账号连接
              </div>
              <div className="text-[10px] text-muted-foreground">
                查看 Actions、Workflow Runs 与 Commit Checks
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
                  className="w-9 h-9 rounded-full border border-border"
                />
                <div>
                  <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                    <span>{user.name || user.login}</span>
                    <Badge variant="success" className="h-3.5 text-[8px] px-1">已连接</Badge>
                  </div>
                  <div className="text-[11px] text-muted-foreground font-mono">@{user.login}</div>
                </div>
              </div>
              <Button
                variant="destructive"
                size="xs"
                onClick={() => logout()}
                className="h-7 text-xs gap-1"
              >
                <LogOut className="h-3 w-3" />
                <span>注销断开</span>
              </Button>
            </div>

            <div className="text-[11px] text-muted-foreground leading-relaxed">
              Token 已在系统安全凭据存储中加密保管，未以明文形式存入 Git 仓库。
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
              <label className="text-[11px] font-medium text-foreground block">
                GitHub Personal Access Token
              </label>
              <Input
                type="password"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="ghp_xxxxxxxxxxxx"
                className="font-mono text-xs"
              />
              <div className="text-[10px] text-muted-foreground">
                建议勾选权限：<code className="bg-accent px-1 rounded">repo</code>,{' '}
                <code className="bg-accent px-1 rounded">workflow</code>,{' '}
                <code className="bg-accent px-1 rounded">read:user</code>
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
              <span>验证并连接</span>
            </Button>

            <div className="border-t border-border pt-3">
              <div className="flex items-center justify-between text-xs">
                <div className="space-y-0.5">
                  <div className="font-medium text-foreground flex items-center gap-1">
                    <Sparkles className="h-3 w-3 text-amber-400" />
                    <span>高保真演示模式 (Demo Mode)</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    无需 Token 即可体验 Actions & Checks
                  </div>
                </div>

                <Button
                  type="button"
                  variant={isDemoMode ? "default" : "outline"}
                  size="xs"
                  onClick={() => {
                    if (isDemoMode) {
                      disableDemoMode();
                    } else {
                      enableDemoMode();
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
