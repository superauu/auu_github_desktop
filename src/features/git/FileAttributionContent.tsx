import { AlignLeft, History, Loader2 } from 'lucide-react';
import { useI18n } from '@/i18n';
import { cn } from '@/utils/cn';
import type { GitBlameLine, GitCommit } from '@/services/git/types';

export function FileAttributionContent({ contentMode, diffFontSize, loadingFileData, blameLines, fileCommits, jumpToCommit }: {
  contentMode: 'blame' | 'history'; diffFontSize: number; loadingFileData: boolean;
  blameLines: GitBlameLine[]; fileCommits: GitCommit[]; jumpToCommit: (hash: string) => void;
}) {
  const { t, lang } = useI18n();
  const blameTints = [
    'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',
    'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    'bg-amber-500/15 text-amber-700 dark:text-amber-300',
    'bg-rose-500/15 text-rose-700 dark:text-rose-300',
    'bg-sky-500/15 text-sky-700 dark:text-sky-300',
    'bg-teal-500/15 text-teal-700 dark:text-teal-300',
  ];
  const blameTint = (hash: string) =>
    blameTints[
      [...(hash || '0')].reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % blameTints.length
    ];

  const blameDate = (iso: string) => {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString(lang === 'en' ? 'en-US' : 'zh-CN');
    } catch {
      return '';
    }
  };

  return contentMode === 'blame' ? (
          /* Blame View */
          <div style={{ fontSize: diffFontSize }} className="glass-editor flex-1 overflow-auto font-mono leading-relaxed text-foreground select-text">
            {loadingFileData ? (
              <div className="py-24 flex items-center justify-center gap-2 text-muted-foreground select-none">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-xs">{t('changes.loadingData')}</span>
              </div>
            ) : blameLines.length === 0 ? (
              <div className="py-24 text-center space-y-2 text-muted-foreground select-none">
                <AlignLeft className="h-8 w-8 mx-auto text-muted-foreground/30" />
                <div className="text-xs">{t('changes.blameEmpty')}</div>
              </div>
            ) : (
              blameLines.map((bl, idx) => (
                <div
                  key={idx}
                  className="flex items-stretch border-b border-border/25 hover:bg-accent/40 dark:hover:bg-white/[0.03] transition-colors"
                >
                  <div className="w-10 px-2 text-right text-muted-foreground select-none shrink-0 bg-muted/40 dark:bg-background/20">
                    {bl.lineNo}
                  </div>
                  <button
                    onClick={() => jumpToCommit(bl.hash)}
                    className={cn(
                      'w-24 shrink-0 truncate px-1.5 font-mono text-[12px] hover:underline cursor-pointer text-left',
                      blameTint(bl.hash)
                    )}
                    title={`${bl.shortHash} ${bl.summary}`}
                  >
                    {bl.shortHash}
                  </button>
                  <div className="w-24 shrink-0 truncate px-1.5 text-muted-foreground">
                    {bl.author}
                  </div>
                  <div className="w-20 shrink-0 px-1 text-muted-foreground/70 font-mono text-[12px]">
                    {blameDate(bl.authorDateIso)}
                  </div>
                  <div className="px-2 whitespace-pre font-mono flex-1 overflow-x-auto">
                    {bl.content}
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          /* File History View */
          <div className="glass-editor flex-1 overflow-auto text-foreground select-none">
            {loadingFileData ? (
              <div className="py-24 flex items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-xs">{t('changes.loadingData')}</span>
              </div>
            ) : fileCommits.length === 0 ? (
              <div className="py-24 text-center space-y-2 text-muted-foreground">
                <History className="h-8 w-8 mx-auto text-muted-foreground/30" />
                <div className="text-xs">{t('changes.fileHistoryEmpty')}</div>
              </div>
            ) : (
              fileCommits.map((c) => (
                <div
                  key={c.hash}
                  onClick={() => jumpToCommit(c.hash)}
                  className="flex items-center gap-2 px-3 py-1.5 border-b border-border/25 hover:bg-accent/40 dark:hover:bg-white/[0.03] cursor-pointer transition-colors text-[12px]"
                >
                  <span className="font-mono text-cyan-600 dark:text-cyan-400 shrink-0">
                    {c.shortHash}
                  </span>
                  <span className="flex-1 truncate" title={c.subject}>
                    {c.subject}
                  </span>
                  <span className="text-muted-foreground shrink-0 max-w-[100px] truncate">
                    {c.author.name}
                  </span>
                  <span className="text-muted-foreground/70 font-mono text-[12px] shrink-0 w-20 text-right">
                    {c.author.relativeDate}
                  </span>
                </div>
              ))
            )}
          </div>
        );
}
