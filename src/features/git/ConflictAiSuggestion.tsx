import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import { parseConflictSuggestion } from '@/services/ai/GitAssistantValidation';

export function ConflictAiSuggestion({ raw, onApply }: { raw: string; onApply: (content: string) => void }) {
  const { t } = useI18n();
  const [parsed] = useState(() => { try { return { ...parseConflictSuggestion(raw), error: '' }; } catch (error: any) { return { explanation: '', resolution: '', error: error.message }; } });
  const [draft, setDraft] = useState(parsed.resolution);
  if (parsed.error) return <p role="alert" className="text-destructive text-sm">{parsed.error}</p>;
  return <div className="space-y-3"><p className="text-sm whitespace-pre-wrap select-text">{parsed.explanation}</p><label className="block text-sm space-y-2"><span>{t('flow.proposedResolution')}</span><textarea value={draft} onChange={e => setDraft(e.target.value)} className="w-full h-56 border border-input rounded bg-background p-3 font-mono text-xs" /></label><p className="text-xs text-muted-foreground">{t('flow.conflictReviewHint')}</p><Button disabled={/^(?:<{7}|={7}|>{7}|\|{7})/m.test(draft)} onClick={() => onApply(draft)}>{t('flow.applyBlock')}</Button></div>;
}
