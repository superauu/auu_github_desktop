/**
 * 轻量 i18n 入口。
 * - 语言状态持久化在 settingsStore（auu_git_settings.language）
 * - 资源文件：zh.ts / en.ts，键名一一对应
 * - translate() 可在组件外使用（toast、service 层）
 * - useI18n() 供 React 组件订阅语言变化
 */
import { useCallback } from 'react';
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

/**
 * 插值：`{name}` 占位符按 vars 展开；缺失/为 null 的变量保留占位符原样。
 * 函数式替换免疫 `$&`/`$'` 等序列污染（值含 `$` 时字符串 replacement 会被特殊解释）——
 * 全仓 `t(key).replace('{x}', v)` 统一收敛到 tf/tfNow。
 */
export function interpolate(template: string, vars?: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, name) => String(vars?.[name] ?? `{${name}}`));
}

/** 非响应式插值翻译（toast 等一次性场景） */
export function tfNow(key: string, vars?: Record<string, string | number>): string {
  return interpolate(translate(useSettingsStore.getState().language, key), vars);
}

/** 服务层抛出的本地化错误：message 按当前语言生成，key 保持稳定供测试与上层判断 */
export class LocalizedError extends Error {
  readonly key: string;
  constructor(key: string, vars?: Record<string, string | number>) {
    super(interpolate(translate(useSettingsStore.getState().language, key), vars));
    this.name = 'LocalizedError';
    this.key = key;
  }
}

/** React 组件用：订阅语言变化 */
export function useI18n() {
  const lang = useSettingsStore((s) => s.language);
  const t = useCallback((key: TranslationKey | string) => translate(lang, key), [lang]);
  const tf = useCallback((key: TranslationKey | string, vars?: Record<string, string | number>) => interpolate(translate(lang, key), vars), [lang]);
  return { lang, t, tf };
}
