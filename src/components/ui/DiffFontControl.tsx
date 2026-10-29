import { useI18n } from '@/i18n';
import { useSettingsStore } from '@/stores/settingsStore';
import { useShallow } from 'zustand/react/shallow';

export function DiffFontControl() {
  const { t } = useI18n();
  const { diffFontSize, setDiffFontSize } = useSettingsStore(useShallow(state => ({ diffFontSize: state.diffFontSize, setDiffFontSize: state.setDiffFontSize })));
  return <select aria-label={t('composer.diffFontSize')} title={t('composer.diffFontSize')} value={diffFontSize} onChange={event => setDiffFontSize(Number(event.target.value))} className="glass-control h-7 px-1.5 text-[12px] text-foreground">
    {[12, 13, 14, 16, 18].map(size => <option key={size} value={size}>{size}px</option>)}
  </select>;
}
