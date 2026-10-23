import { useI18n } from '@/i18n';
import { errorGuidance, openGitSettings } from '@/utils/errorGuidance';

export function ErrorNotice({ error, compact = false, onOpenSettings }: { error: string; compact?: boolean; onOpenSettings?: () => void }) {
  const { t } = useI18n();
  const kind = errorGuidance(error);
  return <div className="min-w-0 space-y-1 text-xs">
    <p className="font-medium text-destructive">{t(`ui.error.${kind}`)}</p>
    <p className="text-muted-foreground leading-relaxed">{t(`ui.error.${kind}Hint`)}</p>
    {kind === 'git' && <button type="button" className="min-h-7 text-primary hover:underline" onClick={onOpenSettings || openGitSettings}>{t('ui.error.gitSettings')}</button>}
    <details className="text-muted-foreground">
      <summary className="cursor-pointer min-h-7 py-1 hover:text-foreground">{t('ui.error.details')}</summary>
      <pre className={`${compact ? 'max-h-28' : 'max-h-48'} overflow-auto whitespace-pre-wrap break-words rounded border border-border p-2 text-[12px] select-text`}>{error}</pre>
    </details>
  </div>;
}
