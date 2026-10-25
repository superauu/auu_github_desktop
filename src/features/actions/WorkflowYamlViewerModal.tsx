import { ModalSurface } from '@/components/ui/ModalSurface';
import React, { useState, useEffect, useRef } from 'react';
import { FileCode, X, Copy, Check } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useGitHubStore } from '@/stores/githubStore';
import { Button } from '@/components/ui/button';
import { toast } from '@/stores/toastStore';

export const WorkflowYamlViewerModal: React.FC = () => {
  const { isYamlModalOpen, activeWorkflowYaml, closeWorkflowYaml } = useGitHubStore();
  const { t } = useI18n();
  const [isCopied, setIsCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  if (!isYamlModalOpen || !activeWorkflowYaml) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(activeWorkflowYaml.content);
    setIsCopied(true);
    toast.success(t('yaml.copied'));
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <ModalSurface onDismiss={closeWorkflowYaml} dismissible label={t('yaml.modalLabel')}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-150 select-none"
    >
      <div
        className="w-full max-w-2xl h-[70vh] bg-card border border-border/90 rounded-xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="h-10 px-4 border-b border-border/80 bg-accent/20 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <FileCode className="h-4 w-4 text-primary" />
            <span className="text-xs font-mono font-semibold text-foreground">
              {activeWorkflowYaml.path}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="xs"
              onClick={handleCopy}
              className="h-7 px-2 text-[11px] gap-1 font-mono"
            >
              {isCopied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
              <span>{isCopied ? t('logs.copied') : t('yaml.copy')}</span>
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
        <div className="flex-1 overflow-auto p-4 font-mono text-[12px] leading-relaxed text-foreground/90 select-text bg-background dark:bg-sunken">
          <pre className="whitespace-pre">{activeWorkflowYaml.content}</pre>
        </div>
      </div>
    </ModalSurface>
  );
};
