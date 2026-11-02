import { getPluginAuthView } from '@/plugins/ui';
import { normalizeServerUrl } from '@/services/integrations/serverUrl';
import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useCollaborationStore } from '@/stores/collaborationStore';
import { enabledHostingPlugins, getHostingPlugin } from '@/services/integrations/plugins';
import { useI18n } from '@/i18n';
import { ModalSurface } from '@/components/ui/ModalSurface';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function ConnectionDialog({ open, onOpenChange }: { open: boolean; onOpenChange(open: boolean): void }) {
  const { providerId, server, selectProvider, login } = useCollaborationStore(useShallow(state => ({
    providerId: state.providerId, server: state.server, selectProvider: state.selectProvider, login: state.login,
  })));
  const { t } = useI18n();
  const [token, setToken] = useState(''), [address, setAddress] = useState(server);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [nativeAuth, setNativeAuth] = useState(false);
  const plugins = enabledHostingPlugins(), selected = getHostingPlugin(providerId ?? '') ?? plugins[0];
  const AuthView = useMemo(() => { const loader = selected && getPluginAuthView(selected.manifest.id); return loader ? lazy(loader) : null; }, [selected]);
  useEffect(() => { setAddress(server || selected?.defaultServer || ''); }, [server, selected]);
  useEffect(() => () => { useCollaborationStore.getState().cancelAddProfile(); useCollaborationStore.getState().finishConnection(); }, []);
  if (!open) return null;
  if (nativeAuth && AuthView) return <Suspense fallback={<p>{t('common.loading')}</p>}><AuthView open onOpenChange={onOpenChange} /></Suspense>;
  const connect = async (event: React.FormEvent) => {
    event.preventDefault(); if (!selected || busy) return;
    setBusy(true); setError('');
    try {
      selectProvider(selected.manifest.id, normalizeServerUrl(address));
      await login(token.trim()); setToken(''); onOpenChange(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };
  return <ModalSurface label={t('connections.title')} onDismiss={() => onOpenChange(false)} dismissible={!busy}
    className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs">
    <form onSubmit={connect} className="w-full max-w-md rounded-xl border border-border bg-card p-5 space-y-4">
      <h2 className="text-sm font-semibold">{t('connections.title')}</h2>
      <label className="block space-y-1 text-xs"><span>{t('connections.platform')}</span>
        <select className="w-full h-8 rounded border border-input bg-background px-2" disabled={busy} value={selected?.manifest.id ?? ''}
          onChange={event => { const plugin = getHostingPlugin(event.target.value); if (plugin) { selectProvider(plugin.manifest.id, plugin.defaultServer); setToken(''); setError(''); } }}>
          {plugins.map(plugin => <option key={plugin.manifest.id} value={plugin.manifest.id}>{plugin.manifest.name}</option>)}
        </select>
      </label>
      <label className="block space-y-1 text-xs"><span>{t('connections.server')}</span><Input required value={address} disabled={busy} onChange={event => setAddress(event.target.value)} /></label>
      <label className="block space-y-1 text-xs"><span>{t('connections.token')}</span><Input type="password" required value={token} disabled={busy} autoComplete="off" onChange={event => setToken(event.target.value)} /></label>
      {error && <p role="alert" className="text-xs text-destructive break-all">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        {AuthView && <Button type="button" variant="outline" disabled={busy} onClick={() => { if (selected) selectProvider(selected.manifest.id, address || selected.defaultServer); setNativeAuth(true); }}>{t('connections.platformAuth')}</Button>}
        <Button type="button" variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
        <Button type="submit" disabled={busy || !selected}>{t(busy ? 'common.loading' : 'connections.connect')}</Button>
      </div>
    </form>
  </ModalSurface>;
}
