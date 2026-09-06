import React, { useState } from 'react';
import {
  Settings,
  Terminal,
  Palette,
  Github,
  Keyboard,
  X,
  Check,
} from 'lucide-react';
import { useThemeStore, ThemeMode } from '@/stores/themeStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/utils/cn';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type SettingsTab = 'general' | 'git' | 'github' | 'appearance' | 'shortcuts';

export const SettingsDialog: React.FC<SettingsDialogProps> = ({
  open,
  onOpenChange,
}) => {
  const { theme, setTheme } = useThemeStore();
  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance');
  const [gitPath, setGitPath] = useState('git');
  const [autoFetchInterval, setAutoFetchInterval] = useState('10m');

  if (!open) return null;

  const shortcuts = [
    { key: 'Ctrl/Cmd + K', desc: '打开全局命令搜索面板 (Command Palette)' },
    { key: 'Ctrl/Cmd + P', desc: '推送本地提交到远程 (Git Push)' },
    { key: 'Ctrl/Cmd + L', desc: '拉取远程更新 (Git Pull)' },
    { key: 'Ctrl/Cmd + Shift + F', desc: '获取远程变更 (Git Fetch)' },
    { key: 'Ctrl/Cmd + Enter', desc: '提交暂存的文件 (Commit)' },
    { key: 'Ctrl/Cmd + B', desc: '新建分支 (Create Branch)' },
    { key: 'Ctrl/Cmd + T', desc: '新建标签 (Create Tag)' },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in-0 select-none"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-full max-w-2xl h-[480px] rounded-xl border border-border bg-card shadow-2xl flex overflow-hidden animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left Settings Navigation */}
        <div className="w-44 border-r border-border bg-sidebar/50 p-2 flex flex-col justify-between shrink-0">
          <div className="space-y-1">
            <div className="px-2 py-1.5 text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Settings className="h-4 w-4 text-primary" />
              <span>首选项设置</span>
            </div>

            <div className="pt-2 space-y-0.5">
              <button
                onClick={() => setActiveTab('appearance')}
                className={cn(
                  "w-full text-left px-2.5 py-1.5 rounded-md text-xs font-medium flex items-center gap-2 transition-colors",
                  activeTab === 'appearance'
                    ? "bg-accent text-accent-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
                )}
              >
                <Palette className="h-3.5 w-3.5" />
                <span>外观与主题</span>
              </button>

              <button
                onClick={() => setActiveTab('git')}
                className={cn(
                  "w-full text-left px-2.5 py-1.5 rounded-md text-xs font-medium flex items-center gap-2 transition-colors",
                  activeTab === 'git'
                    ? "bg-accent text-accent-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
                )}
              >
                <Terminal className="h-3.5 w-3.5" />
                <span>Git 核心配置</span>
              </button>

              <button
                onClick={() => setActiveTab('github')}
                className={cn(
                  "w-full text-left px-2.5 py-1.5 rounded-md text-xs font-medium flex items-center gap-2 transition-colors",
                  activeTab === 'github'
                    ? "bg-accent text-accent-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
                )}
              >
                <Github className="h-3.5 w-3.5" />
                <span>GitHub 账户</span>
              </button>

              <button
                onClick={() => setActiveTab('shortcuts')}
                className={cn(
                  "w-full text-left px-2.5 py-1.5 rounded-md text-xs font-medium flex items-center gap-2 transition-colors",
                  activeTab === 'shortcuts'
                    ? "bg-accent text-accent-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
                )}
              >
                <Keyboard className="h-3.5 w-3.5" />
                <span>快捷键清单</span>
              </button>
            </div>
          </div>

          <div className="p-2 text-[10px] text-muted-foreground/80 font-mono">
            v0.1.0 (Tauri 2 Preview)
          </div>
        </div>

        {/* Right Content Panel */}
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
          <div className="h-10 px-4 border-b border-border flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground capitalize">
              {activeTab === 'appearance' && '外观与色彩主题'}
              {activeTab === 'git' && 'Git 执行引擎与自动获取'}
              {activeTab === 'github' && 'GitHub 认证与安全凭证'}
              {activeTab === 'shortcuts' && '全局键盘快捷键'}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="flex-1 p-5 overflow-y-auto space-y-6 text-xs">
            {/* Appearance Tab */}
            {activeTab === 'appearance' && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-foreground block mb-2">
                    界面色彩主题
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { id: 'dark', name: '深色暗黑 (Dark)', desc: 'Linear 风格深邃暗色' },
                      { id: 'light', name: '明亮浅色 (Light)', desc: '清晰素雅浅灰' },
                      { id: 'system', name: '跟随系统 (System)', desc: '自动适配系统外观' },
                    ].map((item) => (
                      <button
                        key={item.id}
                        onClick={() => setTheme(item.id as ThemeMode)}
                        className={cn(
                          "p-3 rounded-lg border text-left transition-all relative",
                          theme === item.id
                            ? "border-primary bg-primary/10 text-foreground shadow-sm"
                            : "border-border hover:bg-accent/40 text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <div className="font-semibold text-xs text-foreground">{item.name}</div>
                        <div className="text-[10px] text-muted-foreground mt-1">{item.desc}</div>
                        {theme === item.id && (
                          <Check className="h-3.5 w-3.5 text-primary absolute top-2.5 right-2.5" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-2 border-t border-border">
                  <div className="flex items-center justify-between py-2">
                    <div>
                      <div className="font-medium text-foreground">紧凑模式 (Compact UI)</div>
                      <div className="text-[11px] text-muted-foreground">缩减元素内边距以显示更多内容</div>
                    </div>
                    <input type="checkbox" className="rounded border-input text-primary h-4 w-4" defaultChecked />
                  </div>
                </div>
              </div>
            )}

            {/* Git Tab */}
            {activeTab === 'git' && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-foreground block mb-1">
                    系统 Git CLI 可执行文件路径
                  </label>
                  <Input
                    value={gitPath}
                    onChange={(e) => setGitPath(e.target.value)}
                    placeholder="例如 git 或 C:\Program Files\Git\bin\git.exe"
                    className="font-mono"
                  />
                  <span className="text-[10px] text-muted-foreground mt-1 block">
                    当前检测系统 Git 版本: <span className="font-mono text-emerald-400">git 2.50.1</span>
                  </span>
                </div>

                <div>
                  <label className="text-xs font-medium text-foreground block mb-1">
                    后台自动获取变更 (Auto Fetch)
                  </label>
                  <select
                    value={autoFetchInterval}
                    onChange={(e) => setAutoFetchInterval(e.target.value)}
                    className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs"
                  >
                    <option value="never" className="bg-popover text-foreground">从不 (Never)</option>
                    <option value="5m" className="bg-popover text-foreground">每 5 分钟</option>
                    <option value="10m" className="bg-popover text-foreground">每 10 分钟 (推荐)</option>
                    <option value="30m" className="bg-popover text-foreground">每 30 分钟</option>
                  </select>
                </div>
              </div>
            )}

            {/* GitHub Tab */}
            {activeTab === 'github' && (
              <div className="space-y-4">
                <div className="p-4 rounded-xl border border-border bg-accent/20 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-full bg-foreground/10 text-foreground">
                      <Github className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-semibold text-xs text-foreground">GitHub 账号未连接</div>
                      <div className="text-[11px] text-muted-foreground">通过安全 OAuth 登录以查看 Actions 与 PR</div>
                    </div>
                  </div>
                  <Button size="sm" className="gap-1.5 text-xs">
                    <span>登录 GitHub</span>
                  </Button>
                </div>

                <div className="text-[11px] text-muted-foreground leading-relaxed">
                  提示：Token 将安全存储在系统安全凭据管理器（OS Credential Storage）中，禁止以明文写入磁盘。
                </div>
              </div>
            )}

            {/* Shortcuts Tab */}
            {activeTab === 'shortcuts' && (
              <div className="space-y-2">
                <div className="rounded-lg border border-border divide-y divide-border/60 overflow-hidden">
                  {shortcuts.map((item) => (
                    <div key={item.key} className="p-2.5 flex items-center justify-between text-xs hover:bg-accent/30 transition-colors">
                      <span className="text-foreground/90">{item.desc}</span>
                      <kbd className="inline-flex h-5 items-center rounded border border-border bg-muted/60 px-1.5 font-mono text-[10px] text-muted-foreground">
                        {item.key}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
