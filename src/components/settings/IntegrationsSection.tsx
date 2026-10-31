import React, { useEffect, useState } from 'react';
import { Check, Plus, Power, RefreshCw, Trash2, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useErrorsStore } from '@/stores/errorsStore';
import { useI18n } from '@/i18n';
import { toast } from '@/stores/toastStore';
import { confirmAction } from '@/stores/confirmStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ProviderRequestError, type ExternalOrg } from '@/services/errors/providerService';
import type { PersistedConnection } from '@/stores/errorsStore';

/**
 * 设置「集成」分区（PRD §7.4）：按域分组展示错误追踪平台的连接。
 * 连接管理：启用/停用、测试（健康态就地更新，不触碰导航）、删除（联动清 keyring 凭证）。
 * 连接流程两步：验证并选组织 → 保存（token 只进 keyring）。
 */

interface ConnectFormState {
  displayName: string;
  baseUrl: string;
  token: string;
  orgs: ExternalOrg[] | null;
  orgId: string;
}

function providerErrorMessage(error: unknown, translate: (key: string) => string): string {
  const kind = error instanceof ProviderRequestError ? error.kind : 'unknown';
  const base =
    kind === 'auth' ? translate('errors.connect.errorAuth')
    : kind === 'forbidden' ? translate('errors.connect.errorForbidden')
    : kind === 'network' ? translate('errors.connect.errorNetwork')
    : translate('errors.connect.verifyFailed');
  const detail = error instanceof Error && error.message ? error.message : '';
  return detail ? `${base}\n${detail}` : base;
}

const hostOf = (url: string | undefined): string => {
  if (!url) return '';
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

export const IntegrationsSection: React.FC = () => {
  const { t } = useI18n();
  const { connections, restoreConnections, verifyConnection, completeConnection, retestConnection, updateConnection, removeConnection, getRuntime } =
    useErrorsStore(
      useShallow((state) => ({
        connections: state.connections,
        restoreConnections: state.restoreConnections,
        verifyConnection: state.verifyConnection,
        completeConnection: state.completeConnection,
        retestConnection: state.retestConnection,
        updateConnection: state.updateConnection,
        removeConnection: state.removeConnection,
        getRuntime: state.getRuntime,
      })),
    );
  const [form, setForm] = useState<ConnectFormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  useEffect(() => { restoreConnections(); }, [restoreConnections]);

  const startAdd = () => {
    setForm({ displayName: '', baseUrl: '', token: '', orgs: null, orgId: '' });
    setFormError(null);
  };
  const dismissForm = () => {
    setForm(null);
    setFormError(null);
  };

  const startVerify = async () => {
    if (!form || verifying) return;
    const baseUrl = form.baseUrl.trim();
    if (baseUrl && !/^https?:\/\//i.test(baseUrl)) {
      setFormError(t('errors.connect.invalidBaseUrl'));
      return;
    }
    if (!form.token.trim()) {
      setFormError(t('errors.connect.needToken'));
      return;
    }
    setVerifying(true);
    setFormError(null);
    try {
      const orgs = await verifyConnection({ providerId: 'sentry', baseUrl: baseUrl || undefined, token: form.token });
      setForm({ ...form, orgs, orgId: orgs.length === 1 ? orgs[0].id : '' });
    } catch (error) {
      setFormError(providerErrorMessage(error, t));
    } finally {
      setVerifying(false);
    }
  };

  const submitSave = async () => {
    if (!form || saving) return;
    if (!form.orgId) {
      setFormError(t('errors.connect.noOrg'));
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await completeConnection({
        providerId: 'sentry',
        displayName: form.displayName.trim(),
        baseUrl: form.baseUrl.trim() || undefined,
        token: form.token,
        orgId: form.orgId,
      });
      toast.success(t('errors.settings.saved'));
      dismissForm();
    } catch (error) {
      setFormError(providerErrorMessage(error, t));
    } finally {
      setSaving(false);
    }
  };

  const runTest = async (id: string) => {
    if (testingId) return;
    setTestingId(id);
    try {
      await retestConnection(id);
      const runtime = getRuntime(id);
      if (runtime.health === 'connected') toast.success(t('errors.settings.testOk'));
      else toast.error(t('errors.settings.testFailed'), runtime.statusMessage || undefined);
    } finally {
      setTestingId(null);
    }
  };

  const deleteConnection = async (connection: PersistedConnection) => {
    if (
      !await confirmAction({
        title: t('errors.settings.deleteTitle').replace('{name}', connection.displayName),
        description: t('errors.settings.deleteDesc'),
      })
    ) {
      return;
    }
    try {
      await removeConnection(connection.id);
    } catch (error) {
      toast.error(t('errors.settings.deleteFailed'), String(error instanceof Error ? error.message : error));
    }
  };

  const healthBadge = (connection: PersistedConnection) => {
    const health = getRuntime(connection.id).health;
    const label = t(health === 'connected' ? 'errors.settings.health.connected' : health === 'error' ? 'errors.settings.health.error' : 'errors.settings.health.unverified');
    return (
      <Badge
        variant="outline"
        className={
          health === 'connected'
            ? 'h-4 px-1 gap-0.5 text-[10px] shrink-0 text-emerald-500 border-emerald-500/40'
            : health === 'error'
              ? 'h-4 px-1 gap-0.5 text-[10px] shrink-0 text-destructive border-destructive/40'
              : 'h-4 px-1 gap-0.5 text-[10px] shrink-0 text-muted-foreground'
        }
      >
        {label}
      </Badge>
    );
  };

  return (
    <section className="space-y-2 border-t border-border pt-3" data-testid="errors-integrations-section">
      <h3 className="text-xs font-medium">{t('errors.settings.title')}</h3>
      <p className="text-[12px] text-muted-foreground">{t('errors.settings.description')}</p>

      <h4 className="pt-1 text-[12px] font-medium text-muted-foreground">{t('errors.settings.group.errorTracking')}</h4>

      {form ? (
        <div className="space-y-2 rounded-lg border border-border p-2.5 bg-accent/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">{t('errors.connect.formTitle')}</span>
            <Button variant="ghost" size="icon-xs" aria-label={t('common.close')} onClick={dismissForm}>
              <X className="h-3 w-3" />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-[12px] font-medium">{t('errors.connect.displayName')}</span>
              <Input
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                placeholder={t('errors.connect.displayNamePlaceholder')}
                aria-label={t('errors.connect.displayName')}
              />
            </label>
            <label className="space-y-1">
              <span className="text-[12px] font-medium">{t('errors.connect.baseUrl')}</span>
              <Input
                value={form.baseUrl}
                onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                placeholder={t('errors.connect.baseUrlPlaceholder')}
                className="font-mono text-xs"
                aria-label={t('errors.connect.baseUrl')}
              />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-[12px] font-medium">{t('errors.connect.token')}</span>
            <Input
              type="password"
              value={form.token}
              onChange={(e) => setForm({ ...form, token: e.target.value })}
              placeholder={t('errors.connect.tokenPlaceholder')}
              className="font-mono text-xs"
              aria-label={t('errors.connect.token')}
            />
          </label>
          <p className="text-[12px] text-muted-foreground leading-relaxed">{t('errors.connect.tokenHint')}</p>
          <label className="block space-y-1">
            <span className="text-[12px] font-medium">{t('errors.connect.org')}</span>
            <select
              value={form.orgId}
              onChange={(e) => setForm({ ...form, orgId: e.target.value })}
              aria-label={t('errors.connect.org')}
              disabled={!form.orgs?.length}
              className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs disabled:opacity-60"
            >
              <option value="" className="bg-popover text-foreground">{t('errors.connect.orgPlaceholder')}</option>
              {(form.orgs ?? []).map((org) => (
                <option key={org.id} value={org.id} className="bg-popover text-foreground">
                  {org.name}（{org.slug}）
                </option>
              ))}
            </select>
          </label>
          {formError && <p role="alert" className="text-destructive select-text whitespace-pre-wrap">{formError}</p>}
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button variant="ghost" size="xs" onClick={() => void startVerify()} disabled={verifying || saving} className="gap-1">
              <RefreshCw className={verifying ? 'h-3 w-3 animate-spin' : 'h-3 w-3'} />
              <span>{verifying ? t('errors.connect.verifying') : t('errors.connect.verify')}</span>
            </Button>
            <Button variant="outline" size="xs" onClick={() => void submitSave()} disabled={verifying || saving || !form.orgs} className="gap-1">
              <Check className="h-3 w-3" />
              <span>{saving ? t('errors.connect.saving') : t('errors.connect.save')}</span>
            </Button>
          </div>
        </div>
      ) : (
        <>
          {connections.length === 0 && <p className="text-muted-foreground">{t('errors.settings.empty')}</p>}
          <div className="space-y-1">
            {connections.map((connection) => (
              <div key={connection.id} className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
                <Badge variant="outline" className="h-4 px-1 gap-0.5 text-[10px] shrink-0">Sentry</Badge>
                <span className="font-medium shrink-0">{connection.displayName}</span>
                <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">
                  {connection.orgId ? `${connection.orgId}` : ''}
                  {connection.baseUrl ? ` · ${hostOf(connection.baseUrl)}` : ''}
                </span>
                {!connection.enabled && (
                  <Badge variant="outline" className="h-4 px-1 gap-0.5 text-[10px] shrink-0 text-muted-foreground">
                    {t('errors.settings.health.unverified')}
                  </Badge>
                )}
                {connection.enabled && healthBadge(connection)}
                <Button
                  variant="ghost"
                  size="xs"
                  className="p-0 shrink-0"
                  aria-label={t('errors.settings.toggleConnection')}
                  aria-pressed={connection.enabled}
                  onClick={() => updateConnection(connection.id, { enabled: !connection.enabled })}
                >
                  <Power className={connection.enabled ? 'h-3 w-3 text-primary' : 'h-3 w-3 text-muted-foreground'} />
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  className="p-0 shrink-0"
                  aria-label={t('errors.settings.test')}
                  disabled={testingId === connection.id}
                  onClick={() => void runTest(connection.id)}
                >
                  <RefreshCw className={testingId === connection.id ? 'h-3 w-3 animate-spin' : 'h-3 w-3'} />
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  className="p-0 shrink-0 hover:text-destructive"
                  aria-label={t('errors.settings.deleteTitle').replace('{name}', connection.displayName)}
                  onClick={() => void deleteConnection(connection)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
          <div>
            <Button variant="outline" size="xs" className="gap-1" onClick={startAdd}>
              <Plus className="h-3 w-3" />
              <span>{t('errors.settings.addConnection')}</span>
            </Button>
          </div>
        </>
      )}
    </section>
  );
};
