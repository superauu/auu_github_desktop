import { useShallow } from 'zustand/react/shallow';
import React, { useState, useRef, useEffect } from 'react';
import {
  Terminal as TerminalIcon,
  X,
  Maximize2,
  Minimize2,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import { useI18n } from '@/i18n';
import { useRepoStore } from '@/stores/repoStore';
import { executeGit } from '@/services/git/GitExecutor';
import { isReadOnlyGitCommand } from '@/services/git/GitQueue';
import { cn } from '@/utils/cn';

/**
 * Parse command line arguments respecting single and double quotes.
 * E.g., 'commit -m "hello world"' → ['commit', '-m', 'hello world']
 */
function parseGitArgs(input: string): string[] {
  const args: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
    } else if (ch === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
    } else if (ch === ' ' && !inSingleQuote && !inDoubleQuote) {
      if (current) {
        args.push(current);
        current = '';
      }
    } else {
      current += ch;
    }
  }
  if (current) args.push(current);
  return args;
}

interface EmbeddedTerminalPanelProps {
  open: boolean;
  onClose: () => void;
}

interface CommandHistoryItem {
  id: string;
  command: string;
  output: string;
  isError?: boolean;
  timestamp: string;
}

export const EmbeddedTerminalPanel: React.FC<EmbeddedTerminalPanelProps> = ({
  open,
  onClose,
}) => {
  const { t } = useI18n();
  const { currentRepo, openTerminal, checkExternalChanges } = useRepoStore(useShallow(state => ({ currentRepo: state.currentRepo, openTerminal: state.openTerminal, checkExternalChanges: state.checkExternalChanges })));
  const [height, setHeight] = useState(210);
  const [isMaximized, setIsMaximized] = useState(false);
  const [inputVal, setInputVal] = useState('');
  const [history, setHistory] = useState<CommandHistoryItem[]>([
    {
      id: 'init-1',
      command: '',
      output: t('terminal.gitOnlyHint'),
      timestamp: new Date().toLocaleTimeString(),
    },
  ]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [isExecuting, setIsExecuting] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(210);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      const frame = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(frame);
    }
  }, [open]);

  // Scroll to bottom on new output
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history, isExecuting]);

  if (!open) return null;

  const repoPath = currentRepo?.path || '';

  // Handle Resize drag
  const handleMouseDownResize = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    startYRef.current = e.clientY;
    startHeightRef.current = height;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const deltaY = startYRef.current - moveEvent.clientY;
      const newHeight = Math.max(120, Math.min(600, startHeightRef.current + deltaY));
      setHeight(newHeight);
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleExecute = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawCmd = inputVal.trim();
    if (!rawCmd || isExecuting) return;

    setInputVal('');
    setHistoryIndex(-1);
    setIsExecuting(true);

    const now = new Date().toLocaleTimeString();

    // Built-in clear
    if (rawCmd === 'clear' || rawCmd === 'cls') {
      setHistory([]);
      setIsExecuting(false);
      return;
    }

    let changesRepository = false;
    try {
      let outputText = '';
      if (rawCmd.startsWith('git ')) {
        // Parse command line respecting quoted arguments
        const args = parseGitArgs(rawCmd.slice(4).trim());
        if (!repoPath) {
          outputText = 'Error: No repository open';
        } else {
          changesRepository = !isReadOnlyGitCommand(args);
          const res = await executeGit(args, repoPath);
          outputText = res.stdout || res.stderr || 'Done (Exit Code 0)';
        }
      } else {
        outputText = `[Local Terminal]: ${rawCmd}\n(${t('terminal.gitOnlyHint')})`;
      }

      setHistory((prev) => [
        ...prev,
        {
          id: Math.random().toString(36).slice(2),
          command: rawCmd,
          output: outputText || 'Done (Exit Code 0)',
          timestamp: now,
        },
      ]);
    } catch (err: any) {
      setHistory((prev) => [
        ...prev,
        {
          id: Math.random().toString(36).slice(2),
          command: rawCmd,
          output: err.message || 'Execution failed',
          isError: true,
          timestamp: now,
        },
      ]);
    } finally {
      setIsExecuting(false);
      if (changesRepository && useRepoStore.getState().currentRepo?.path === repoPath) {
        void checkExternalChanges();
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length === 0) return;
      const nextIdx = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(nextIdx);
      setInputVal(history[nextIdx]?.command || '');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex === -1) return;
      const nextIdx = historyIndex + 1;
      if (nextIdx >= history.length) {
        setHistoryIndex(-1);
        setInputVal('');
      } else {
        setHistoryIndex(nextIdx);
        setInputVal(history[nextIdx]?.command || '');
      }
    }
  };

  return (
    <div
      style={{ height: isMaximized ? '85%' : `${height}px` }}
      className="border-t border-border/80 bg-slate-50 dark:bg-[#0f0f11] flex flex-col select-none relative z-20 shadow-2xl transition-[height] duration-150 ease-out cyber-terminal-enter shrink-0"
    >
      {/* Top Resize Handle Bar */}
      <div
        onMouseDown={handleMouseDownResize}
        className="absolute -top-1.5 left-0 right-0 h-3 cursor-row-resize flex items-center justify-center group z-30"
        title={t('terminal.resizeHint')}
      >
        <div className="w-16 h-1 rounded-full bg-border group-hover:bg-primary transition-colors" />
      </div>

      {/* Terminal Titlebar (Matching GitKraken >_ Terminal) */}
      <div className="h-8 px-3 bg-slate-100/90 dark:bg-[#131316] border-b border-border/60 flex items-center justify-between text-xs shrink-0 select-none">
        <div className="flex items-center gap-2 text-foreground/90 font-mono font-medium">
          <TerminalIcon className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
          <span className="text-[12px] tracking-wide text-foreground">{t('terminal.title')}</span>
          <span className="text-[11px] text-muted-foreground/60 truncate max-w-[260px] font-sans">
            {repoPath}
          </span>
        </div>

        {/* Window controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setHistory([])}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent/40"
            title={t('terminal.clear')}
          >
            <Trash2 className="h-3 w-3" />
          </button>
          <button
            onClick={openTerminal}
            className="p-1 rounded text-muted-foreground hover:text-sky-600 dark:hover:text-sky-400 hover:bg-accent/40"
            title={t('terminal.openExternal')}
          >
            <ExternalLink className="h-3 w-3" />
          </button>
          <button
            onClick={() => setIsMaximized(!isMaximized)}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent/40"
            title={isMaximized ? t('terminal.restore') : t('terminal.maximize')}
          >
            {isMaximized ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded text-muted-foreground hover:text-rose-400 hover:bg-rose-500/20 ml-1"
            title={t('terminal.close')}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Terminal Output & Input Area */}
      <div
        ref={scrollRef}
        onClick={() => { if (!window.getSelection()?.toString()) inputRef.current?.focus(); }}
        className="flex-1 p-3 font-mono text-[12px] overflow-y-auto space-y-2 cursor-text"
      >
        {history.map((item) => (
          <div key={item.id} className="space-y-1">
            {item.command && <div className="flex items-center gap-1.5 text-primary font-semibold">
              <span className="text-muted-foreground select-none">{repoPath} &gt;</span>
              <span>{item.command}</span>
            </div>}
            <pre
              className={cn(
                "whitespace-pre-wrap pl-4 font-mono text-[12px] leading-relaxed select-text",
                item.isError ? "text-rose-600 dark:text-rose-400" : "text-slate-800 dark:text-foreground/80"
              )}
            >
              {item.output}
            </pre>
          </div>
        ))}

        {isExecuting && (
          <div className="flex items-center gap-2 text-primary animate-pulse text-[12px] pl-4">
            <span>{t('terminal.running')}</span>
          </div>
        )}

        {/* Command Input Prompt */}
        <form onSubmit={handleExecute} className="flex items-center gap-1.5 pt-1">
          <span className="text-sky-700 dark:text-sky-400/80 font-semibold select-none shrink-0">
            {repoPath} &gt;
          </span>
          <input
            ref={inputRef}
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={handleKeyDown}
            readOnly={isExecuting}
            aria-busy={isExecuting}
            aria-label={t('terminal.placeholder')}
            placeholder={t('terminal.placeholder')}
            className="flex-1 bg-transparent border-none outline-none text-slate-900 dark:text-foreground font-mono text-[12px] p-0 placeholder:text-muted-foreground/50 focus:ring-0"
            autoFocus
          />
        </form>
      </div>
    </div>
  );
};
