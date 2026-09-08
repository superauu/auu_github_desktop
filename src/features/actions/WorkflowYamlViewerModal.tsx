import React, { useState } from 'react';
import { FileCode, X, Copy, Check } from 'lucide-react';
import { useGitHubStore } from '@/stores/githubStore';
import { Button } from '@/components/ui/button';
import { toast } from '@/stores/toastStore';

export const WorkflowYamlViewerModal: React.FC = () => {
  const { isYamlModalOpen, activeWorkflowYaml, closeWorkflowYaml } = useGitHubStore();
  const [isCopied, setIsCopied] = useState(false);

  if (!isYamlModalOpen || !activeWorkflowYaml) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(activeWorkflowYaml.content);
    setIsCopied(true);
    toast.success('已复制工作流 YAML 内容');
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-150 select-none"
      onClick={closeWorkflowYaml}
    >
      <div
        className="w-full max-w-2xl h-[70vh] bg-card border border-border/90 rounded-xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="h-10 px-4 border-b border-border/80 bg-accent/20 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <FileCode className="h-4 w-4 text-sky-400" />
            <span className="text-xs font-mono font-semibold text-foreground">
              {activeWorkflowYaml.path}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="xs"
              onClick={handleCopy}
              className="h-7 px-2 text-[10px] gap-1 font-mono"
            >
              {isCopied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
              <span>{isCopied ? '已复制' : '复制代码'}</span>
            </Button>
            <Button
              variant="ghost"
              size="xs"
              onClick={closeWorkflowYaml}
              className="h-7 w-7 p-0 hover:text-rose-400"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* YAML Code Area */}
        <div className="flex-1 overflow-auto p-4 font-mono text-[11px] leading-relaxed text-foreground/90 dark:text-indigo-100/90 select-text bg-background dark:bg-[#0c0c0e]">
          <pre className="whitespace-pre">{activeWorkflowYaml.content}</pre>
        </div>
      </div>
    </div>
  );
};
