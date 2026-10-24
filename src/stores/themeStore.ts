import { create } from 'zustand';

export type ThemeMode = 'dark' | 'light' | 'system';

interface ThemeState {
  theme: ThemeMode;
  resolvedTheme: 'dark' | 'light';
  setTheme: (theme: ThemeMode) => void;
  /** Registers the OS color-scheme listener; returns its cleanup (undefined when matchMedia is unavailable). */
  initTheme: () => (() => void) | undefined;
}

const THEME_STORAGE_KEY = 'auu_git_theme';

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: 'system',
  resolvedTheme: 'dark',

  setTheme: (theme: ThemeMode) => {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    const resolvedTheme = resolveEffectiveTheme(theme);
    applyThemeClass(resolvedTheme, true);
    set({ theme, resolvedTheme });
  },

  initTheme: () => {
    // Default to the dark workspace while preserving the user's saved preference.
    try {
      const saved = (localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode) || 'dark';
      const resolvedTheme = resolveEffectiveTheme(saved);
      applyThemeClass(resolvedTheme);
      set({ theme: saved, resolvedTheme });
    } catch {
      // localStorage unavailable, use defaults
    }

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
      // Cleanup listener on re-init (e.g., StrictMode, HMR)
      return () => {
        mediaQuery.removeEventListener('change', listener);
      };
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

function applyThemeClass(theme: 'dark' | 'light', animate: boolean = false) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const apply = () => {
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  };

  // 用户手动切换主题时用 View Transitions 做全屏交叉淡入；
  // 系统跟随/reduced-motion/不支持的环境直接落类，无动画
  const reduceMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  if (animate && !reduceMotion && typeof document !== 'undefined' && 'startViewTransition' in document) {
    (document as Document & { startViewTransition: (cb: () => void) => void }).startViewTransition(apply);
  } else {
    apply();
  }
}
