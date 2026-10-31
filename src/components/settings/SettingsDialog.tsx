import { version } from '../../../package.json';
import { ModalSurface } from '@/components/ui/ModalSurface';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Settings,
  Terminal,
  Palette,
  Languages,
  Keyboard,
  X,
  Check,
  RotateCcw,
  LayoutGrid,
  Sparkles,
  RefreshCw,
  Cpu,
  Plus,
  Pencil,
  Trash2,
  GitCompare,
  GitMerge,
} from 'lucide-react';
import { Github } from '@/components/ui/brandIcons';
import { useShallow } from 'zustand/react/shallow';
import { useThemeStore, ThemeMode } from '@/stores/themeStore';
import { useLayoutStore } from '@/stores/layoutStore';
import { useRepoStore } from '@/stores/repoStore';
import { useSettingsStore, type Language } from '@/stores/settingsStore';
import { sendCrashReportTestEvent } from '@/services/crash/CrashReportingService';
import { useI18n } from '@/i18n';
import { toast } from '@/stores/toastStore';
import { useGitHubStore } from '@/stores/githubStore';
import { gitService } from '@/services/git/GitService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { requestAiText, type AiProtocol } from '@/services/ai/AiClient';
import { RemotesManager } from './RemotesManager';
import { RepositoryPermissions } from './RepositoryPermissions';
import { CursorThemePicker } from './CursorThemePicker';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, LogOut } from 'lucide-react';
import { cn } from '@/utils/cn';
import { checkForUpdates, openUpdateDialog } from '@/services/updater/UpdateService';
import { confirmAction } from '@/stores/confirmStore';
import {
  newExternalToolId,
  validateExternalToolDraft,
  type ExternalToolConfig,
  type ExternalToolMode,
} from '@/services/tools/ExternalToolService';

const isDesktopRuntime = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

interface ExternalToolFormState {
  id?: string;
  name: string;
  program: string;
  args: string;
  mode: ExternalToolMode;
}

/**
 * 外部 diff/merge 工具设置区（F4，仅桌面端渲染）。
 * 表单校验错误沿用内联红字模式，保存/删除结果沿用 toast 模式。
 */
export const ExternalToolsSection: React.FC = () => {
  const { t } = useI18n();
  const desktop = isDesktopRuntime();
  const { externalTools, initExternalTools, saveExternalTool, removeExternalTool } = useSettingsStore(useShallow((state) => ({
    externalTools: state.externalTools,
    initExternalTools: state.initExternalTools,
    saveExternalTool: state.saveExternalTool,
    removeExternalTool: state.removeExternalTool,
  })));
  const [form, setForm] = useState<ExternalToolFormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!desktop) return;
    let active = true;
    initExternalTools().catch((error: unknown) => {
      if (active) setLoadError(String(error instanceof Error ? error.message : error));
    });
    return () => { active = false; };
    // initExternalTools 是稳定的 store action，桌面判定不变时无需重跑。
  }, [desktop, initExternalTools]);

  if (!desktop) return null;

  const startAdd = () => {
    setForm({ name: '', program: '', args: '', mode: 'diff' });
    setFormError(null);
  };
  const startEdit = (tool: ExternalToolConfig) => {
    setForm({ id: tool.id, name: tool.name, program: tool.program, args: tool.args, mode: tool.mode });
    setFormError(null);
  };
  const dismissForm = () => {
    setForm(null);
    setFormError(null);
  };
  const submitForm = async () => {
    if (!form || busy) return;
    const error = validateExternalToolDraft(form);
    if (error) {
      setFormError(error);
      return;
    }
    setBusy(true);
    try {
      await saveExternalTool({
        id: form.id || newExternalToolId(),
        name: form.name.trim(),
        program: form.program.trim(),
        args: form.args.trim(),
        mode: form.mode,
      });
      toast.success(t('externalTools.saved'));
      dismissForm();
    } catch (error: any) {
      setFormError(String(error?.message || error));
      toast.error(t('externalTools.saveFailed'), String(error?.message || error));
    } finally {
      setBusy(false);
    }
  };
  const deleteTool = async (tool: ExternalToolConfig) => {
    if (!await confirmAction({
      title: t('externalTools.deleteTitle'),
      description: t('externalTools.deleteDesc').replace('{name}', tool.name),
      detail: tool.program,
    })) return;
    try {
      await removeExternalTool(tool.id);
      toast.success(t('externalTools.deleted'));
    } catch (error: any) {
      toast.error(t('externalTools.deleteFailed'), String(error?.message || error));
    }
  };

  const modeBadge = (mode: ExternalToolMode) => (
    <Badge variant="outline" className="h-4 px-1 gap-0.5 text-[10px] shrink-0">
      {mode === 'diff' ? <GitCompare className="h-2.5 w-2.5" /> : <GitMerge className="h-2.5 w-2.5" />}
      <span>{t(mode === 'diff' ? 'externalTools.mode.diff' : 'externalTools.mode.merge')}</span>
    </Badge>
  );

  return (
    <section className="space-y-2 border-t border-border pt-3" data-testid="external-tools-section">
      <h3 className="text-xs font-medium">{t('externalTools.title')}</h3>
      <p className="text-[12px] text-muted-foreground">{t('externalTools.description')}</p>
      {loadError && <p role="alert" className="text-destructive">{t('externalTools.loadFailed')}: {loadError}</p>}

      {form ? (
        <div className="space-y-2 rounded-lg border border-border p-2.5 bg-accent/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">{t('externalTools.formTitle')}</span>
            <Button variant="ghost" size="icon-xs" className="" aria-label={t('common.close')} onClick={dismissForm}>
              <X className="h-3 w-3" />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-[12px] font-medium">{t('externalTools.name')}</span>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={t('externalTools.namePlaceholder')}
                aria-label={t('externalTools.name')}
              />
            </label>
            <label className="space-y-1">
              <span className="text-[12px] font-medium">{t('externalTools.mode')}</span>
              <select
                value={form.mode}
                onChange={(e) => setForm({ ...form, mode: e.target.value as ExternalToolMode })}
                aria-label={t('externalTools.mode')}
                className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs"
              >
                <option value="diff" className="bg-popover text-foreground">{t('externalTools.mode.diff')}</option>
                <option value="merge" className="bg-popover text-foreground">{t('externalTools.mode.merge')}</option>
              </select>
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-[12px] font-medium">{t('externalTools.program')}</span>
            <Input
              value={form.program}
              onChange={(e) => setForm({ ...form, program: e.target.value })}
              placeholder={t('externalTools.programPlaceholder')}
              className="font-mono text-xs"
              aria-label={t('externalTools.program')}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[12px] font-medium">{t('externalTools.args')}</span>
            <Input
              value={form.args}
              onChange={(e) => setForm({ ...form, args: e.target.value })}
              placeholder={t('externalTools.argsPlaceholder')}
              className="font-mono text-xs"
              aria-label={t('externalTools.args')}
            />
          </label>
          <p className="text-[12px] text-muted-foreground leading-relaxed">{t('externalTools.argsHint')}</p>
          {formError && <p role="alert" className="text-destructive select-text">{formError}</p>}
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button variant="ghost" size="xs" onClick={dismissForm} disabled={busy}>{t('common.cancel')}</Button>
            <Button variant="outline" size="xs" onClick={() => void submitForm()} disabled={busy} className="gap-1">
              <Check className="h-3 w-3" />
              <span>{t('externalTools.save')}</span>
            </Button>
          </div>
        </div>
      ) : (
        <>
          {externalTools.length === 0 && !loadError && <p className="text-muted-foreground">{t('externalTools.empty')}</p>}
          <div className="space-y-1">
            {externalTools.map((tool) => (
              <div key={tool.id} className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
                {modeBadge(tool.mode)}
                <span className="font-medium shrink-0">{tool.name}</span>
                <span title={tool.program} className="min-w-0 flex-1 truncate font-mono text-[12px] text-muted-foreground">{tool.program}</span>
                <Button variant="ghost" size="xs" className="p-0 shrink-0" aria-label={`${t('externalTools.edit')}: ${tool.name}`} onClick={() => startEdit(tool)}>
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="xs" className="p-0 shrink-0 hover:text-destructive" aria-label={`${t('externalTools.delete')}: ${tool.name}`} onClick={() => void deleteTool(tool)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
          <div>
            <Button variant="outline" size="xs" className="gap-1" onClick={startAdd}>
              <Plus className="h-3 w-3" />
              <span>{t('externalTools.add')}</span>
            </Button>
          </div>
        </>
      )}
    </section>
  );
};

/** 账号列表行头像：非当前账号读取 Profile 内登记的摘要，缺失或取回失败回退为占位图标 */
const ProfileAvatar: React.FC<{ src: string | null; login: string; className?: string }> = ({ src, login, className }) => {
  const [failed, setFailed] = useState(!src);
  useEffect(() => { setFailed(!src); }, [src]);
  if (!src || failed) {
    return (
      <div className={cn('flex items-center justify-center rounded-full border border-border bg-accent text-muted-foreground shrink-0', className)} aria-hidden>
        <Github className="h-[55%] w-[55%]" />
      </div>
    );
  }
  return <img src={src} alt={login} onError={() => setFailed(true)} className={className} />;
};

interface SettingsDialogProps {
  initialTab?: SettingsTab;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenGitHubAuth?: () => void;
}

type SettingsTab = 'general' | 'git' | 'github' | 'ai' | 'appearance' | 'shortcuts';

export const SettingsDialog: React.FC<SettingsDialogProps> = ({
  open,
  initialTab = 'appearance',
  onOpenChange,
  onOpenGitHubAuth,
}) => {
  const { theme, setTheme } = useThemeStore(useShallow(state => ({ theme: state.theme, setTheme: state.setTheme })));
  const { resetLayout, navigationPinned, setNavigationPinned, inspectorPresentation, setInspectorPresentation } = useLayoutStore(useShallow(state => ({ resetLayout: state.resetLayout, navigationPinned: state.navigationPinned, setNavigationPinned: state.setNavigationPinned, inspectorPresentation: state.inspectorPresentation, setInspectorPresentation: state.setInspectorPresentation })));
  const { user, isAuthenticated, profiles, activeProfileId, logout, switchProfile, removeProfile, addProfile } = useGitHubStore(useShallow(state => ({ user: state.user, isAuthenticated: state.isAuthenticated, profiles: state.profiles, activeProfileId: state.activeProfileId, logout: state.logout, switchProfile: state.switchProfile, removeProfile: state.removeProfile, addProfile: state.addProfile })));
  const {
    gitCliPath,
    setGitCliPath,
    compactMode,
    setCompactMode,
    autoFetchInterval,
    setAutoFetchInterval,
    reviewBeforeCommit,
    setReviewBeforeCommit,
    crashReports,
    setCrashReports,
    aiConfig,
    credentialError,
    setAiConfig,
  } = useSettingsStore(useShallow(state => ({ gitCliPath: state.gitCliPath, setGitCliPath: state.setGitCliPath, compactMode: state.compactMode, setCompactMode: state.setCompactMode, autoFetchInterval: state.autoFetchInterval, setAutoFetchInterval: state.setAutoFetchInterval, reviewBeforeCommit: state.reviewBeforeCommit, setReviewBeforeCommit: state.setReviewBeforeCommit, crashReports: state.crashReports, setCrashReports: state.setCrashReports, aiConfig: state.aiConfig, credentialError: state.credentialError, setAiConfig: state.setAiConfig })));
  const { t, lang } = useI18n();
  const setLang = useSettingsStore((st) => st.setLanguage);

  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  useEffect(() => { if (open) setActiveTab(initialTab); }, [open, initialTab]);
  const [gitVersion, setGitVersion] = useState<string>('');
  const [isDetectingGit, setIsDetectingGit] = useState<boolean>(false);
  const [isTestingAi, setIsTestingAi] = useState<boolean>(false);
  const [aiTestResult, setAiTestResult] = useState<{ type: 'success' | 'error'; title: string; detail?: string } | null>(null);
  const aiTestRequest = useRef(0);
  const aiTestController = useRef<AbortController | null>(null);
  const aiTestResultRef = useRef<HTMLDivElement>(null);
  const invalidateAiTest = useCallback(() => { aiTestRequest.current++; aiTestController.current?.abort(); }, []);
  useEffect(() => {
    aiTestRequest.current++;
    aiTestController.current?.abort();
    setIsTestingAi(false);
    setAiTestResult(null);
    return invalidateAiTest;
  }, [open, aiConfig, invalidateAiTest]);
  useEffect(() => { aiTestResultRef.current?.scrollIntoView({ block: 'nearest' }); }, [aiTestResult]);

  // Load real Git version dynamically
  const detectGitVersion = async () => {
    setIsDetectingGit(true);
    try {
      const ver = await gitService.getGitVersion();
      setGitVersion(ver || t('settings.git.notFound'));
    } catch {
      setGitVersion(t('settings.git.detectFailed'));
    } finally {
      setIsDetectingGit(false);
    }
  };

  // Git CLI 路径检测：300ms 防抖 + 过期守卫（照上方 AI 测试 effect 的模式），避免输入每个字符都触发一次检测
  const gitDetectRequest = useRef(0);
  const invalidateGitDetection = useCallback(() => { gitDetectRequest.current++; }, []);
  useEffect(() => {
    if (!open) return;
    const request = ++gitDetectRequest.current;
    const timer = setTimeout(() => {
      if (request !== gitDetectRequest.current) return;
      setIsDetectingGit(true);
      gitService.getGitVersion()
        .then((ver) => { if (request === gitDetectRequest.current) setGitVersion(ver || t('settings.git.notFound')); })
        .catch(() => { if (request === gitDetectRequest.current) setGitVersion(t('settings.git.detectFailed')); })
        .finally(() => { if (request === gitDetectRequest.current) setIsDetectingGit(false); });
    }, 300);
    return () => { clearTimeout(timer); invalidateGitDetection(); };
  }, [open, gitCliPath, t, invalidateGitDetection]);

  useEffect(() => {
    if (credentialError) toast.error(t('settings.ai.testFailed'), credentialError);
  }, [credentialError, t]);

  // Test custom AI connection
  const handleTestAiConnection = async () => {
    if (aiConfig.provider === 'builtin') {
      setAiTestResult({ type: 'success', title: t('settings.ai.builtinReady'), detail: t('settings.ai.builtinReadyDesc') });
      return;
    }

    if (!aiConfig.apiKey.trim()) {
      setAiTestResult({ type: 'error', title: t('settings.ai.needKey') });
      return;
    }

    const request = ++aiTestRequest.current;
    aiTestController.current?.abort();
    const controller = new AbortController();
    aiTestController.current = controller;
    const timeout = setTimeout(() => controller.abort(), 30_000);
    setIsTestingAi(true);
    setAiTestResult(null);
    try {
      await requestAiText(aiConfig, [{ role: 'user', content: 'Ping! Output pong.' }], {
        signal: controller.signal,
      });

      if (request === aiTestRequest.current) setAiTestResult({ type: 'success', title: t('settings.ai.testOk'), detail: t('settings.ai.testOkDesc').replace('{model}', aiConfig.model) });
    } catch (err: any) {
      if (request === aiTestRequest.current) setAiTestResult({ type: 'error', title: t('settings.ai.testFailed'), detail: `${controller.signal.aborted ? `${t('settings.ai.testTimeout')}\n` : ''}${String(err?.message || err)}` });
    } finally {
      clearTimeout(timeout);
      if (request === aiTestRequest.current) setIsTestingAi(false);
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
    <ModalSurface onDismiss={() => onOpenChange(false)} dismissible label={t('settings.title')}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs animate-in fade-in-0 select-none"
    >
      <div
        className="w-full max-w-2xl h-[500px] rounded-xl border border-border bg-card shadow-2xl flex overflow-hidden animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left Settings Navigation */}
        <div className="w-44 border-r border-border bg-sidebar/50 p-2 flex flex-col justify-between shrink-0">
          <div className="space-y-1">
            <div className="px-2 py-1.5 text-xs font-semibold text-foreground flex items-center gap-1.5 min-w-0">
              <Settings className="h-4 w-4 text-primary shrink-0" />
              <span className="truncate">{t('settings.title')}</span>
            </div>

            <div className="pt-2 space-y-0.5">
              <button
                aria-current={activeTab === 'appearance' ? 'page' : undefined} onClick={() => setActiveTab('appearance')}
                className={cn(
                  "w-full text-left px-2.5 py-1.5 rounded-md text-xs font-medium flex items-center gap-2 transition-colors",
                  activeTab === 'appearance'
                    ? "bg-accent text-accent-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
                )}
              >
                <Palette className="h-3.5 w-3.5" />
                <span className="min-w-0 flex-1 truncate">{t('settings.tab.appearance')}</span>
              </button>

              <button
                aria-current={activeTab === 'git' ? 'page' : undefined} onClick={() => setActiveTab('git')}
                className={cn(
                  "w-full text-left px-2.5 py-1.5 rounded-md text-xs font-medium flex items-center gap-2 transition-colors",
                  activeTab === 'git'
                    ? "bg-accent text-accent-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
                )}
              >
                <Terminal className="h-3.5 w-3.5" />
                <span className="min-w-0 flex-1 truncate">{t('settings.tab.git')}</span>
              </button>

              <button
                aria-current={activeTab === 'ai' ? 'page' : undefined} onClick={() => setActiveTab('ai')}
                className={cn(
                  "w-full text-left px-2.5 py-1.5 rounded-md text-xs font-medium flex items-center gap-2 transition-colors",
                  activeTab === 'ai'
                    ? "bg-accent text-accent-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
                )}
              >
                <Sparkles className="h-3.5 w-3.5 text-git-branch" />
                <span className="min-w-0 flex-1 truncate">{t('settings.tab.ai')}</span>
              </button>

              <button
                aria-current={activeTab === 'github' ? 'page' : undefined} onClick={() => setActiveTab('github')}
                className={cn(
                  "w-full text-left px-2.5 py-1.5 rounded-md text-xs font-medium flex items-center gap-2 transition-colors",
                  activeTab === 'github'
                    ? "bg-accent text-accent-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
                )}
              >
                <Github className="h-3.5 w-3.5" />
                <span className="min-w-0 flex-1 truncate">{t('settings.tab.github')}</span>
              </button>

              <button
                aria-current={activeTab === 'shortcuts' ? 'page' : undefined} onClick={() => setActiveTab('shortcuts')}
                className={cn(
                  "w-full text-left px-2.5 py-1.5 rounded-md text-xs font-medium flex items-center gap-2 transition-colors",
                  activeTab === 'shortcuts'
                    ? "bg-accent text-accent-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
                )}
              >
                <Keyboard className="h-3.5 w-3.5" />
                <span className="min-w-0 flex-1 truncate">{t('settings.tab.shortcuts')}</span>
              </button>
            </div>
          </div>

          <div className="p-2 text-[12px] text-muted-foreground/80 font-mono">
            v{version}
            <button className="block mt-1 text-primary hover:underline" onClick={() => { openUpdateDialog(); void checkForUpdates(false); }}>{t('updates.check')}</button>
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
              size="icon-xs"
              className="text-muted-foreground hover:text-foreground"
              aria-label={t('common.close')} onClick={() => onOpenChange(false)}
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
                        aria-pressed={theme === item.id}
                        onClick={() => setTheme(item.id as ThemeMode)}
                        className={cn(
                          "p-3 rounded-lg border text-left transition-[background-color,border-color,box-shadow] relative",
                          theme === item.id
                            ? "border-primary bg-primary/10 text-foreground shadow-xs"
                            : "border-border hover:bg-accent/40 text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <div className="font-semibold text-xs text-foreground">{item.name}</div>
                        <div className="text-[12px] text-muted-foreground mt-1">{item.desc}</div>
                        {theme === item.id && (
                          <Check className="h-3.5 w-3.5 text-primary absolute top-2.5 right-2.5" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <details className="rounded-lg border border-border p-3"><summary className="cursor-pointer text-xs font-medium">{t('settings.cursor.label')}</summary><div className="pt-3"><CursorThemePicker /></div></details>

                <div className="pt-2 border-t border-border">
                  <label className="flex items-center justify-between gap-4 py-2 cursor-pointer">
                    <span>
                      <span className="block font-medium text-foreground">{t('layout.pinNavigation')}</span>
                      <span className="block text-[12px] text-muted-foreground">{t('layout.pinNavigationDesc')}</span>
                    </span>
                    <input type="checkbox" checked={navigationPinned} onChange={event => {
                      setNavigationPinned(event.target.checked);
                      if (event.target.checked) useRepoStore.setState({ isLeftSidebarCollapsed: false });
                    }} className="shrink-0 h-4 w-4 accent-primary" />
                  </label>
                  <label className="block py-2 space-y-2 text-xs">
                    <span className="font-medium">{t('ui.inspector.label')}</span>
                    <select className="w-full h-9 rounded-md border border-input bg-background px-2" value={inspectorPresentation} onChange={event => setInspectorPresentation(event.target.value as typeof inspectorPresentation)}>
                      <option value="auto">{t('ui.inspector.auto')}</option>
                      <option value="inline">{t('ui.inspector.inline')}</option>
                      <option value="drawer">{t('ui.inspector.drawer')}</option>
                    </select>
                    <span className="block text-muted-foreground">{t('ui.inspector.desc')}</span>
                  </label>
                  <div className="flex items-center justify-between py-2">
                    <div>
                      <div className="font-medium text-foreground flex items-center gap-1.5">
                        <Languages className="h-3.5 w-3.5 text-primary" />
                        <label htmlFor="interface-language">{t('settings.appearance.languageLabel')}</label>
                      </div>
                      <div className="text-[12px] text-muted-foreground">{t('settings.appearance.languageDesc')}</div>
                    </div>
                    <select
                      id="interface-language" value={lang}
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
                      <label htmlFor="compact-mode" className="font-medium text-foreground cursor-pointer">{t('settings.appearance.compact')}</label>
                      <div className="text-[12px] text-muted-foreground">{t('settings.appearance.compactDesc')}</div>
                    </div>
                    <input
                      type="checkbox"
                      id="compact-mode" checked={compactMode}
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
                      <label htmlFor="crash-reports" className="font-medium text-foreground cursor-pointer">{t('crashReports.setting')}</label>
                      <div className="text-[12px] text-muted-foreground">{t('crashReports.settingDesc')}</div>
                      {crashReports && <button type="button" className="mt-1 text-[12px] text-primary hover:underline" onClick={() => { void sendCrashReportTestEvent().then(sent => { if (sent) toast.success(t('crashReports.testSent')); else toast.info(t('crashReports.testUnavailable')); }); }}>{t('crashReports.sendTest')}</button>}
                    </div>
                    <input
                      type="checkbox"
                      id="crash-reports" checked={crashReports}
                      onChange={(e) => setCrashReports(e.target.checked)}
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
                  <label htmlFor="git-cli-path" className="text-xs font-medium text-foreground block mb-1">
                    {t('settings.git.cliPathLabel')}
                  </label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="git-cli-path" value={gitCliPath}
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
                    <span className="font-mono font-medium text-git-added bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                      {gitVersion}
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-border">
                  <label htmlFor="auto-fetch-interval" className="text-xs font-medium text-foreground block mb-1">
                    {t('settings.git.autoFetchLabel')}
                  </label>
                  <select
                    id="auto-fetch-interval" value={autoFetchInterval}
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
                  <div className="text-[12px] text-muted-foreground mt-1">
                    {t('settings.git.autoFetchDesc')}
                  </div>
                </div>

                <label className="flex items-start justify-between gap-4 rounded-lg border border-border p-3 cursor-pointer">
                  <span><span className="block font-medium text-foreground">{t('workingReview.setting')}</span><span className="block text-[12px] text-muted-foreground mt-1">{t('workingReview.settingDesc')}</span></span>
                  <input type="checkbox" checked={reviewBeforeCommit} onChange={event => setReviewBeforeCommit(event.target.checked)} aria-label={t('workingReview.setting')} />
                </label>
                <RemotesManager />
                <RepositoryPermissions />
                <ExternalToolsSection />
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
                      aria-pressed={aiConfig.provider === 'builtin'} onClick={() => setAiConfig({ provider: 'builtin' })}
                      className={cn(
                        "p-3 rounded-lg border text-left transition-[background-color,border-color,box-shadow] relative space-y-1",
                        aiConfig.provider === 'builtin'
                          ? "border-primary bg-primary/10 text-foreground shadow-xs"
                          : "border-border hover:bg-accent/40 text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                        <Cpu className="h-3.5 w-3.5 text-primary" />
                        <span>{t('settings.ai.builtin.name')}</span>
                      </div>
                      <div className="text-[12px] text-muted-foreground">
                        {t('settings.ai.builtin.desc')}
                      </div>
                      {aiConfig.provider === 'builtin' && (
                        <Check className="h-3.5 w-3.5 text-primary absolute top-2.5 right-2.5" />
                      )}
                    </button>

                    <button
                      aria-pressed={aiConfig.provider === 'openai-compatible'} onClick={() => setAiConfig({ provider: 'openai-compatible' })}
                      className={cn(
                        "p-3 rounded-lg border text-left transition-[background-color,border-color,box-shadow] relative space-y-1",
                        aiConfig.provider === 'openai-compatible'
                          ? "border-primary bg-primary/10 text-foreground shadow-xs"
                          : "border-border hover:bg-accent/40 text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5 text-git-branch" />
                        <span>{t('settings.ai.api.name')}</span>
                      </div>
                      <div className="text-[12px] text-muted-foreground">
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
                      <label htmlFor="ai-protocol" className="text-[12px] font-medium text-foreground block mb-1">{t('settings.ai.protocol')}</label>
                      <select id="ai-protocol" value={aiConfig.protocol || 'chat-completions'} onChange={e => setAiConfig({ protocol: e.target.value as AiProtocol })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs">
                        <option value="chat-completions">OpenAI Chat Completions</option>
                        <option value="responses">OpenAI Responses</option>
                        <option value="anthropic-messages">Anthropic Messages</option>
                      </select>
                      <p className="text-xs text-muted-foreground mt-1">{t('settings.ai.protocolHint')}</p>
                    </div>
                    <div>
                      <label htmlFor="ai-endpoint" className="text-[12px] font-medium text-foreground block mb-1">
                        {t('settings.ai.endpoint')}
                      </label>
                      <Input
                        id="ai-endpoint" value={aiConfig.endpoint}
                        onChange={(e) => setAiConfig({ endpoint: e.target.value })}
                        placeholder={aiConfig.protocol === 'anthropic-messages' ? 'https://api.anthropic.com/v1' : aiConfig.protocol === 'responses' ? 'https://api.openai.com/v1' : 'https://api.deepseek.com/v1'}
                        className="font-mono text-xs"
                      />
                      <p className="text-xs text-muted-foreground mt-1">{t('settings.ai.endpointHint')}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="ai-model" className="text-[12px] font-medium text-foreground block mb-1">
                          {t('settings.ai.model')}
                        </label>
                        <Input
                          id="ai-model" value={aiConfig.model}
                          onChange={(e) => setAiConfig({ model: e.target.value })}
                          placeholder={t('settings.ai.modelPlaceholder')}
                          className="font-mono text-xs"
                        />
                      </div>

                      <div>
                        <label htmlFor="ai-key" className="text-[12px] font-medium text-foreground block mb-1">
                          {t('settings.ai.apiKeyLabel')}
                        </label>
                        <Input
                          id="ai-key" type="password" autoComplete="off"
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
                        size="toolbar"
                        onClick={handleTestAiConnection}
                        disabled={isTestingAi}
                        className="gap-1.5 border-primary/40 text-primary hover:bg-primary/10"
                      >
                        <Sparkles className="h-3 w-3" />
                        <span>{isTestingAi ? t('settings.ai.testing') : t('settings.ai.testBtn')}</span>
                      </Button>
                    </div>
                    {aiTestResult && <div ref={aiTestResultRef} role={aiTestResult.type === 'error' ? 'alert' : 'status'} className={cn('rounded-lg border p-3 text-xs select-text', aiTestResult.type === 'error' ? 'border-destructive/40 bg-destructive/10' : 'border-emerald-500/40 bg-emerald-500/10')}>
                      <p className="font-medium">{aiTestResult.title}</p>
                      {aiTestResult.detail && <pre className="mt-1 max-h-64 overflow-auto text-muted-foreground whitespace-pre-wrap wrap-break-word wrap-anywhere font-mono text-xs">{aiTestResult.detail}</pre>}
                    </div>}
                  </div>
                )}
              </div>
            )}

            {/* GitHub Tab */}
            {activeTab === 'github' && (
              <div className="space-y-4">
                {isAuthenticated && user ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-medium text-foreground">
                        {t('settings.github.accountsTitle')} <span className="text-muted-foreground font-normal">({profiles.length})</span>
                      </div>
                      <Button
                        size="toolbar"
                        variant="outline"
                        onClick={() => {
                          onOpenChange(false);
                          addProfile();
                          onOpenGitHubAuth?.();
                        }}
                        className="gap-1 border-primary/40 text-primary hover:bg-primary/10"
                      >
                        <Plus className="h-3 w-3" />
                        <span>{t('profiles.addAccount')}</span>
                      </Button>
                    </div>
                    <div className="rounded-xl border border-border divide-y divide-border/60 overflow-hidden">
                      {profiles.map((profile) => {
                        const isActive = profile.id === activeProfileId;
                        const login = isActive ? user.login : (profile.user?.login ?? profile.label);
                        const avatarSrc = isActive ? user.avatar_url : (profile.user?.avatarUrl ?? null);
                        return (
                          <div
                            key={profile.id}
                            className={cn(
                              'p-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2',
                              isActive ? 'bg-accent/20' : 'hover:bg-accent/30 transition-colors'
                            )}
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <ProfileAvatar src={avatarSrc} login={login} className="w-8 h-8 rounded-full border border-border/80 shadow-2xs shrink-0" />
                              <div className="min-w-0">
                                <div className="font-semibold text-xs text-foreground flex flex-wrap items-center gap-x-1.5 gap-y-1 min-w-0">
                                  <span className="truncate min-w-16">{login}</span>
                                  {isActive && (
                                    <Badge variant="success" className="h-3.5 text-[10px] px-1 gap-0.5 shrink-0">
                                      <CheckCircle2 className="h-2.5 w-2.5" />
                                      <span>{t('settings.github.currentBadge')}</span>
                                    </Badge>
                                  )}
                                </div>
                                <div className="text-[12px] text-muted-foreground font-mono truncate">@{login}</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                              {!isActive && (
                                <Button
                                  size="toolbar"
                                  variant="outline"
                                  onClick={() => { void switchProfile(profile.id); }}
                                  className="gap-1"
                                >
                                  <span>{t('settings.github.switchTo')}</span>
                                </Button>
                              )}
                              <Button
                                size="xs"
                                variant={isActive ? 'destructive' : 'ghost'}
                                onClick={() => {
                                  if (isActive) {
                                    logout();
                                    toast.info(t('settings.github.disconnectToast'));
                                  } else {
                                    void removeProfile(profile.id);
                                    toast.info(t('settings.github.removedToast').replace('{login}', login));
                                  }
                                }}
                                className={cn('gap-1 text-xs h-7', !isActive && 'text-rose-400 hover:text-rose-300 hover:bg-rose-500/10')}
                              >
                                <LogOut className="h-3 w-3" />
                                <span>{t('common.disconnect')}</span>
                              </Button>
                            </div>
                          </div>
                        );
                      })}
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
                      <kbd className="inline-flex h-5 items-center rounded border border-border bg-muted/60 px-1.5 font-mono text-[12px] text-muted-foreground">
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
