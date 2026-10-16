import { useI18n } from '@/i18n';
import { useSettingsStore } from '@/stores/settingsStore';

export function DiffFontControl() {
  const { t } = useI18n();
  const { diffFontSize, setDiffFontSize } = useSettingsStore();
  return <select aria-label={t('composer.diffFontSize')} title={t('composer.diffFontSize')} value={diffFontSize} onChange={event => setDiffFontSize(Number(event.target.value))} className="h-7 rounded-md border border-input bg-background px-1.5 text-[12px] text-foreground">
    {[12, 13, 14, 16, 18].map(size => <option key={size} value={size}>{size}px</option>)}
  </select>;
}
