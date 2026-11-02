import { getHostingPlugin } from '@/services/integrations/plugins';
import { useShallow } from 'zustand/react/shallow';
import React, { useEffect, useState } from 'react';
import { Play, X, Loader2 } from 'lucide-react';
import { ModalSurface } from '@/components/ui/ModalSurface';
import { useI18n } from '@/i18n';
import { useCollaborationStore } from '@/stores/collaborationStore';
import { useRepoStore } from '@/stores/repoStore';
import { collaborationService } from '@/services/collaboration/CollaborationService';
import { workflowInputValues, WorkflowInput } from '@/services/collaboration/WorkflowInputs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// 插件解析器抛出的 dispatch.* 是 i18n 键（测试与插件间保持机器可读），展示前翻译。
const dispatchErrorText = (err: unknown, translate: (key: string) => string): string => {
  const message = err instanceof Error ? err.message : String(err);
  return /^dispatch\.(invalidDefinition|notManual|requiredInput|invalidInput)$/.test(message) ? translate(message) : message;
};

export const WorkflowDispatchDialog: React.FC = () => {
  const { open, workflow, owner, repo } = useCollaborationStore(useShallow(s => ({ open: s.isDispatchModalOpen,
    workflow: s.dispatchTargetWorkflow, owner: s.currentOwner, repo: s.currentRepoName })));
  if (!open || !workflow || !owner || !repo) return null;
  return <DispatchForm key={`${owner}/${repo}/${workflow.id}`} owner={owner} repo={repo} workflow={workflow} />;
};

function DispatchForm({ owner, repo, workflow }: { owner: string; repo: string; workflow: { id: number | string; name: string; path: string } }) {
  const { t } = useI18n();
  const providerId = useCollaborationStore(state => state.providerId);
  const branches = useRepoStore(s => s.branches);
  const defaultBranch = useCollaborationStore(s => s.repoDetails?.default_branch);
  const close = useCollaborationStore(s => s.closeDispatchModal);
  const dispatch = useCollaborationStore(s => s.dispatchWorkflow);
  const [targetRef, setTargetRef] = useState(() => branches.find(b => b.isCurrent && !b.isRemote)?.name || defaultBranch || 'main');
  const [inputs, setInputs] = useState<WorkflowInput[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loadedRef, setLoadedRef] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const localBranches = [...new Set([targetRef, defaultBranch, ...branches.filter(b => !b.isRemote).map(b => b.name)].filter((name): name is string => !!name))];

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setLoadedRef(null); setInputs([]); setValues({});
    void collaborationService.getWorkflowYaml(owner, repo, workflow.path, targetRef, controller.signal).then(yaml => {
      if (controller.signal.aborted) return;
      const plugin = getHostingPlugin(providerId ?? '');
      if (!plugin?.parseDispatchInputs) throw new Error(t('dispatch.inputsUnavailable'));
      const fields = plugin.parseDispatchInputs(yaml.content);
      setInputs(fields); setValues(Object.fromEntries(fields.map(input => [input.name, input.defaultValue]))); setLoadedRef(targetRef);
    }).catch((err: unknown) => {
      if (!controller.signal.aborted) setError(dispatchErrorText(err, t));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [owner, repo, workflow.path, targetRef, attempt, providerId, t]);

  const ready = !loading && loadedRef === targetRef;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!ready || submitting) return;
    try {
      const payload = workflowInputValues(inputs, values);
      setSubmitting(true); setError('');
      await dispatch(targetRef, payload);
    } catch (err) { setError(dispatchErrorText(err, t)); }
    finally { setSubmitting(false); }
  };
  const selectClass = 'w-full h-8 px-2.5 rounded-md text-xs bg-background border border-border';
  return <ModalSurface onDismiss={close} dismissible={!submitting} label={t('dispatch.title')}
    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-xs">
    <div className="w-full max-w-md max-h-[85vh] overflow-y-auto bg-card border border-border rounded-xl shadow-2xl p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0"><h2 className="text-sm font-semibold">{t('dispatch.title')}</h2><p className="text-xs text-muted-foreground wrap-break-word">{workflow.name}</p></div>
        <Button variant="ghost" size="xs" disabled={submitting} onClick={close} aria-label={t('common.close')}><X className="h-4 w-4" /></Button>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <label className="block space-y-1.5 text-xs"><span>{t('dispatch.useFrom')}</span>
          <select disabled={submitting} value={targetRef} onChange={e => { setTargetRef(e.target.value); setLoadedRef(null); setError(''); }} className={selectClass}>
            {localBranches.map(branch => <option key={branch} value={branch}>{branch}</option>)}
          </select>
        </label>
        {loading && <p role="status" className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" />{t('dispatch.loadingInputs')}</p>}
        {error && <div role="alert" className="text-xs text-destructive space-y-2"><p className="wrap-break-word">{t(error.startsWith('dispatch.') ? error : 'dispatch.loadOrRunFailed')}{!error.startsWith('dispatch.') && `: ${error}`}</p>
          {!ready && <Button type="button" variant="outline" size="xs" onClick={() => setAttempt(a => a + 1)}>{t('resilience.retry')}</Button>}
        </div>}
        {ready && !inputs.length && <p className="text-xs text-muted-foreground">{t('dispatch.noInputs')}</p>}
        {ready && inputs.map(input => <label key={input.name} className="block space-y-1.5 text-xs" htmlFor={`workflow-input-${input.name}`}>
          <span className="font-medium">{input.name}{input.required ? ' *' : ''}</span>
          {input.description && <span className="block text-muted-foreground whitespace-pre-wrap wrap-break-word">{input.description}</span>}
          {input.type === 'choice' || input.type === 'boolean' ?
            <select id={`workflow-input-${input.name}`} disabled={submitting} required={input.required} className={selectClass} value={values[input.name] ?? ''}
              onChange={e => setValues(v => ({ ...v, [input.name]: e.target.value }))}>
              {input.type === 'choice' && <option value="">{t('dispatch.selectValue')}</option>}
              {(input.type === 'boolean' ? ['true', 'false'] : input.options).map(option => <option key={option} value={option}>{input.type === 'boolean' ? t(`dispatch.${option}`) : option}</option>)}
            </select> :
            <Input id={`workflow-input-${input.name}`} disabled={submitting} required={input.required} type={input.type === 'number' ? 'number' : 'text'} step={input.type === 'number' ? 'any' : undefined}
              value={values[input.name] ?? ''} onChange={e => setValues(v => ({ ...v, [input.name]: e.target.value }))} className="h-8 text-xs" />}
          {input.type === 'environment' && <span className="block text-muted-foreground">{t('dispatch.environmentHint')}</span>}
        </label>)}
        <p className="text-xs text-muted-foreground break-all">{t('dispatch.config')}: {workflow.path}</p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="xs" disabled={submitting} onClick={close}>{t('common.cancel')}</Button>
          <Button type="submit" size="xs" disabled={!ready || submitting} className="gap-1.5"><Play className="h-3.5 w-3.5" />{t(submitting ? 'dispatch.running' : 'dispatch.run')}</Button>
        </div>
      </form>
    </div>
  </ModalSurface>;
}
