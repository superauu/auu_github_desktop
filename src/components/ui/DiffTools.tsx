import { useEffect, useMemo, useState } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useSettingsStore } from '@/stores/settingsStore';
import { Button } from './button';

export function highlightDiff(content: string, query: string) {
  if (!query) return content;
  const parts = []; let offset = 0; let hits = 0;
  const lower = content.toLowerCase(), needle = query.toLowerCase();
  while (hits++ < 100) {
    const index = lower.indexOf(needle, offset);
    if (index < 0) break;
    parts.push(content.slice(offset, index), <mark key={index} className="bg-primary/20 text-foreground rounded-sm">{content.slice(index, index + query.length)}</mark>);
    offset = index + query.length;
  }
  parts.push(content.slice(offset)); return parts;
}

export function DiffTools({ query, onQueryChange, contents, targetId, onReload }: {
  query: string; onQueryChange: (query: string) => void; contents: readonly string[]; targetId: string; onReload?: () => void;
}) {
  const { t } = useI18n();
  const wrap = useSettingsStore(state => state.diffWrapLines);
  const ignore = useSettingsStore(state => state.diffIgnoreWhitespace);
  const [cursor, setCursor] = useState(0);
  const matches = useMemo(() => query ? contents.flatMap((text, index) => text.toLowerCase().includes(query.toLowerCase()) ? [index] : []) : [], [contents, query]);
  const reveal = (position: number) => {
    if (!matches.length) return;
    const next = (position + matches.length) % matches.length;
    setCursor(next);
    document.getElementById(targetId)?.querySelector('[data-virtual-count]')?.dispatchEvent(new CustomEvent('auugit-focus-row', { detail: matches[next] }));
  };
  useEffect(() => { setCursor(0); if (query && matches.length) reveal(0); }, [query, matches]);
  return <div className="workspace-divider shrink-0 flex flex-wrap items-center gap-2 border-b border-border px-3 py-1.5 text-[12px]">
    <input aria-label={t('diff.search')} placeholder={t('diff.search')} value={query} maxLength={128} onChange={event => onQueryChange(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); reveal(cursor + (event.shiftKey ? -1 : 1)); } }} className="glass-control h-7 min-w-24 flex-1 max-w-56 px-2" />
    {query && <span className="text-muted-foreground">{matches.length ? cursor + 1 : 0}/{matches.length}</span>}
    <Button variant="ghost" size="xs" disabled={!matches.length} aria-label={t('diff.previousMatch')} onClick={() => reveal(cursor - 1)}><ChevronUp className="h-3.5 w-3.5" /></Button>
    <Button variant="ghost" size="xs" disabled={!matches.length} aria-label={t('diff.nextMatch')} onClick={() => reveal(cursor + 1)}><ChevronDown className="h-3.5 w-3.5" /></Button>
    <label className="flex items-center gap-1"><input type="checkbox" checked={wrap} onChange={event => useSettingsStore.getState().setDiffWrapLines(event.target.checked)} />{t('diff.wrap')}</label>
    <label className="flex items-center gap-1" title={t('diff.ignoreHint')}><input type="checkbox" checked={ignore} onChange={event => { useSettingsStore.getState().setDiffIgnoreWhitespace(event.target.checked); onReload?.(); }} />{t('diff.ignoreWhitespace')}</label>
    {ignore && <p className="w-full text-muted-foreground">{t('diff.ignoreHint')}</p>}
  </div>;
}
