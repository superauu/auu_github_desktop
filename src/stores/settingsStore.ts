import { create } from 'zustand';
import { applyCursorTheme, normalizeCursorTheme, type CursorThemeId } from '@/utils/cursorThemes';
import type { AiProtocol } from '@/services/ai/AiClient';

export interface AiApiConfig {
  provider: 'builtin' | 'openai-compatible';
  protocol?: AiProtocol;
  endpoint: string;
  apiKey: string;
  model: string;
}

export type Language = 'zh' | 'en';

export interface SettingsState {
  gitCliPath: string;
  compactMode: boolean;
  cursorTheme: CursorThemeId;
  diffFontSize: number;
  diffWrapLines: boolean;
  diffIgnoreWhitespace: boolean;
  autoFetchInterval: 'never' | '5m' | '10m' | '30m';
  aiConfig: AiApiConfig;
  language: Language;

  credentialError: string | null;
  initSecrets: () => Promise<void>;

  // Actions
  setGitCliPath: (path: string) => void;
  setCompactMode: (enabled: boolean) => void;
  setCursorTheme: (theme: CursorThemeId) => void;
  setDiffFontSize: (size: number) => void;
  setDiffWrapLines: (enabled: boolean) => void;
  setDiffIgnoreWhitespace: (enabled: boolean) => void;
  setAutoFetchInterval: (interval: 'never' | '5m' | '10m' | '30m') => void;
  setAiConfig: (config: Partial<AiApiConfig>) => void;
  setLanguage: (lang: Language) => void;
  resetSettings: () => void;
}

const SETTINGS_KEY = 'auu_git_settings';
let legacyAiKey = '';
let keyVersion = 0;
let keyWrites: Promise<void> = Promise.resolve();
let secretInit: Promise<void> | null = null;
const isDesktop = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

const DEFAULT_SETTINGS = {
  gitCliPath: 'git',
  compactMode: false,
  cursorTheme: 'system' as CursorThemeId,
  diffFontSize: 13,
  diffWrapLines: false,
  diffIgnoreWhitespace: false,
  autoFetchInterval: '10m' as const,
  language: 'zh' as const,
  aiConfig: {
    provider: 'builtin' as const,
    protocol: 'chat-completions' as AiProtocol,
    endpoint: 'https://api.deepseek.com/v1',
    apiKey: '',
    model: 'deepseek-chat',
  },
};

function loadSettings() {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      legacyAiKey = typeof parsed.aiConfig?.apiKey === 'string' ? parsed.aiConfig.apiKey : '';
      if (parsed.aiConfig) { delete parsed.aiConfig.apiKey; localStorage.setItem(SETTINGS_KEY, JSON.stringify(parsed)); }
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
        cursorTheme: normalizeCursorTheme(parsed.cursorTheme),
        diffFontSize: typeof parsed.diffFontSize === 'number' && [12, 13, 14, 16, 18].includes(parsed.diffFontSize) ? parsed.diffFontSize : 13,
        aiConfig: {
          ...DEFAULT_SETTINGS.aiConfig,
          ...(parsed.aiConfig || {}),
          protocol: ['chat-completions', 'responses', 'anthropic-messages'].includes(parsed.aiConfig?.protocol) ? parsed.aiConfig.protocol : 'chat-completions',
          apiKey: legacyAiKey,
        },
      };
    }
  } catch {
    // fallback
  }
  return DEFAULT_SETTINGS;
}

export const useSettingsStore = create<SettingsState>((set, get) => {
  const initial = loadSettings();
  applyCursorTheme(initial.cursorTheme);

  const persist = (partial: Partial<typeof initial>) => {
    try {
      const current = {
        gitCliPath: get().gitCliPath,
        compactMode: get().compactMode,
        cursorTheme: get().cursorTheme,
        diffFontSize: get().diffFontSize,
        diffWrapLines: get().diffWrapLines,
        diffIgnoreWhitespace: get().diffIgnoreWhitespace,
        autoFetchInterval: get().autoFetchInterval,
        aiConfig: get().aiConfig,
        language: get().language,
        ...partial,
      };
      const { apiKey: _secret, ...publicAiConfig } = current.aiConfig;
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...current, aiConfig: publicAiConfig }));
    } catch {
      // ignore
    }
  };

  return {
    ...initial,
    credentialError: null,
    initSecrets: async () => {
      if (!isDesktop()) return;
      if (secretInit) return secretInit;
      const version = keyVersion;
      secretInit = (async () => {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          if (legacyAiKey && version === keyVersion) {
            const migrationKey = legacyAiKey;
            keyWrites = keyWrites.then(() => invoke<void>('store_ai_key', { key: migrationKey }));
            await keyWrites;
            legacyAiKey = '';
          }
          await keyWrites;
          const key = await invoke<string | null>('get_ai_key');
          if (version === keyVersion) set({ aiConfig: { ...get().aiConfig, apiKey: key || '' } });
        } catch (error) { set({ credentialError: `无法读取或迁移 AI 凭据: ${String(error)}` }); }
      })();
      return secretInit;
    },

    setGitCliPath: (gitCliPath: string) => {
      set({ gitCliPath });
      persist({ gitCliPath });
    },

    setCompactMode: (compactMode: boolean) => {
      set({ compactMode });
      persist({ compactMode });
      if (typeof document !== 'undefined') {
        if (compactMode) {
          document.documentElement.classList.add('compact-mode');
        } else {
          document.documentElement.classList.remove('compact-mode');
        }
      }
    },

    setCursorTheme: (theme) => {
      const cursorTheme = normalizeCursorTheme(theme);
      set({ cursorTheme });
      persist({ cursorTheme });
      applyCursorTheme(cursorTheme);
    },

    setDiffFontSize: (size: number) => {
      if (![12, 13, 14, 16, 18].includes(size)) return;
      set({ diffFontSize: size }); persist({ diffFontSize: size });
    },
    setDiffWrapLines: (diffWrapLines) => { set({ diffWrapLines }); persist({ diffWrapLines }); },
    setDiffIgnoreWhitespace: (diffIgnoreWhitespace) => { set({ diffIgnoreWhitespace }); persist({ diffIgnoreWhitespace }); },

    setAutoFetchInterval: (autoFetchInterval: 'never' | '5m' | '10m' | '30m') => {
      set({ autoFetchInterval });
      persist({ autoFetchInterval });
    },

    setLanguage: (language: Language) => {
      set({ language });
      persist({ language });
    },

    setAiConfig: (config: Partial<AiApiConfig>) => {
      const updatedAi = { ...get().aiConfig, ...config };
      if (config.apiKey !== undefined) {
        keyVersion++;
        legacyAiKey = '';
        if (isDesktop()) {
          const key = config.apiKey;
          keyWrites = keyWrites.catch(() => {}).then(async () => {
            const { invoke } = await import('@tauri-apps/api/core');
            await invoke('store_ai_key', { key });
            set({ credentialError: null });
          }).catch((error) => { set({ credentialError: `无法安全保存 AI 凭据: ${String(error)}` }); });
        }
      }
      set({ aiConfig: updatedAi });
      persist({ aiConfig: updatedAi });
    },

    resetSettings: () => {
      get().setAiConfig({ apiKey: '' });
      set(DEFAULT_SETTINGS);
      applyCursorTheme('system');
      localStorage.removeItem(SETTINGS_KEY);
      if (typeof document !== 'undefined') {
        document.documentElement.classList.remove('compact-mode');
      }
    },
  };
});
