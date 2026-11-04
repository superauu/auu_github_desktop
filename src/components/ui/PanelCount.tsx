import { useI18n } from '@/i18n';

type CountKind = 'totalMatching' | 'filteredLoaded' | 'loaded' | 'changes' | 'comments';

/** 数字保持紧凑；悬停与读屏提供计数口径，避免把分页条数误读为总数。 */
export function PanelCount({ count, kind = 'loaded' }: { count: number; kind?: CountKind }) {
  const { t, lang } = useI18n();
  const value = new Intl.NumberFormat(lang === 'zh' ? 'zh-CN' : 'en').format(count);
  const description = t(`ui.count.${kind}`).replace('{count}', value);
  return <span className="panel-count shrink-0" title={description} aria-label={description}>{value}</span>;
}
