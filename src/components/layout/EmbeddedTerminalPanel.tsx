import React, { useState, useRef, useEffect } from 'react';
import {
  Terminal as TerminalIcon,
  X,
  Maximize2,
  Minimize2,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import { useRepoStore } from '@/stores/repoStore';
import { executeGit } from '@/services/git/GitExecutor';
import { cn } from '@/utils/cn';

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
  const { currentRepo, openTerminal, refreshAll } = useRepoStore();
  const [height, setHeight] = useState(210);
  const [isMaximized, setIsMaximized] = useState(false);
  const [inputVal, setInputVal] = useState('');
  const [history, setHistory] = useState<CommandHistoryItem[]>([
    {
      id: 'init-1',
      command: 'git status -s',
      output: 'AuuGit Embedded Cyber Terminal\nReady for Git & Shell operations.',
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
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [open]);

  // Scroll to bottom on new output
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history, isExecuting]);

  if (!open) return null;

  const repoPath = currentRepo?.path || 'E:\\code\\auu_saas';

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

    try {
      let outputText = '';
      if (rawCmd.startsWith('git ')) {
        const args = rawCmd.slice(4).trim().split(/\s+/);
        const res = await executeGit(args, repoPath);
        outputText = res.stdout || res.stderr || 'Done (Exit Code 0)';
        if (['commit', 'merge', 'rebase', 'reset', 'checkout', 'branch', 'stash', 'pull', 'tag'].some(c => args[0] === c)) {
          refreshAll().catch(() => {});
        }
      } else {
        outputText = `[Local Terminal]: ${rawCmd}\n(提示: 原生支持所有 git 命令，例如 'git status', 'git log -n 5', 'git diff' 等)`;
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
        title="拖动调整终端高度"
      >
        <div className="w-16 h-1 rounded-full bg-border group-hover:bg-primary transition-colors" />
      </div>

      {/* Terminal Titlebar (Matching GitKraken >_ Terminal) */}
      <div className="h-8 px-3 bg-slate-100/90 dark:bg-[#131316] border-b border-border/60 flex items-center justify-between text-xs shrink-0 select-none">
        <div className="flex items-center gap-2 text-foreground/90 font-mono font-medium">
          <TerminalIcon className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
          <span className="text-[11px] tracking-wide text-foreground">Terminal</span>
          <span className="text-[10px] text-muted-foreground/60 truncate max-w-[260px] font-sans">
            {repoPath}
          </span>
        </div>

        {/* Window controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setHistory([])}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent/40"
            title="清屏 (Clear)"
          >
            <Trash2 className="h-3 w-3" />
          </button>
          <button
            onClick={openTerminal}
            className="p-1 rounded text-muted-foreground hover:text-sky-600 dark:hover:text-sky-400 hover:bg-accent/40"
            title="在独立外部系统终端中打开"
          >
            <ExternalLink className="h-3 w-3" />
          </button>
          <button
            onClick={() => setIsMaximized(!isMaximized)}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent/40"
            title={isMaximized ? "还原" : "最大化"}
          >
            {isMaximized ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded text-muted-foreground hover:text-rose-400 hover:bg-rose-500/20 ml-1"
            title="关闭终端面板"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Terminal Output & Input Area */}
      <div
        ref={scrollRef}
        onClick={() => inputRef.current?.focus()}
        className="flex-1 p-3 font-mono text-[11px] overflow-y-auto space-y-2 cursor-text"
      >
        {history.map((item) => (
          <div key={item.id} className="space-y-1">
            <div className="flex items-center gap-1.5 text-sky-700 dark:text-sky-400/90 font-semibold">
              <span className="text-muted-foreground/60 select-none">PS {repoPath}&gt;</span>
              <span>{item.command}</span>
            </div>
            <pre
              className={cn(
                "whitespace-pre-wrap pl-4 font-mono text-[11px] leading-relaxed",
                item.isError ? "text-rose-600 dark:text-rose-400" : "text-slate-800 dark:text-foreground/80"
              )}
            >
              {item.output}
            </pre>
          </div>
        ))}

        {isExecuting && (
          <div className="flex items-center gap-2 text-primary animate-pulse text-[11px] pl-4">
            <span>正在执行中...</span>
          </div>
        )}

        {/* Command Input Prompt */}
        <form onSubmit={handleExecute} className="flex items-center gap-1.5 pt-1">
          <span className="text-sky-700 dark:text-sky-400/80 font-semibold select-none shrink-0">
            PS {repoPath}&gt;
          </span>
          <input
            ref={inputRef}
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isExecuting}
            placeholder="输入 git 命令，如 git status, git log -n 3 ..."
            className="flex-1 bg-transparent border-none outline-none text-slate-900 dark:text-foreground font-mono text-[11px] p-0 placeholder:text-muted-foreground/50 focus:ring-0"
            autoFocus
          />
        </form>
      </div>
    </div>
  );
};
