import { useShallow } from 'zustand/react/shallow';
import { ModalSurface } from '@/components/ui/ModalSurface';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CaseSensitive, Copy, ExternalLink, FileSearch, Loader2, Regex, WholeWord } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useRepoStore } from '@/stores/repoStore';
import { toast } from '@/stores/toastStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { codeSearchService, MAX_HITS, type CodeSearchHit, type CodeSearchResult } from '@/services/git/CodeSearchService';
import { revealLocalFile } from '@/services/errors/stackNavigation';

interface GlobalSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const toggleButton = (active: boolean) =>
  `h-7 px-2 inline-flex items-center gap-1 rounded-md border text-[12px] transition-colors ${active
    ? 'border-primary/40 bg-primary/10 text-primary'
    : 'border-border/60 text-muted-foreground hover:bg-accent hover:text-foreground'}`;

export const GlobalSearchDialog: React.FC<GlobalSearchDialogProps> = ({ open, onOpenChange }) => {
  const { t } = useI18n();
  const { currentRepo } = useRepoStore(useShallow(state => ({ currentRepo: state.currentRepo })));
  const repoPath = currentRepo?.path;
  const [query, setQuery] = useState('');
  const [ignoreCase, setIgnoreCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [regex, setRegex] = useState(false);
  const [pathFilter, setPathFilter] = useState('');
  const [result, setResult] = useState<CodeSearchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);

  // 正则模式的预校验：ERE 与 JS 正则足够接近，明显非法的输入直接提示，不打 git。
  const regexInvalid = regex && query.trim().length > 0 && (() => {
    try { new RegExp(query.trim()); return false; } catch { return true; }
  })();

  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    const id = ++request.current;
    if (!repoPath || regexInvalid || trimmed.length < 2) {
      setResult(null); setError(null); setBusy(false);
      return;
    }
    setBusy(true);
    const timer = setTimeout(() => {
      codeSearchService.grepRepo(repoPath, trimmed, {
        ignoreCase, wholeWord, regex,
        pathspecs: pathFilter.trim() ? [pathFilter.trim()] : [],
      })
        .then((res) => {
          if (id !== request.current || useRepoStore.getState().currentRepo?.path !== repoPath) return;
          setResult(res); setError(null);
        })
        .catch((err: unknown) => {
          if (id !== request.current) return;
          setResult(null);
          setError(err instanceof Error ? err.message : t('codeSearch.searchFailed'));
        })
        .finally(() => { if (id === request.current) setBusy(false); });
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, repoPath, query, ignoreCase, wholeWord, regex, pathFilter, regexInvalid]);

  // 按文件分组（保持 git 输出顺序），组内行号排序展示。
  const groups = useMemo(() => {
    const map = new Map<string, CodeSearchHit[]>();
    result?.hits.forEach((hit) => {
      const bucket = map.get(hit.file);
      if (bucket) bucket.push(hit);
      else map.set(hit.file, [hit]);
    });
    return [...map.entries()];
  }, [result]);

  const openHit = async (hit: CodeSearchHit) => {
    if (!repoPath) return;
    const absolute = `${repoPath.replace(/[\\/]+$/, '')}/${hit.file}`;
    try {
      const outcome = await revealLocalFile(absolute);
      if (outcome === 'copied') toast.info(absolute);
    } catch (err) {
      toast.error(t('codeSearch.openFailed'), err instanceof Error ? err.message : String(err));
    }
  };

  const copyHit = async (hit: CodeSearchHit) => {
    try {
      await navigator.clipboard.writeText(`${hit.file}:${hit.line}: ${hit.text}`);
      toast.success(t('codeSearch.copied'));
    } catch {
      toast.error(t('rightPane.operationFailed'));
    }
  };

  if (!open) return null;

  return (
    <ModalSurface onDismiss={() => onOpenChange(false)} label={t('codeSearch.title')}
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pb-4 pt-[min(10dvh,5rem)] bg-background/80 backdrop-blur-md animate-in fade-in-0 duration-150 select-none">
      <div className="w-full max-w-2xl rounded-2xl border border-border/80 bg-popover/95 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="shrink-0 border-b border-border/60 p-2 space-y-2">
          <div className="command-search-field h-10 flex items-center gap-2 rounded-md border border-input bg-background px-3 focus-within:border-ring focus-within:ring-1 focus-within:ring-inset focus-within:ring-ring">
            <FileSearch className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              aria-label={t('codeSearch.placeholder')} placeholder={t('codeSearch.placeholder')}
              value={query} onChange={(e) => setQuery(e.target.value)}
              className="h-8 min-w-0 flex-1 border-0 bg-transparent p-0 text-xs text-foreground placeholder:text-muted-foreground outline-none"
              autoFocus
            />
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />}
            <kbd className="pointer-events-none inline-flex h-5 shrink-0 select-none items-center rounded border border-border bg-muted/50 px-1.5 font-mono text-[12px] text-muted-foreground">ESC</kbd>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap px-1">
            <button type="button" aria-pressed={ignoreCase} title={t('codeSearch.caseSensitive')} onClick={() => setIgnoreCase(v => !v)} className={toggleButton(ignoreCase)}><CaseSensitive className="h-3.5 w-3.5" />{t('codeSearch.caseSensitive')}</button>
            <button type="button" aria-pressed={wholeWord} title={t('codeSearch.wholeWord')} onClick={() => setWholeWord(v => !v)} className={toggleButton(wholeWord)}><WholeWord className="h-3.5 w-3.5" />{t('codeSearch.wholeWord')}</button>
            <button type="button" aria-pressed={regex} title={t('codeSearch.regex')} onClick={() => setRegex(v => !v)} className={toggleButton(regex)}><Regex className="h-3.5 w-3.5" />{t('codeSearch.regex')}</button>
            <Input value={pathFilter} onChange={(e) => setPathFilter(e.target.value)} aria-label={t('codeSearch.pathFilter')} placeholder={t('codeSearch.pathFilter')} className="h-7 flex-1 min-w-40 text-[12px] bg-secondary/30" />
          </div>
        </div>
        <div className="max-h-[55dvh] min-h-[8rem] overflow-y-auto overscroll-contain text-xs">
          {!currentRepo ? (
            <p className="py-10 text-center text-muted-foreground">{t('codeSearch.noRepo')}</p>
          ) : regexInvalid ? (
            <p className="py-10 text-center text-muted-foreground">{t('codeSearch.invalidRegex')}</p>
          ) : query.trim().length < 2 ? (
            <p className="py-10 text-center text-muted-foreground">{t('codeSearch.tooShort')}</p>
          ) : error ? (
            <div role="alert" className="m-3"><ErrorInline message={error} /></div>
          ) : !result ? (
            <p className="py-10 text-center text-muted-foreground">{busy ? t('codeSearch.searching') : null}</p>
          ) : result.hits.length === 0 ? (
            <p className="py-10 text-center text-muted-foreground">{t('codeSearch.noMatches')}</p>
          ) : (
            <>
              <p className="px-3 pt-2 pb-1 text-[12px] text-muted-foreground tabular-nums">
                {t('codeSearch.resultSummary').replace('{hits}', String(result.hits.length)).replace('{files}', String(groups.length))}
                {result.truncated && ` · ${t('codeSearch.truncated').replace('{n}', String(MAX_HITS))}`}
              </p>
              {groups.map(([file, hits]) => (
                <div key={file}>
                  <div className="sticky top-0 z-10 flex items-center gap-2 border-y border-border/40 bg-muted/60 px-3 py-1 backdrop-blur-sm">
                    <span className="font-mono text-[12px] text-foreground/85 truncate" title={file}>{file}</span>
                    <span className="text-[12px] text-muted-foreground tabular-nums shrink-0">{hits.length}</span>
                  </div>
                  {hits.map((hit, index) => (
                    <div key={`${hit.line}:${hit.column}:${index}`} className="group flex items-start gap-2 px-3 py-1 hover:bg-accent/40 border-b border-border/25">
                      <span className="font-mono text-[12px] text-muted-foreground tabular-nums shrink-0 w-14 text-right select-text">{hit.line}:{hit.column}</span>
                      <span data-code-search-text className="font-mono text-[12px] whitespace-pre-wrap wrap-break-word flex-1 select-text text-foreground/90">
                        <GrepMatchText hit={hit} query={query.trim()} regex={regex} ignoreCase={ignoreCase} wholeWord={wholeWord} />
                      </span>
                      <span className="flex gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon-xs" aria-label={t('codeSearch.copyLine')} title={t('codeSearch.copyLine')} onClick={() => void copyHit(hit)}><Copy className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon-xs" aria-label={t('codeSearch.openFile')} title={t('codeSearch.openFile')} onClick={() => void openHit(hit)}><ExternalLink className="h-3.5 w-3.5" /></Button>
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </ModalSurface>
  );
};

/** 字面模式高亮命中片段；正则模式只显示原文（避免重复实现 ERE 语义）。 */
function GrepMatchText({ hit, query, regex, ignoreCase, wholeWord }: {
  hit: CodeSearchHit; query: string; regex: boolean; ignoreCase: boolean; wholeWord: boolean;
}) {
  if (regex) return <>{hit.text}</>;
  const needle = wholeWord
    ? new RegExp(`(?<![\\w])${escapeRegExp(query)}(?![\\w])`, ignoreCase ? 'i' : '')
    : new RegExp(escapeRegExp(query), ignoreCase ? 'i' : '');
  const match = needle.exec(hit.text);
  if (!match || match.index === undefined) return <>{hit.text}</>;
  const start = match.index, end = start + match[0].length;
  return (
    <>
      {hit.text.slice(0, start)}
      <mark className="rounded-sm bg-primary/20 text-foreground">{hit.text.slice(start, end)}</mark>
      {hit.text.slice(end)}
    </>
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function ErrorInline({ message }: { message: string }) {
  return <p className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-[12px] text-destructive wrap-break-word">{message}</p>;
}
