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
} from 'lucide-react';
import { useGitHubStore } from '@/stores/githubStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/stores/toastStore';
import { cn } from '@/utils/cn';

// Simple lightweight ANSI parser for standard terminal color escapes
function parseAnsi(text: string): React.ReactNode[] {
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
        currentColor = 'text-emerald-400';
      } else if (part === '\x1b[31m') {
        currentColor = 'text-rose-400';
      } else if (part === '\x1b[33m') {
        currentColor = 'text-amber-400';
      } else if (part === '\x1b[34m' || part === '\x1b[36m') {
        currentColor = 'text-cyan-400';
      } else if (part === '\x1b[35m') {
        currentColor = 'text-purple-400';
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
  const { isLogsModalOpen, activeJobLogs, closeJobLogs } = useGitHubStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [isCopied, setIsCopied] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const rawLines = useMemo(() => {
    if (!activeJobLogs?.rawLogs) return [];
    return activeJobLogs.rawLogs.split(/\r?\n/);
  }, [activeJobLogs?.rawLogs]);

  const filteredLines = useMemo(() => {
    if (!searchQuery.trim()) return rawLines;
    const q = searchQuery.toLowerCase();
    return rawLines.filter((l) => l.toLowerCase().includes(q));
  }, [rawLines, searchQuery]);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filteredLines, autoScroll]);

  if (!isLogsModalOpen || !activeJobLogs) return null;

  const handleCopyLogs = () => {
    navigator.clipboard.writeText(activeJobLogs.rawLogs);
    setIsCopied(true);
    toast.success('已复制完整构建日志');
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-150 select-none"
      onClick={closeJobLogs}
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
            <Terminal className="h-4 w-4 text-emerald-400" />
            <span className="text-xs font-semibold font-mono text-foreground">
              {activeJobLogs.jobName}
            </span>
            <Badge variant="outline" className="h-4 text-[10px] font-mono">
              {filteredLines.length} 行日志
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            {/* Search input in logs */}
            <div className="relative w-44">
              <Search className="h-3 w-3 text-muted-foreground absolute left-2 top-2.5" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索日志..."
                className="h-7 pl-7 text-[11px] font-mono bg-background/50 border-border/60"
              />
            </div>

            {/* Auto-scroll toggle */}
            <Button
              variant={autoScroll ? 'secondary' : 'ghost'}
              size="xs"
              onClick={() => setAutoScroll(!autoScroll)}
              className="h-7 px-2 text-[10px] gap-1 font-mono"
              title="自动滚动到底部"
            >
              <ArrowDownToLine className="h-3 w-3" />
              <span>滚动</span>
            </Button>

            {/* Copy button */}
            <Button
              variant="outline"
              size="xs"
              onClick={handleCopyLogs}
              className="h-7 px-2 text-[10px] gap-1 font-mono"
              title="复制全部日志"
            >
              {isCopied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
              <span>{isCopied ? '已复制' : '复制'}</span>
            </Button>

            {/* Fullscreen toggle */}
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setIsFullScreen(!isFullScreen)}
              className="h-7 w-7 p-0"
            >
              {isFullScreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </Button>

            {/* Close */}
            <Button
              variant="ghost"
              size="xs"
              onClick={closeJobLogs}
              className="h-7 w-7 p-0 hover:text-rose-400"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Terminal Content Screen */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-auto p-4 font-mono text-[11px] leading-relaxed bg-background dark:bg-[#05070c] text-foreground dark:text-muted-foreground select-text"
        >
          {filteredLines.length === 0 ? (
            <div className="py-20 text-center text-muted-foreground/50">
              未找到匹配的日志内容
            </div>
          ) : (
            filteredLines.map((line, idx) => {
              const isGroupHeader = line.includes('##[group]');
              const isGroupEnd = line.includes('##[endgroup]');

              if (isGroupEnd) return null;

              const cleanLine = isGroupHeader ? line.replace('##[group]', '▶ ') : line;

              return (
                <div
                  key={idx}
                  className={cn(
                    "flex hover:bg-white/[0.03] px-1 py-0.5 rounded transition-colors whitespace-pre-wrap break-all",
                    isGroupHeader && "text-indigo-300 font-semibold bg-indigo-950/20 my-1 py-1"
                  )}
                >
                  <span className="w-10 text-muted-foreground/30 text-right pr-3 select-none shrink-0 text-[10px]">
                    {idx + 1}
                  </span>
                  <div className="flex-1">
                    {parseAnsi(cleanLine)}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
