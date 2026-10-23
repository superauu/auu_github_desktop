import { Copy, Minus, Square, X } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { WindowChrome } from '@/hooks/useWindowChrome';

export function WindowControls({ chrome }: { chrome: WindowChrome }) {
  const { t } = useI18n();
  const disabled = !chrome.desktop || chrome.pending;
  const maximizeLabel = t(chrome.maximized ? 'window.restore' : 'window.maximize');
  return <div className="window-controls flex h-full shrink-0 items-stretch" role="group" aria-label={t('window.controls')} data-no-window-drag>
    <button type="button" className="window-control" aria-label={t('window.minimize')} title={t(chrome.desktop ? 'window.minimize' : 'window.desktopOnly')} disabled={disabled} onClick={() => void chrome.perform('minimize')}><Minus className="h-3.5 w-3.5" /></button>
    <button type="button" className="window-control" aria-label={maximizeLabel} title={chrome.desktop ? maximizeLabel : t('window.desktopOnly')} disabled={disabled} onClick={() => void chrome.perform('toggleMaximize')}>
      {chrome.maximized ? <Copy className="h-3 w-3 rotate-180" /> : <Square className="h-3 w-3" />}
    </button>
    <button type="button" className="window-control window-control-close" aria-label={t('window.close')} title={t(chrome.desktop ? 'window.close' : 'window.desktopOnly')} disabled={disabled} onClick={() => void chrome.perform('close')}><X className="h-4 w-4" /></button>
  </div>;
}
