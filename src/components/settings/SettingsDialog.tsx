import React, { useState, useEffect } from 'react';
import {
  Settings,
  Terminal,
  Palette,
  Github,
  Keyboard,
  X,
  Check,
  RotateCcw,
  LayoutGrid,
  Sparkles,
  RefreshCw,
  Cpu,
} from 'lucide-react';
import { useThemeStore, ThemeMode } from '@/stores/themeStore';
import { useLayoutStore } from '@/stores/layoutStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { toast } from '@/stores/toastStore';
import { useGitHubStore } from '@/stores/githubStore';
import { gitService } from '@/services/git/GitService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, LogOut, Key } from 'lucide-react';
import { cn } from '@/utils/cn';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenGitHubAuth?: () => void;
}

type SettingsTab = 'general' | 'git' | 'github' | 'ai' | 'appearance' | 'shortcuts';

export const SettingsDialog: React.FC<SettingsDialogProps> = ({
  open,
  onOpenChange,
  onOpenGitHubAuth,
}) => {
  const { theme, setTheme } = useThemeStore();
  const { resetLayout } = useLayoutStore();
  const { user, isAuthenticated, logout } = useGitHubStore();
  const {
    gitCliPath,
    setGitCliPath,
    compactMode,
    setCompactMode,
    autoFetchInterval,
    setAutoFetchInterval,
    aiConfig,
    setAiConfig,
  } = useSettingsStore();

  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance');
  const [gitVersion, setGitVersion] = useState<string>('正在检测系统 Git 版本...');
  const [isDetectingGit, setIsDetectingGit] = useState<boolean>(false);
  const [isTestingAi, setIsTestingAi] = useState<boolean>(false);

  // Load real Git version dynamically
  const detectGitVersion = async () => {
    setIsDetectingGit(true);
    try {
      const ver = await gitService.getGitVersion();
      setGitVersion(ver || '未检测到可用 Git CLI');
    } catch (err: any) {
      setGitVersion('检测失败: 请确认 Git 路径正确配置');
    } finally {
      setIsDetectingGit(false);
    }
  };

  useEffect(() => {
    if (open) {
      detectGitVersion();
    }
  }, [open, gitCliPath]);

  // Test custom AI connection
  const handleTestAiConnection = async () => {
    if (aiConfig.provider === 'builtin') {
      toast.success('本地深度 Diff 语法分析引擎已就绪', '纯本地免 Key 模式，零网络延迟');
      return;
    }

    if (!aiConfig.apiKey.trim()) {
      toast.warning('请输入 API Key 后再测试连接');
      return;
    }

    setIsTestingAi(true);
    try {
      const endpoint = aiConfig.endpoint.replace(/\/+$/, '') + '/chat/completions';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${aiConfig.apiKey.trim()}`,
        },
        body: JSON.stringify({
          model: aiConfig.model || 'deepseek-chat',
          messages: [{ role: 'user', content: 'Ping! Output pong.' }],
          max_tokens: 5,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errorText.slice(0, 100)}`);
      }

      toast.success('AI API 连接测试成功！', `已成功连通 ${aiConfig.model}`);
    } catch (err: any) {
      toast.error('AI 连接测试失败', err.message);
    } finally {
      setIsTestingAi(false);
    }
  };

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
        className="w-full max-w-2xl h-[500px] rounded-xl border border-border bg-card shadow-2xl flex overflow-hidden animate-in zoom-in-95"
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
                onClick={() => setActiveTab('ai')}
                className={cn(
                  "w-full text-left px-2.5 py-1.5 rounded-md text-xs font-medium flex items-center gap-2 transition-colors",
                  activeTab === 'ai'
                    ? "bg-accent text-accent-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
                )}
              >
                <Sparkles className="h-3.5 w-3.5 text-sky-400" />
                <span>AI 智能引擎</span>
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
              {activeTab === 'ai' && 'AI 提交说明生成引擎配置'}
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
                      <div className="text-[11px] text-muted-foreground">缩减元素内边距与字体行高以展示更多代码</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={compactMode}
                      onChange={(e) => {
                        setCompactMode(e.target.checked);
                        toast.info(e.target.checked ? '已开启紧凑排版模式' : '已恢复标准排版模式');
                      }}
                      className="rounded border-input text-primary h-4 w-4 cursor-pointer"
                    />
                  </div>
                </div>

                <div className="pt-2 border-t border-border">
                  <div className="flex items-center justify-between py-2">
                    <div>
                      <div className="font-medium text-foreground flex items-center gap-1.5">
                        <LayoutGrid className="h-3.5 w-3.5 text-primary" />
                        <span>分栏与区域宽度布局 (Panel Layout)</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        已支持自由拖拽左侧栏、右侧提交面板及子列表分栏线，位置自动存入本地存储
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        resetLayout();
                        toast.success('已恢复默认区域宽度布局');
                      }}
                      className="gap-1 text-xs shrink-0"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>恢复默认布局</span>
                    </Button>
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
                  <div className="flex items-center gap-2">
                    <Input
                      value={gitCliPath}
                      onChange={(e) => setGitCliPath(e.target.value)}
                      placeholder="例如 git 或 C:\Program Files\Git\bin\git.exe"
                      className="font-mono text-xs"
                    />
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={detectGitVersion}
                      disabled={isDetectingGit}
                      className="h-8 px-2.5 shrink-0 gap-1 text-xs"
                    >
                      <RefreshCw className={cn("h-3 w-3", isDetectingGit && "animate-spin")} />
                      <span>检测</span>
                    </Button>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-1.5">
                    <span>当前检测到的系统 Git 版本:</span>
                    <span className="font-mono font-medium text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                      {gitVersion}
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-border">
                  <label className="text-xs font-medium text-foreground block mb-1">
                    后台自动获取变更 (Auto Fetch)
                  </label>
                  <select
                    value={autoFetchInterval}
                    onChange={(e) => {
                      const val = e.target.value as any;
                      setAutoFetchInterval(val);
                      toast.info(`已设置自动获取间隔: ${val === 'never' ? '从不' : val}`);
                    }}
                    className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs"
                  >
                    <option value="never" className="bg-popover text-foreground">从不 (Never)</option>
                    <option value="5m" className="bg-popover text-foreground">每 5 分钟</option>
                    <option value="10m" className="bg-popover text-foreground">每 10 分钟 (推荐)</option>
                    <option value="30m" className="bg-popover text-foreground">每 30 分钟</option>
                  </select>
                  <div className="text-[10px] text-muted-foreground mt-1">
                    开启后将在后台静默执行 git fetch，实时更新 Ahead/Behind 提交计数。
                  </div>
                </div>
              </div>
            )}

            {/* AI Tab */}
            {activeTab === 'ai' && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-foreground block mb-2">
                    AI 提交说明生成策略
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setAiConfig({ provider: 'builtin' })}
                      className={cn(
                        "p-3 rounded-lg border text-left transition-all relative space-y-1",
                        aiConfig.provider === 'builtin'
                          ? "border-primary bg-primary/10 text-foreground shadow-sm"
                          : "border-border hover:bg-accent/40 text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                        <Cpu className="h-3.5 w-3.5 text-primary" />
                        <span>本地深度 Diff 引擎</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        无需 API Key，通过深入解析暂存区语义生成规范提交，零网络延迟与百分百数据安全
                      </div>
                      {aiConfig.provider === 'builtin' && (
                        <Check className="h-3.5 w-3.5 text-primary absolute top-2.5 right-2.5" />
                      )}
                    </button>

                    <button
                      onClick={() => setAiConfig({ provider: 'openai-compatible' })}
                      className={cn(
                        "p-3 rounded-lg border text-left transition-all relative space-y-1",
                        aiConfig.provider === 'openai-compatible'
                          ? "border-primary bg-primary/10 text-foreground shadow-sm"
                          : "border-border hover:bg-accent/40 text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5 text-sky-400" />
                        <span>自定义大模型 API</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        支持接入 DeepSeek、OpenAI、Ollama 或各类兼容器接口，智能生成自然语言 Commit 摘要
                      </div>
                      {aiConfig.provider === 'openai-compatible' && (
                        <Check className="h-3.5 w-3.5 text-primary absolute top-2.5 right-2.5" />
                      )}
                    </button>
                  </div>
                </div>

                {aiConfig.provider === 'openai-compatible' && (
                  <div className="p-3.5 rounded-xl border border-border/80 bg-accent/20 space-y-3 animate-in fade-in">
                    <div>
                      <label className="text-[11px] font-medium text-foreground block mb-1">
                        API 端点 (Base URL)
                      </label>
                      <Input
                        value={aiConfig.endpoint}
                        onChange={(e) => setAiConfig({ endpoint: e.target.value })}
                        placeholder="例如 https://api.deepseek.com/v1 或 https://api.openai.com/v1"
                        className="font-mono text-xs"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-medium text-foreground block mb-1">
                          模型名称 (Model)
                        </label>
                        <Input
                          value={aiConfig.model}
                          onChange={(e) => setAiConfig({ model: e.target.value })}
                          placeholder="例如 deepseek-chat 或 gpt-4o-mini"
                          className="font-mono text-xs"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-medium text-foreground block mb-1">
                          API Key
                        </label>
                        <Input
                          type="password"
                          value={aiConfig.apiKey}
                          onChange={(e) => setAiConfig({ apiKey: e.target.value })}
                          placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxx"
                          className="font-mono text-xs"
                        />
                      </div>
                    </div>

                    <div className="pt-1 flex items-center justify-end">
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={handleTestAiConnection}
                        disabled={isTestingAi}
                        className="h-7 text-xs gap-1.5 border-sky-500/40 text-sky-300 hover:bg-sky-500/10"
                      >
                        <Sparkles className="h-3 w-3" />
                        <span>{isTestingAi ? '正在测试...' : '测试连接 (Test Connection)'}</span>
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* GitHub Tab */}
            {activeTab === 'github' && (
              <div className="space-y-4">
                {isAuthenticated && user ? (
                  <div className="p-4 rounded-xl border border-border bg-accent/20 flex items-center justify-between">
                    <div className="flex items-center gap-3">
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
                            <span>已连接</span>
                          </Badge>
                        </div>
                        <div className="text-[11px] text-muted-foreground font-mono">@{user.login}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => {
                          onOpenChange(false);
                          onOpenGitHubAuth?.();
                        }}
                        className="gap-1 text-xs h-7"
                      >
                        <Key className="h-3 w-3" />
                        <span>管理凭证</span>
                      </Button>
                      <Button
                        size="xs"
                        variant="destructive"
                        onClick={() => {
                          logout();
                          toast.info('已断开 GitHub 账号连接');
                        }}
                        className="gap-1 text-xs h-7"
                      >
                        <LogOut className="h-3 w-3" />
                        <span>断开连接</span>
                      </Button>
                    </div>
                  </div>
                ) : (
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
                    <Button
                      size="sm"
                      onClick={() => {
                        onOpenChange(false);
                        onOpenGitHubAuth?.();
                      }}
                      className="gap-1.5 text-xs"
                    >
                      <Github className="h-3.5 w-3.5" />
                      <span>登录 GitHub</span>
                    </Button>
                  </div>
                )}

                <div className="text-[11px] text-muted-foreground leading-relaxed">
                  提示：支持 GitHub 官方 OAuth 设备流一键授权，也可使用包含 <code className="bg-accent px-1 rounded font-mono">repo</code>、
                  <code className="bg-accent px-1 rounded font-mono">workflow</code> 权限的 Personal Access Token 进行连接。
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
