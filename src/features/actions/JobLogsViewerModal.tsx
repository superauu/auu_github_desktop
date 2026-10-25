import { VirtualRows } from '@/components/ui/VirtualRows';
import { ModalSurface } from '@/components/ui/ModalSurface';
import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Terminal,
  X,
  Copy,
  Check,
  Search,
  ArrowDownToLine,
  Maximize2,
  Minimize2,
  Loader2,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { useI18n } from '@/i18n';
import { useGitHubStore } from '@/stores/githubStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/stores/toastStore';
import { cn } from '@/utils/cn';

// Simple lightweight ANSI parser for standard terminal color escapes
function parseAnsi(text: string): React.ReactNode[] {
  // eslint-disable-next-line no-control-regex -- ANSI color sequences start with ESC.
  const parts = text.split(/(\x1b\[[0-9;]*m)/g);
  let currentColor = '';
  let isBold = false;

  return parts.map((part, index) => {
    if (part.startsWith('\x1b[')) {
      if (part === '\x1b[0m') {
        currentColor = '';
        isBold = false;
      } else if (part === '\x1b[1m') {
        isBold = true;
      } else if (part === '\x1b[32m') {
        currentColor = 'text-git-added';
      } else if (part === '\x1b[31m') {
        currentColor = 'text-git-deleted';
      } else if (part === '\x1b[33m') {
        currentColor = 'text-git-tag';
      } else if (part === '\x1b[34m' || part === '\x1b[36m') {
        currentColor = 'text-primary';
      } else if (part === '\x1b[35m') {
        currentColor = 'text-git-branch';
      }
      return null;
    }

    if (!part) return null;

    return (
      <span
        key={index}
        className={cn(
          currentColor || 'text-foreground/90',
          isBold && 'font-bold'
        )}
      >
        {part}
      </span>
    );
  }).filter(Boolean);
}

export const JobLogsViewerModal: React.FC = () => {
  const { isLogsModalOpen, activeJobLogs, closeJobLogs, openJobLogs } = useGitHubStore();
  const { t } = useI18n();
  const [searchQuery, setSearchQuery] = useState('');
  const [isCopied, setIsCopied] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setSearchQuery(''); setIsCopied(false); }, [activeJobLogs?.jobId, isLogsModalOpen]);
  useEffect(() => {
    if (!isLogsModalOpen || activeJobLogs?.state !== 'waiting') return;
    const timer = setTimeout(() => { void openJobLogs(activeJobLogs.jobId, activeJobLogs.jobName); }, 15000);
    return () => clearTimeout(timer);
  }, [isLogsModalOpen, activeJobLogs, openJobLogs]);

  const rawLines = useMemo(() => {
    if (!activeJobLogs?.rawLogs?.trim()) return [];
    return activeJobLogs.rawLogs.split(/\r?\n/);
  }, [activeJobLogs?.rawLogs]);

  const filteredLines = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return rawLines.filter(line => !line.includes('##[endgroup]') && (!q.trim() || line.toLowerCase().includes(q)));
  }, [rawLines, searchQuery]);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filteredLines, autoScroll]);

  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  if (!isLogsModalOpen || !activeJobLogs) return null;

  const loading = activeJobLogs.state === 'loading';
  const waiting = activeJobLogs.state === 'waiting';
  const failed = activeJobLogs.state === 'error';
  const githubUrl = activeJobLogs.htmlUrl?.startsWith('https://github.com/') ? activeJobLogs.htmlUrl : null;
  const openGitHub = async () => {
    if (!githubUrl) return;
    try {
      if ('__TAURI_INTERNALS__' in window) {
        const { open } = await import('@tauri-apps/plugin-shell');
        await open(githubUrl);
      } else window.open(githubUrl, '_blank', 'noopener,noreferrer');
    } catch (error: any) { toast.error(t('logs.openFailed'), String(error?.message || error)); }
  };

  const handleCopyLogs = () => {
    navigator.clipboard.writeText(activeJobLogs.rawLogs);
    setIsCopied(true);
    toast.success(t('logs.copied'));
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <ModalSurface onDismiss={closeJobLogs} label={t('actions.viewLogs')}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-150 select-none"
    >
      <div
        className={cn(
          "w-full flex flex-col bg-card border border-border/80 rounded-xl shadow-2xl overflow-hidden transition-all duration-200",
          isFullScreen ? "h-full max-w-full" : "max-w-4xl h-[78vh]"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Terminal Header Bar */}
        <div className="h-10 px-4 border-b border-border/80 bg-accent/30 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <Terminal className="h-4 w-4 text-git-added" />
            <span className="text-xs font-semibold font-mono text-foreground">
              {activeJobLogs.jobName}
            </span>
            <Badge variant="outline" className="h-4 text-[11px] font-mono">
              {loading ? t('logs.loading') : waiting ? t('logs.waitingBadge') : failed ? t('logs.failed') : `${filteredLines.length} ${t('logs.lines')}`}
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            {/* Search input in logs */}
            <div className="relative w-44">
              <Search className="h-3 w-3 text-muted-foreground absolute left-2 top-2.5" />
              <Input
                value={searchQuery}
                disabled={loading || waiting || failed}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('logs.searchPlaceholder')}
                className="h-7 pl-7 text-[12px] font-mono bg-background/50 border-border/60"
              />
            </div>

            {/* Auto-scroll toggle */}
            <Button
              variant={autoScroll ? 'secondary' : 'ghost'}
              size="xs"
              onClick={() => setAutoScroll(!autoScroll)}
              className="h-7 px-2 text-[11px] gap-1 font-mono"
              title={t('logs.scrollToBottom')}
            >
              <ArrowDownToLine className="h-3 w-3" />
              <span>{t('logs.scroll')}</span>
            </Button>

            {/* Copy button */}
            <Button
              variant="outline"
              size="xs"
              disabled={rawLines.length === 0}
              onClick={handleCopyLogs}
              className="h-7 px-2 text-[11px] gap-1 font-mono"
              title={t('logs.copyAll')}
            >
              {isCopied ? <Check className="h-3 w-3 text-git-added" /> : <Copy className="h-3 w-3" />}
              <span>{isCopied ? t('logs.copied') : t('logs.copy')}</span>
            </Button>

            {/* Fullscreen toggle */}
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setIsFullScreen(!isFullScreen)}
              aria-label={t('logs.toggleFullscreen')}
              title={t('logs.toggleFullscreen')}
              className="h-7 w-7 p-0"
            >
              {isFullScreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </Button>

            {/* Close */}
            <Button
              variant="ghost"
              size="xs"
              onClick={closeJobLogs}
              aria-label={t('common.close')}
              className="h-7 w-7 p-0 hover:text-git-deleted"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 px-4 py-2 border-b border-border shrink-0">
          {githubUrl && <Button variant="outline" size="xs" onClick={() => void openGitHub()}><ExternalLink className="h-3 w-3" />{t('logs.openGitHub')}</Button>}
          <Button variant="outline" size="xs" disabled={loading} onClick={() => void openJobLogs(activeJobLogs.jobId, activeJobLogs.jobName)}><RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />{t('logs.retry')}</Button>
        </div>

        {/* Terminal Content Screen */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-auto p-4 font-mono text-[12px] leading-relaxed bg-background dark:bg-sunken text-foreground dark:text-muted-foreground select-text"
        >
          {loading || waiting || failed ? <div role={failed ? 'alert' : 'status'} className="py-16 text-center space-y-3">
            {loading && <Loader2 className="h-5 w-5 animate-spin mx-auto text-primary" />}
            <p className={failed ? 'text-destructive' : 'text-muted-foreground'}>{t(loading ? 'logs.loading' : waiting ? 'logs.waiting' : 'logs.failed')}</p>
            {waiting && <p className="text-muted-foreground">{t('logs.waitingHint')}</p>}
            {failed && <p className="text-muted-foreground break-words select-text">{activeJobLogs.error}</p>}
          </div> : filteredLines.length === 0 ? (
            <div className="py-20 text-center text-muted-foreground/50">
              {t(searchQuery.trim() ? 'logs.noMatch' : 'logs.empty')}
            </div>
          ) : (
            <VirtualRows items={filteredLines} rowHeight={24} renderRow={(line, idx) => {
              const isGroupHeader = line.includes('##[group]');
              const cleanLine = isGroupHeader ? line.replace('##[group]', '▶ ') : line;

              return (
                <div
                  key={idx}
                  className={cn(
                    "flex hover:bg-accent/40 px-1 py-0.5 rounded transition-colors whitespace-pre-wrap break-all",
                    isGroupHeader && "text-git-branch font-semibold bg-muted/50 my-1 py-1"
                  )}
                >
                  <span className="w-10 text-muted-foreground text-right pr-3 select-none shrink-0 text-[11px]">
                    {idx + 1}
                  </span>
                  <div className="flex-1">
                    {parseAnsi(cleanLine)}
                  </div>
                </div>
              );
            }} />
          )}
        </div>
      </div>
    </ModalSurface>
  );
};
