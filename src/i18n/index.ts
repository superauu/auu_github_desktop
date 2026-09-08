/**
 * 轻量 i18n 入口。
 * - 语言状态持久化在 settingsStore（auu_git_settings.language）
 * - 资源文件：zh.ts / en.ts，键名一一对应
 * - translate() 可在组件外使用（toast、service 层）
 * - useI18n() 供 React 组件订阅语言变化
 */
import { useSettingsStore } from '@/stores/settingsStore';
import { zh } from './zh';
import { en } from './en';

export type Lang = 'zh' | 'en';
export type TranslationKey = keyof typeof zh;

const dictionaries: Record<Lang, Record<string, string>> = {
  zh: zh as unknown as Record<string, string>,
  en: en as unknown as Record<string, string>,
};

/** 组件外可用的纯翻译函数（缺键回退中文，再回退键名） */
export function translate(lang: Lang, key: string): string {
  return dictionaries[lang]?.[key] ?? dictionaries.zh[key] ?? key;
}

/** 当前语言下的快捷翻译（非响应式，适合 toast 等一次性场景） */
export function tNow(key: string): string {
  return translate(useSettingsStore.getState().language, key);
}

/** React 组件用：订阅语言变化 */
export function useI18n() {
  const lang = useSettingsStore((s) => s.language);
  return {
    lang,
    t: (key: TranslationKey | string) => translate(lang, key),
  };
}
