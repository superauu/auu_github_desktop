import { ModalSurface } from '@/components/ui/ModalSurface';
import React, { useState, useEffect } from 'react';
import {
  Settings,
  Terminal,
  Palette,
  Languages,
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
import { useSettingsStore, type Language } from '@/stores/settingsStore';
import { useI18n } from '@/i18n';
import { toast } from '@/stores/toastStore';
import { useGitHubStore } from '@/stores/githubStore';
import { gitService } from '@/services/git/GitService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { requestAiCompletion } from '@/services/ai/AiTransport';
import { RemotesManager } from './RemotesManager';
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
    credentialError,
    setAiConfig,
  } = useSettingsStore();

  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance');
  const [gitVersion, setGitVersion] = useState<string>('');
  const [isDetectingGit, setIsDetectingGit] = useState<boolean>(false);
  const [isTestingAi, setIsTestingAi] = useState<boolean>(false);

  // Load real Git version dynamically
  const detectGitVersion = async () => {
    setIsDetectingGit(true);
    try {
      const ver = await gitService.getGitVersion();
      setGitVersion(ver || t('settings.git.notFound'));
    } catch (err: any) {
      setGitVersion(t('settings.git.detectFailed'));
    } finally {
      setIsDetectingGit(false);
    }
  };

  useEffect(() => {
    if (open) {
      detectGitVersion();
    }
  }, [open, gitCliPath]);
  const { t, lang } = useI18n();
  const setLang = useSettingsStore((st) => st.setLanguage);

  useEffect(() => {
    if (credentialError) toast.error(t('settings.ai.testFailed'), credentialError);
  }, [credentialError, t]);

  // Test custom AI connection
  const handleTestAiConnection = async () => {
    if (aiConfig.provider === 'builtin') {
      toast.success(t('settings.ai.builtinReady'), t('settings.ai.builtinReadyDesc'));
      return;
    }

    if (!aiConfig.apiKey.trim()) {
      toast.warning(t('settings.ai.needKey'));
      return;
    }

    setIsTestingAi(true);
    try {
      const base = aiConfig.endpoint.replace(/\/+$/, '');
      const endpoint = base.endsWith('/chat/completions') ? base : base + '/chat/completions';
      const res = await requestAiCompletion(endpoint, {
        signal: AbortSignal.timeout(15_000),
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

      toast.success(t('settings.ai.testOk'), t('settings.ai.testOkDesc').replace('{model}', aiConfig.model));
    } catch (err: any) {
      toast.error(t('settings.ai.testFailed'), err.message);
    } finally {
      setIsTestingAi(false);
    }
  };

  if (!open) return null;

  const shortcuts = [
    { key: 'Ctrl/Cmd + K', desc: t('settings.shortcuts.cmdPalette') },
    { key: 'Ctrl/Cmd + P', desc: t('settings.shortcuts.push') },
    { key: 'Ctrl/Cmd + L', desc: t('settings.shortcuts.pull') },
    { key: 'Ctrl/Cmd + Shift + F', desc: t('settings.shortcuts.fetch') },
    { key: 'Ctrl/Cmd + Enter', desc: t('settings.shortcuts.commit') },
    { key: 'Ctrl/Cmd + B', desc: t('settings.shortcuts.createBranch') },
    { key: 'Ctrl/Cmd + T', desc: t('settings.shortcuts.createTag') },
  ];

  return (
    <ModalSurface onDismiss={() => onOpenChange(false)} dismissible={!false} label={t('settings.title')}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in-0 select-none"
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
              <span>{t('settings.title')}</span>
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
                <span>{t('settings.tab.appearance')}</span>
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
                <span>{t('settings.tab.git')}</span>
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
                <span>{t('settings.tab.ai')}</span>
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
                <span>{t('settings.tab.github')}</span>
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
                <span>{t('settings.tab.shortcuts')}</span>
              </button>
            </div>
          </div>

          <div className="p-2 text-[11px] text-muted-foreground/80 font-mono">
            v0.1.0 (Tauri 2 Preview)
          </div>
        </div>

        {/* Right Content Panel */}
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
          <div className="h-10 px-4 border-b border-border flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground capitalize">
              {activeTab === 'appearance' && t('settings.panel.appearance')}
              {activeTab === 'git' && t('settings.panel.git')}
              {activeTab === 'ai' && t('settings.panel.ai')}
              {activeTab === 'github' && t('settings.panel.github')}
              {activeTab === 'shortcuts' && t('settings.panel.shortcuts')}
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
                    {t('settings.appearance.themeLabel')}
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { id: 'dark', name: t('settings.appearance.theme.dark.name'), desc: t('settings.appearance.theme.dark.desc') },
                      { id: 'light', name: t('settings.appearance.theme.light.name'), desc: t('settings.appearance.theme.light.desc') },
                      { id: 'system', name: t('settings.appearance.theme.system.name'), desc: t('settings.appearance.theme.system.desc') },
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
                        <div className="text-[11px] text-muted-foreground mt-1">{item.desc}</div>
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
                      <div className="font-medium text-foreground flex items-center gap-1.5">
                        <Languages className="h-3.5 w-3.5 text-primary" />
                        <span>{t('settings.appearance.languageLabel')}</span>
                      </div>
                      <div className="text-[12px] text-muted-foreground">{t('settings.appearance.languageDesc')}</div>
                    </div>
                    <select
                      value={lang}
                      onChange={(e) => setLang(e.target.value as Language)}
                      className="h-8 w-32 rounded-md border border-input bg-transparent px-2 text-xs cursor-pointer"
                    >
                      <option value="zh" className="bg-popover text-foreground">简体中文</option>
                      <option value="en" className="bg-popover text-foreground">English</option>
                    </select>
                  </div>
                </div>

                <div className="pt-2 border-t border-border">
                  <div className="flex items-center justify-between py-2">
                    <div>
                      <div className="font-medium text-foreground">{t('settings.appearance.compact')}</div>
                      <div className="text-[12px] text-muted-foreground">{t('settings.appearance.compactDesc')}</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={compactMode}
                      onChange={(e) => {
                        setCompactMode(e.target.checked);
                        toast.info(e.target.checked ? t('settings.appearance.compactOn') : t('settings.appearance.compactOff'));
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
                        <span>{t('settings.appearance.panelLayout')}</span>
                      </div>
                      <div className="text-[12px] text-muted-foreground">
                        {t('settings.appearance.panelLayoutDesc')}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        resetLayout();
                        toast.success(t('settings.appearance.resetLayoutToast'));
                      }}
                      className="gap-1 text-xs shrink-0"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>{t('settings.appearance.resetLayout')}</span>
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
                    {t('settings.git.cliPathLabel')}
                  </label>
                  <div className="flex items-center gap-2">
                    <Input
                      value={gitCliPath}
                      onChange={(e) => setGitCliPath(e.target.value)}
                      placeholder={t('settings.git.cliPathPlaceholder')}
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
                      <span>{t('common.detect')}</span>
                    </Button>
                  </div>
                  <div className="flex items-center gap-2 text-[12px] text-muted-foreground mt-1.5">
                    <span>{t('settings.git.versionLabel')}</span>
                    <span className="font-mono font-medium text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                      {gitVersion}
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-border">
                  <label className="text-xs font-medium text-foreground block mb-1">
                    {t('settings.git.autoFetchLabel')}
                  </label>
                  <select
                    value={autoFetchInterval}
                    onChange={(e) => {
                      const val = e.target.value as any;
                      setAutoFetchInterval(val);
                      toast.info(`${t('settings.git.autoFetchToast')}: ${val === 'never' ? t('common.never') : val}`);
                    }}
                    className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs"
                  >
                    <option value="never" className="bg-popover text-foreground">{t("common.never")}</option>
                    <option value="5m" className="bg-popover text-foreground">{t("settings.git.autoFetch.every5")}</option>
                    <option value="10m" className="bg-popover text-foreground">{t("settings.git.autoFetch.every10")}</option>
                    <option value="30m" className="bg-popover text-foreground">{t("settings.git.autoFetch.every30")}</option>
                  </select>
                  <div className="text-[11px] text-muted-foreground mt-1">
                    {t('settings.git.autoFetchDesc')}
                  </div>
                </div>

                <RemotesManager />
              </div>
            )}

            {/* AI Tab */}
            {activeTab === 'ai' && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-foreground block mb-2">
                    {t('settings.ai.strategyLabel')}
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
                        <span>{t('settings.ai.builtin.name')}</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {t('settings.ai.builtin.desc')}
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
                        <span>{t('settings.ai.api.name')}</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {t('settings.ai.api.desc')}
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
                      <label className="text-[12px] font-medium text-foreground block mb-1">
                        {t('settings.ai.endpoint')}
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
                        <label className="text-[12px] font-medium text-foreground block mb-1">
                          {t('settings.ai.model')}
                        </label>
                        <Input
                          value={aiConfig.model}
                          onChange={(e) => setAiConfig({ model: e.target.value })}
                          placeholder={t('settings.ai.modelPlaceholder')}
                          className="font-mono text-xs"
                        />
                      </div>

                      <div>
                        <label className="text-[12px] font-medium text-foreground block mb-1">
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
                        <span>{isTestingAi ? t('settings.ai.testing') : t('settings.ai.testBtn')}</span>
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
                            <span>{t('common.connected')}</span>
                          </Badge>
                        </div>
                        <div className="text-[12px] text-muted-foreground font-mono">@{user.login}</div>
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
                        <span>{t('common.manageCredentials')}</span>
                      </Button>
                      <Button
                        size="xs"
                        variant="destructive"
                        onClick={() => {
                          logout();
                          toast.info(t('settings.github.disconnectToast'));
                        }}
                        className="gap-1 text-xs h-7"
                      >
                        <LogOut className="h-3 w-3" />
                        <span>{t('common.disconnect')}</span>
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
                        <div className="font-semibold text-xs text-foreground">{t('settings.github.notConnected')}</div>
                        <div className="text-[12px] text-muted-foreground">{t('settings.github.notConnectedDesc')}</div>
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
                      <span>{t('settings.github.login')}</span>
                    </Button>
                  </div>
                )}

                <div className="text-[12px] text-muted-foreground leading-relaxed">
                  {t('settings.github.patHintPrefix')} <code className="bg-accent px-1 rounded font-mono">repo</code>、
                  <code className="bg-accent px-1 rounded font-mono">workflow</code> {t('settings.github.patHintSuffix')}
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
                      <kbd className="inline-flex h-5 items-center rounded border border-border bg-muted/60 px-1.5 font-mono text-[11px] text-muted-foreground">
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
    </ModalSurface>
  );
};
