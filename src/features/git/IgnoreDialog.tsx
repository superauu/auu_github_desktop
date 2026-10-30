import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { ModalSurface } from '@/components/ui/ModalSurface';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import { useRepoStore } from '@/stores/repoStore';
import { gitService } from '@/services/git/GitService';
import { toast, useToastStore } from '@/stores/toastStore';
import {
  appendIgnoreRules, buildIgnoreRules, checkIgnore, fileExtension, previewIgnore,
  readIgnoreFile, saveIgnoreFile, undoIgnore,
  type IgnoreMode, type IgnorePreview, type IgnoreScope, type IgnoreSnapshot,
} from '@/services/git/IgnoreService';

interface Props { repoPath: string; paths: string[]; onClose: () => void }

export function IgnoreDialog({ repoPath, paths, onClose }: Props) {
  const { t } = useI18n();
  const managing = paths.length === 0;
  const [scope, setScope] = useState<IgnoreScope>('shared');
  const [mode, setMode] = useState<IgnoreMode>('file');
  const [custom, setCustom] = useState('');
  const [snapshot, setSnapshot] = useState<IgnoreSnapshot | null>(null);
  const [editor, setEditor] = useState('');
  const [preview, setPreview] = useState<IgnorePreview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [queryResult, setQueryResult] = useState('');
  const [checking, setChecking] = useState(false);
  const [reload, setReload] = useState(0);
  const request = useRef(0);
  const invalidatePreview = useCallback(() => { request.current++; }, []);
  const drafts = useRef<Partial<Record<IgnoreScope, string>>>({});
  const built = useMemo(() => {
    try { return { rules: buildIgnoreRules(paths, mode, custom), error: '' }; }
    catch (error: any) { return { rules: [] as string[], error: String(error.message || error) }; }
  }, [paths, mode, custom]);
  const rules = built.rules;
  const content = snapshot ? managing ? editor : appendIgnoreRules(snapshot.content, rules) : '';
  const availableModes: IgnoreMode[] = ['file', ...(paths.every(path => !!fileExtension(path)) ? ['typeHere', 'typeTree', 'typeAll'] as IgnoreMode[] : []),
    ...(paths.every(path => path.includes('/')) ? ['directory'] as IgnoreMode[] : []), 'custom'];
  const refresh = async () => {
    if (useRepoStore.getState().currentRepo?.path === repoPath) await useRepoStore.getState().refreshStatus();
  };

  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setSnapshot(null); setQueryResult('');
    readIgnoreFile(repoPath, scope).then(value => {
      if (active) { setSnapshot(value); setEditor(drafts.current[scope] ?? value.content); }
    }).catch(error => { if (active) setError(String(error.message || error)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [repoPath, scope, reload]);

  useEffect(() => {
    const id = ++request.current;
    setPreview(null);
    if (!snapshot || snapshot.scope !== scope) return;
    setError('');
    const timer = setTimeout(() => {
      previewIgnore(repoPath, scope, content, paths).then(value => {
        if (request.current === id) setPreview(value);
      }).catch(error => { if (request.current === id) setError(String(error.message || error)); });
    }, 250);
    return () => { clearTimeout(timer); invalidatePreview(); };
  }, [repoPath, scope, snapshot, content, paths, invalidatePreview]);

  const save = async () => {
    if (!snapshot || !preview) return;
    setBusy(true); setError('');
    try {
      await saveIgnoreFile(repoPath, snapshot, content);
      await refresh();
      try {
        const actual = await gitService.getStatus(repoPath);
        const remaining = actual.untracked.filter(file => preview.untracked.includes(file.path));
        if (remaining.length) toast.warning(t('ignore.verifyWarning').replace('{n}', String(remaining.length)));
      } catch { toast.warning(t('ignore.verifyFailed')); }
      const before = snapshot;
      useToastStore.getState().addToast({ type: 'success', title: t('ignore.saved'), description: scope === 'shared' ? '.gitignore' : '.git/info/exclude', duration: 15000,
        action: { label: t('ignore.undo'), onClick: async () => {
          try { await undoIgnore(repoPath, before, content); await refresh(); toast.success(t('ignore.undone')); }
          catch (error: any) { toast.error(t('ignore.undoFailed'), String(error.message || error)); }
        } },
      });
      onClose();
    } catch (error: any) { setError(String(error.message || error)); }
    finally { setBusy(false); }
  };

  return <ModalSurface onDismiss={onClose} dismissible={!busy} label={t(managing ? 'ignore.manage' : 'ignore.title')}
    className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs p-4">
    <div className="w-full max-w-xl max-h-[90vh] flex flex-col rounded-xl border border-border bg-card shadow-2xl p-5 gap-4">
      <div className="flex items-center justify-between gap-2 shrink-0">
        <h2 className="font-semibold">{t(managing ? 'ignore.manage' : 'ignore.title')}</h2>
        <Button variant="ghost" size="icon" disabled={busy} aria-label={t('common.close')} onClick={onClose}><X className="h-4 w-4" /></Button>
      </div>
      <div className="min-h-0 overflow-y-auto space-y-4 pr-1">
      {!managing && <p className="text-xs text-muted-foreground break-all">{paths.length === 1 ? paths[0] : t('ignore.selected').replace('{n}', String(paths.length))}</p>}
      <label className="block text-sm space-y-1"><span>{t('ignore.destination')}</span>
        <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={scope} disabled={busy} onChange={event => setScope(event.target.value as IgnoreScope)}>
          <option value="shared">{t('ignore.shared')}</option><option value="local">{t('ignore.local')}</option>
        </select>
      </label>
      <p className="text-xs text-muted-foreground">{t(scope === 'shared' ? 'ignore.sharedHint' : 'ignore.localHint')}</p>
      {!managing && <label className="block text-sm space-y-1"><span>{t('ignore.range')}</span>
        <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={mode} disabled={busy} onChange={event => setMode(event.target.value as IgnoreMode)}>
          {availableModes.map(value => <option key={value} value={value}>{t('ignore.mode.' + value)}</option>)}
        </select>
      </label>}
      {!managing && mode !== 'custom' && <p className="text-xs text-muted-foreground">{t('ignore.hint.' + mode)}</p>}
      <label className="block text-sm space-y-1"><span>{t(managing ? 'ignore.editor' : 'ignore.rules')}</span>
        <textarea spellCheck={false} disabled={busy || loading} readOnly={!managing && mode !== 'custom'}
          className="w-full min-h-24 rounded-md border border-input bg-background px-3 py-2 text-xs font-mono select-text"
          value={managing ? editor : mode === 'custom' ? custom : rules.join('\n')}
          onChange={event => {
            if (managing) { drafts.current[scope] = event.target.value; setEditor(event.target.value); }
            else setCustom(event.target.value);
          }} />
      </label>
      {loading || (!preview && !error) ? <p role="status" className="text-xs text-muted-foreground flex gap-2"><Loader2 className="h-4 w-4 animate-spin" />{t('ignore.loading')}</p> : null}
      {preview && <div className="rounded-md border border-border p-3 text-xs space-y-2" aria-live="polite">
        <p>{t('ignore.affected').replace('{n}', String(preview.untracked.length))}</p>
        {preview.untracked.length > 0 && <details><summary className="cursor-pointer">{t('ignore.showFiles')}</summary><ul className="mt-2 max-h-36 overflow-auto font-mono select-text">{preview.untracked.map(path => <li className="break-all" key={path}>{path}</li>)}</ul></details>}
        {preview.tracked.length > 0 && <details className="text-amber-500"><summary className="cursor-pointer">{t('ignore.tracked').replace('{n}', String(preview.tracked.length))}</summary><ul className="mt-2 max-h-28 overflow-auto font-mono">{preview.tracked.map(path => <li key={path}>{path}</li>)}</ul></details>}
        {!managing && preview.selectedNotIgnored.length > 0 && <p className="text-amber-500">{t('ignore.exceptions').replace('{n}', String(preview.selectedNotIgnored.length))}</p>}
        <p className="text-muted-foreground">{t('ignore.previewHint')}</p>
      </div>}
      {managing && <div className="space-y-2 border-t border-border pt-3">
        <label className="block text-xs">{t('ignore.checkPath')}<input className="mt-1 w-full border border-input bg-background rounded px-3 py-2 text-sm" value={query} onChange={event => { setQuery(event.target.value); setQueryResult(''); }} placeholder="reports/example.csv" /></label>
        <Button size="sm" variant="outline" disabled={checking || !query || busy} onClick={async () => {
          setChecking(true); setQueryResult('');
          try {
            const output = await checkIgnore(repoPath, [query]);
            const fields = output.split('\0');
            setQueryResult(fields[0] ? `${fields[2].startsWith('!') ? t('ignore.notIgnored') + ' ' : ''}${fields[0]}:${fields[1]} → ${fields[2]}` : t('ignore.notIgnored'));
          } catch (error: any) { setQueryResult(String(error.message || error)); }
          finally { setChecking(false); }
        }}>{t('ignore.check')}</Button>
        <p className="text-xs text-muted-foreground">{t('ignore.checkHint')}</p>
        {queryResult && <p className="text-xs font-mono break-all select-text" role="status">{queryResult}</p>}
      </div>}
      {(error || built.error) && <div role="alert" className="text-sm text-destructive wrap-break-word space-y-2">
        <p>{error.includes('changed on disk') ? t('ignore.changed') : error || built.error}</p>
        {error && <Button size="sm" variant="outline" disabled={busy} onClick={() => { delete drafts.current[scope]; setReload(value => value + 1); }}>{t('ignore.reload')}</Button>}
      </div>}
      </div>
      <div className="flex justify-end gap-2 shrink-0 border-t border-border pt-3">
        <Button variant="outline" disabled={busy} onClick={onClose}>{t('common.cancel')}</Button>
        <Button disabled={busy || loading || !preview || !snapshot || content === snapshot.content || (!managing && rules.length === 0)} onClick={() => void save()}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t(managing ? 'ignore.save' : 'ignore.add')}
        </Button>
      </div>
    </div>
  </ModalSurface>;
}
