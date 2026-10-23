import { useEffect, useState } from 'react';
import { useRemoteDialogStore } from '@/stores/remoteDialogStore';
import { useRepoStore } from '@/stores/repoStore';
import { gitService } from '@/services/git/GitService';
import type { PushContext } from '@/services/git/types';
import { ModalSurface } from '@/components/ui/ModalSurface';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/i18n';
import { ErrorNotice } from '@/components/ui/ErrorNotice';

export function RemoteOperationDialog() {
  const pending = useRemoteDialogStore(state => state.pending);
  const settle = useRemoteDialogStore(state => state.settle);
  const repoPath = useRepoStore(state => state.currentRepo?.path);
  const currentBranch = useRepoStore(state => state.status?.currentBranch || state.currentRepo?.currentBranch);
  const { t } = useI18n();
  const [context, setContext] = useState<PushContext | null>(null);
  const [remote, setRemote] = useState('');
  const [target, setTarget] = useState('');
  const [tracking, setTracking] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    if (pending && (pending.repoPath !== repoPath || pending.currentBranch !== currentBranch)) settle(null);
  }, [pending, repoPath, currentBranch, settle]);

  useEffect(() => {
    let active = true;
    setContext(null); setError(''); setRemote(''); setRemember(false); setTracking(false); setAdvancedOpen(false);
    if (!pending) return;
    const load = async () => {
      if (pending.action === 'branch') return attempt === 0 && pending.context ? pending.context : gitService.getPushContext(pending.repoPath, pending.branch);
      // Tags can be pushed even in detached HEAD state.
      const remotes = await gitService.listRemotes(pending.repoPath);
      return { remotes, branch: '', targetBranch: '', remote: remotes.length === 1 ? remotes[0].name : undefined };
    };
    void load().then(value => {
      if (!active) return;
      setContext(value); setRemote(value.remote || ''); setTarget(value.targetBranch);
      setRemember(!!value.pushRemote && value.pushRemote === value.remote);
      setTracking(pending.action === 'branch' && (!value.upstream || value.upstream === `${value.remote}/${value.targetBranch}`));
      setAdvancedOpen(pending.action === 'branch' && !value.upstream);
    }).catch(reason => { if (active) setError(reason?.message || t('remote.loadFailed')); });
    return () => { active = false; };
  }, [pending, attempt, t]);

  if (!pending) return null;
  const selected = context?.remotes.find(item => item.name === remote);
  const deletion = pending.action === 'deleteTag';
  const source = pending.action === 'branch' ? context?.branch : pending.action === 'tags' ? t('remote.tags') : `${t('remote.tag')} ${pending.tag}`;
  const title = deletion ? t('remote.deleteTag') : t('remote.title');
  const destination = pending.action === 'branch' ? target : pending.action === 'tags' ? t('remote.tags') : pending.tag;
  return <ModalSurface label={title} onDismiss={() => settle(null)} className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4">
    <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-background shadow-xl p-5 space-y-4">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="text-xs text-muted-foreground break-all">{pending.repoPath}</p>
      {!context && !error && <p role="status">{t('remote.loading')}</p>}
      {error && <div role="alert"><ErrorNotice error={error} /><Button variant="outline" onClick={() => setAttempt(value => value + 1)}>{t('remote.retry')}</Button></div>}
      {context && <>
        {!context.remotes.length && <p role="alert">{t('remote.empty')}</p>}
        <p className="text-sm break-all">{t('remote.source')}: <strong>{source}</strong></p>
        <label className="block text-sm space-y-1"><span>{t('remote.destination')}</span>
          <select className="w-full rounded-md border border-input bg-background p-2" value={remote} onChange={event => {
            const next = event.target.value; setRemote(next);
            setTarget(next === context.remote ? context.targetBranch : context.branch);
            setRemember(context.pushRemote === next);
            setTracking(!context.upstream || context.upstream === `${next}/${next === context.remote ? context.targetBranch : context.branch}`);
          }}>
            <option value="">{t('remote.select')}</option>
            {context.remotes.map(item => <option key={item.name} value={item.name}>{item.name} — {item.pushUrl || item.fetchUrl}</option>)}
          </select>
        </label>
        {selected && <p className="text-xs text-muted-foreground break-all">{selected.pushUrl || selected.fetchUrl}</p>}
        {pending.action === 'branch' && <>
          <label className="block text-sm space-y-1"><span>{t('remote.targetBranch')}</span><Input value={target} onChange={event => { setTarget(event.target.value); setTracking(!context.upstream || context.upstream === `${remote}/${event.target.value}`); }} /></label>
          <p className="text-xs text-muted-foreground break-all">{t('remote.upstream')}: {context.upstream || t('remote.noUpstream')}</p>
          <details className="rounded-lg border border-border p-3" open={advancedOpen} onToggle={event => setAdvancedOpen(event.currentTarget.open)}>
            <summary className="cursor-pointer text-sm min-h-7">{t('ui.advanced')}</summary>
            <div className="pt-2 space-y-2">
              <p className="text-xs text-muted-foreground">{t('remote.saveOptionsHint')}</p>
              <label className="flex items-start gap-2 py-1 text-sm"><input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)} />{t('remote.remember')}</label>
              <label className="flex items-start gap-2 py-1 text-sm"><input type="checkbox" checked={tracking} onChange={event => setTracking(event.target.checked)} />{t('remote.setUpstream')}</label>
            </div>
          </details>
        </>}
        {pending.forceWithLease && <p role="alert" className="text-sm text-amber-500">{t('remote.force')}</p>}
        {deletion && <p className="text-sm text-destructive">{t('remote.deleteTagWarning')}</p>}
        {selected && <p className="rounded-md bg-muted p-3 text-sm break-all">{t('remote.summary')}: {source} → {remote}/{destination}</p>}
      </>}
      <footer className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => settle(null)}>{t('remote.cancel')}</Button>
        <Button variant={deletion ? 'destructive' : 'default'} disabled={!selected || (pending.action === 'branch' && !target.trim())} onClick={() => {
          if (!context || !selected) return;
          settle({ remote, branch: context.branch, targetBranch: target.trim(), setUpstream: tracking, unsetUpstream: !tracking && context.upstream === `${remote}/${target.trim()}`, rememberRemote: remember, forceWithLease: pending.forceWithLease });
        }}>{deletion ? t('remote.deleteTag') : t('remote.push')}</Button>
      </footer>
    </div>
  </ModalSurface>;
}
