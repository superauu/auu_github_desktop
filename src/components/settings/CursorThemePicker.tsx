import { MousePointer2 } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useSettingsStore } from '@/stores/settingsStore';
import { CURSOR_STYLES, getCursorStyle, normalizeCursorTheme } from '@/utils/cursorThemes';

export function CursorThemePicker() {
  const { t } = useI18n();
  const selected = useSettingsStore(state => state.cursorTheme);
  const setCursorTheme = useSettingsStore(state => state.setCursorTheme);
  const style = getCursorStyle(selected);

  return <section className="space-y-3 pt-4 border-t border-border" aria-labelledby="cursor-theme-label">
    <div className="space-y-1">
      <label id="cursor-theme-label" htmlFor="cursor-theme" className="block font-medium text-foreground">{t('settings.cursor.label')}</label>
      <p className="text-[12px] text-muted-foreground">{t('settings.cursor.description')}</p>
    </div>
    <select id="cursor-theme" value={selected} onChange={event => setCursorTheme(normalizeCursorTheme(event.target.value))} className="h-9 w-full rounded-md border border-input bg-background px-2 text-[13px] text-foreground">
      <option value="system">{t('settings.cursor.system')}</option>
      {CURSOR_STYLES.map(item => <option key={item.id} value={item.id}>{item.id === 'ice-rounded' ? t('settings.cursor.ice') : item.name}</option>)}
    </select>
    {style ? <div className="space-y-2" aria-label={t('settings.cursor.preview')}>
      <div className="grid grid-cols-2 gap-3">
        {[false, true].map(dark => <div key={String(dark)} className={dark ? 'min-w-0 rounded-md border border-slate-700 bg-neutral-900 p-3 text-slate-100' : 'min-w-0 rounded-md border border-slate-300 bg-slate-50 p-3 text-slate-900'}>
          <div className="text-[12px]">{t(dark ? 'settings.cursor.darkPreview' : 'settings.cursor.lightPreview')}</div>
          <div className="flex justify-evenly items-center gap-2 pt-2">
            <img src={style.arrow} width={64} height={64} className="h-16 w-16" alt={t('settings.cursor.arrow')} draggable={false} />
            <img src={style.hand} width={64} height={64} className="h-16 w-16" alt={t('settings.cursor.hand')} draggable={false} />
          </div>
        </div>)}
      </div>
      <p className="text-[12px] text-muted-foreground">{t('settings.cursor.previewHint')}</p>
    </div> : <div className="flex gap-2 rounded-md border border-border bg-muted/30 p-3 text-muted-foreground">
      <MousePointer2 className="h-4 w-4 shrink-0 mt-0.5" />
      <p className="text-[12px] leading-relaxed">{t('settings.cursor.systemHint')}</p>
    </div>}
  </section>;
}
