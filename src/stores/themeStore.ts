import { create } from 'zustand';

export type ThemeMode = 'dark' | 'light' | 'system';

interface ThemeState {
  theme: ThemeMode;
  resolvedTheme: 'dark' | 'light';
  setTheme: (theme: ThemeMode) => void;
  initTheme: () => void;
}

const THEME_STORAGE_KEY = 'auu_git_theme';

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: 'system',
  resolvedTheme: 'dark',

  setTheme: (theme: ThemeMode) => {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    const resolvedTheme = resolveEffectiveTheme(theme);
    applyThemeClass(resolvedTheme);
    set({ theme, resolvedTheme });
  },

  initTheme: () => {
    // 产品进入赛博朋克正式阶段：默认呈现完整霓虹暗色形态
    const saved = (localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode) || 'dark';
    const resolvedTheme = resolveEffectiveTheme(saved);
    applyThemeClass(resolvedTheme);
    set({ theme: saved, resolvedTheme });

    // Listen for OS color scheme change
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = () => {
        if (get().theme === 'system') {
          const effective = resolveEffectiveTheme('system');
          applyThemeClass(effective);
          set({ resolvedTheme: effective });
        }
      };
      mediaQuery.addEventListener('change', listener);
    }
  },
}));

function resolveEffectiveTheme(mode: ThemeMode): 'dark' | 'light' {
  if (mode === 'system') {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'dark';
  }
  return mode;
}

function applyThemeClass(theme: 'dark' | 'light') {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}
