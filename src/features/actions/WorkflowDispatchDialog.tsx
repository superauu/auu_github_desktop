import { ModalSurface } from '@/components/ui/ModalSurface';
import React, { useState } from 'react';
import { Play, X, GitBranch, Sparkles, Terminal } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useGitHubStore } from '@/stores/githubStore';
import { useRepoStore } from '@/stores/repoStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

export const WorkflowDispatchDialog: React.FC = () => {
  const { isDispatchModalOpen, dispatchTargetWorkflow, closeDispatchModal, dispatchWorkflow } =
    useGitHubStore();
  const { t } = useI18n();
  const { branches } = useRepoStore();

  const currentHeadBranch = branches.find((b) => b.isCurrent)?.name || 'master';
  const [targetRef, setTargetRef] = useState(currentHeadBranch);
  const [paramInput, setParamInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isDispatchModalOpen || !dispatchTargetWorkflow) return null;

  const handleDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await dispatchWorkflow(targetRef, paramInput ? { custom_arg: paramInput } : undefined);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalSurface onDismiss={closeDispatchModal} dismissible={!isSubmitting} label={'Run workflow'}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-150 select-none"
    >
      <div
        className="w-full max-w-md bg-card border border-border/90 rounded-xl shadow-2xl p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-border/60">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-primary/10 text-primary">
              <Play className="h-4 w-4 fill-current" />
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground">{t('dispatch.title')}</div>
              <div className="text-xs text-muted-foreground truncate max-w-[260px]">
                {dispatchTargetWorkflow.name}
              </div>
            </div>
          </div>
          <Button variant="ghost" size="xs" onClick={closeDispatchModal} className="h-7 w-7 p-0">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form onSubmit={handleDispatch} className="space-y-4">
          {/* Target Branch selection */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
              <GitBranch className="h-3.5 w-3.5 text-indigo-400" />
              <span>{t('dispatch.useFrom')}</span>
            </label>
            <select
              value={targetRef}
              onChange={(e) => setTargetRef(e.target.value)}
              className="w-full h-8 px-2.5 rounded-md text-xs bg-background border border-border/80 text-foreground font-mono focus:outline-hidden focus:ring-1 focus:ring-primary"
            >
              {branches.map((b) => (
                <option key={b.name} value={b.name}>
                  {b.name} {b.isCurrent ? t('dispatch.currentHead') : ''}
                </option>
              ))}
              {branches.length === 0 && <option value="master">master</option>}
            </select>
          </div>

          {/* Optional Inputs */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground flex items-center justify-between">
              <span>{t('dispatch.inputs')}</span>
              <Badge variant="outline" className="h-4 text-[10px]">workflow_dispatch</Badge>
            </label>
            <Input
              value={paramInput}
              onChange={(e) => setParamInput(e.target.value)}
              placeholder={t('dispatch.inputsPlaceholder')}
              className="h-8 text-xs font-mono"
            />
          </div>

          {/* Workflow File Footnote */}
          <div className="p-2.5 rounded-lg bg-accent/20 border border-border/40 text-[12px] text-muted-foreground flex items-start gap-2 font-mono">
            <Terminal className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              {t('dispatch.config')}: <span className="text-foreground">{dispatchTargetWorkflow.path}</span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={closeDispatchModal}
              className="h-8 px-3 text-xs"
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              size="xs"
              disabled={isSubmitting}
              className="h-8 px-4 text-xs gap-1.5"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>{isSubmitting ? t('dispatch.running') : t('dispatch.run')}</span>
            </Button>
          </div>
        </form>
      </div>
    </ModalSurface>
  );
};
