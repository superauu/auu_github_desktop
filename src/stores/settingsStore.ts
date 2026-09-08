import { create } from 'zustand';

export interface AiApiConfig {
  provider: 'builtin' | 'openai-compatible';
  endpoint: string;
  apiKey: string;
  model: string;
}

export interface SettingsState {
  gitCliPath: string;
  compactMode: boolean;
  autoFetchInterval: 'never' | '5m' | '10m' | '30m';
  aiConfig: AiApiConfig;

  // Actions
  setGitCliPath: (path: string) => void;
  setCompactMode: (enabled: boolean) => void;
  setAutoFetchInterval: (interval: 'never' | '5m' | '10m' | '30m') => void;
  setAiConfig: (config: Partial<AiApiConfig>) => void;
  resetSettings: () => void;
}

const SETTINGS_KEY = 'auu_git_settings';

const DEFAULT_SETTINGS = {
  gitCliPath: 'git',
  compactMode: false,
  autoFetchInterval: '10m' as const,
  aiConfig: {
    provider: 'builtin' as const,
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
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
        aiConfig: {
          ...DEFAULT_SETTINGS.aiConfig,
          ...(parsed.aiConfig || {}),
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

  const persist = (partial: Partial<typeof initial>) => {
    try {
      const current = {
        gitCliPath: get().gitCliPath,
        compactMode: get().compactMode,
        autoFetchInterval: get().autoFetchInterval,
        aiConfig: get().aiConfig,
        ...partial,
      };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(current));
    } catch {
      // ignore
    }
  };

  return {
    ...initial,

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

    setAutoFetchInterval: (autoFetchInterval: 'never' | '5m' | '10m' | '30m') => {
      set({ autoFetchInterval });
      persist({ autoFetchInterval });
    },

    setAiConfig: (config: Partial<AiApiConfig>) => {
      const updatedAi = { ...get().aiConfig, ...config };
      set({ aiConfig: updatedAi });
      persist({ aiConfig: updatedAi });
    },

    resetSettings: () => {
      set(DEFAULT_SETTINGS);
      localStorage.removeItem(SETTINGS_KEY);
      if (typeof document !== 'undefined') {
        document.documentElement.classList.remove('compact-mode');
      }
    },
  };
});
