import React, { useEffect, useState } from 'react';
import { Check, ChevronRight, Power, RefreshCw, Trash2, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useErrorsStore } from '@/stores/errorsStore';
import { useForgeStore } from '@/stores/forgeStore';
import { useI18n } from '@/i18n';
import { toast } from '@/stores/toastStore';
import { confirmAction } from '@/stores/confirmStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ProviderRequestError, type ExternalOrg } from '@/services/errors/providerService';
import { getProviderManifest, providerDomains, PROVIDER_REGISTRY, type DomainId, type ProviderManifest } from '@/services/errors/types';
import { ForgeApiError } from '@/services/forge/types';
import { gitlabService } from '@/services/gitlab/GitLabService';
import { giteaService } from '@/services/gitea/GiteaService';
import type { PersistedConnection } from '@/stores/errorsStore';
import { cn } from '@/utils/cn';

/**
 * 设置「集成」分区（PRD §7.4）：按域分组的平台连接管理。
 * 入口是**已支持插件的卡片**（来自核心 Provider 注册表，按声明的域分组）——
 * 错误追踪平台只需 token（自托管地址收进高级选项，验证后选组织）；
 * 代码托管平台（GitLab / Gitea）为「服务地址 + token」一步连接（仓库宿主没有组织层）。
 * 连接管理：启用/停用、测试（健康态就地更新，不触碰导航）、删除（联动清 keyring 凭证）。
 */

/** 按声明域拆分卡片清单（一个 provider 只归属一个域视图，v1 无跨域声明）。 */
const groupProviders = (domain: DomainId): ProviderManifest[] =>
  PROVIDER_REGISTRY.filter((manifest) => providerDomains(manifest).includes(domain));

/** 管理行渲染用 manifest（与注册表同一实例，注册表变更时自动跟随）。 */
const GITLAB_MANIFEST = getProviderManifest('gitlab')!;
const GITEA_MANIFEST = getProviderManifest('gitea')!;

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

function forgeErrorMessage(error: unknown, translate: (key: string) => string): string {
  const status = error instanceof ForgeApiError ? error.status : undefined;
  const base =
    status === 401 || status === 403 ? translate('errors.connect.errorAuth')
    : status === 0 ? translate('errors.connect.errorNetwork')
    : translate('forge.connectFailed');
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

/** 代码托管连接表单：服务地址（必填，gitlab.com 预填）+ PAT，一步验证并保存。 */
const ForgeConnectForm: React.FC<{ manifest: ProviderManifest; onDone: () => void }> = ({ manifest, onDone }) => {
  const { t } = useI18n();
  const connect = useForgeStore((state) => state.connect);
  const kind = manifest.id === 'gitea' ? 'gitea' : 'gitlab';
  const [server, setServer] = useState(kind === 'gitlab' ? 'https://gitlab.com' : '');
  const [token, setToken] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    const trimmedServer = server.trim();
    if (!/^https?:\/\//i.test(trimmedServer)) {
      setFormError(t('errors.connect.invalidBaseUrl'));
      return;
    }
    if (!token.trim()) {
      setFormError(t('errors.connect.needToken'));
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      const user = await connect(kind, trimmedServer, token);
      toast.success(t('forge.connected'), user.login);
      onDone();
    } catch (error) {
      setFormError(forgeErrorMessage(error, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 rounded-lg border border-border p-2.5 bg-accent/20" data-testid="errors-connect-form">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">{t('errors.connect.formTitle').replace('{name}', manifest.name)}</span>
        <Button variant="ghost" size="icon-xs" aria-label={t('common.close')} onClick={onDone}>
          <X className="h-3 w-3" />
        </Button>
      </div>
      <label className="block space-y-1">
        <span className="text-[12px] font-medium">{t('forge.serverUrl')}</span>
        <Input
          value={server}
          onChange={(e) => setServer(e.target.value)}
          placeholder={kind === 'gitlab' ? 'https://gitlab.com' : 'https://gitea.example.com'}
          className="font-mono text-xs"
          aria-label={t('forge.serverUrl')}
          autoFocus
        />
      </label>
      <label className="block space-y-1">
        <span className="text-[12px] font-medium">{t('forge.token')}</span>
        <Input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          className="font-mono text-xs"
          aria-label={t('forge.token')}
        />
      </label>
      <p className="text-[12px] text-muted-foreground leading-relaxed">{t('forge.tokenHint')}</p>
      {formError && <p role="alert" className="text-destructive select-text whitespace-pre-wrap">{formError}</p>}
      <div className="flex items-center justify-end gap-2 pt-1">
        <Button variant="default" size="xs" onClick={() => void submit()} disabled={busy} className="gap-1">
          <Check className="h-3 w-3" />
          <span>{busy ? t('errors.connect.verifying') : t('forge.connectSubmit')}</span>
        </Button>
      </div>
    </div>
  );
};

/** 代码托管账号管理行：单平台单账号，测试即时校验，断开联动清 keyring。 */
const ForgeAccountRow: React.FC<{ kind: 'gitlab' | 'gitea'; manifest: ProviderManifest }> = ({ kind, manifest }) => {
  const { t } = useI18n();
  const account = useForgeStore(useShallow((state) => (kind === 'gitlab' ? state.gitlab : state.gitea)));
  const disconnect = useForgeStore((state) => state.disconnect);
  const [testing, setTesting] = useState(false);

  if (!account) return null;

  const runTest = async () => {
    if (testing) return;
    setTesting(true);
    try {
      const service = kind === 'gitlab' ? gitlabService : giteaService;
      const user = await service.verifyToken();
      toast.success(t('errors.settings.testOk'), user.login);
    } catch (error) {
      toast.error(t('errors.settings.testFailed'), forgeErrorMessage(error, t));
    } finally {
      setTesting(false);
    }
  };

  const remove = async () => {
    if (!await confirmAction({
      title: t('errors.settings.deleteTitle').replace('{name}', account.user?.login || manifest.name),
      description: t('errors.settings.deleteDesc'),
    })) {
      return;
    }
    try {
      await disconnect(kind);
    } catch (error) {
      toast.error(t('errors.settings.deleteFailed'), String(error instanceof Error ? error.message : error));
    }
  };

  return (
    <div className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
      <span className="font-medium shrink-0">{account.user?.login || manifest.name}</span>
      <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">{hostOf(account.server)}</span>
      <Badge variant="outline" className="h-4 px-1 gap-0.5 text-[10px] shrink-0 text-emerald-500 border-emerald-500/40">
        {t('errors.settings.health.connected')}
      </Badge>
      <Button
        variant="ghost"
        size="xs"
        className="p-0 shrink-0"
        aria-label={t('errors.settings.test')}
        disabled={testing}
        onClick={() => void runTest()}
      >
        <RefreshCw className={testing ? 'h-3 w-3 animate-spin' : 'h-3 w-3'} />
      </Button>
      <Button
        variant="ghost"
        size="xs"
        className="p-0 shrink-0 hover:text-destructive"
        aria-label={t('errors.settings.deleteTitle').replace('{name}', account.user?.login || manifest.name)}
        onClick={() => void remove()}
      >
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  );
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
  const { gitlabAccount, giteaAccount, restoreAccounts } = useForgeStore(
    useShallow((state) => ({
      gitlabAccount: state.gitlab,
      giteaAccount: state.gitea,
      restoreAccounts: state.restoreAccounts,
    })),
  );
  // 插件选择：null = 卡片列表；否则展开该平台的连接表单
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [form, setForm] = useState<ConnectFormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  useEffect(() => { restoreConnections(); restoreAccounts(); }, [restoreConnections, restoreAccounts]);

  const selectedManifest = selectedProviderId ? getProviderManifest(selectedProviderId) : null;
  const selectedIsForge = selectedManifest ? providerDomains(selectedManifest).includes('code-hosting') : false;

  const startAdd = (providerId: string) => {
    setSelectedProviderId(providerId);
    setForm({ displayName: '', baseUrl: '', token: '', orgs: null, orgId: '' });
    setFormError(null);
  };
  const dismissForm = () => {
    setSelectedProviderId(null);
    setForm(null);
    setFormError(null);
  };

  const startVerify = async () => {
    if (!form || !selectedManifest || verifying) return;
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
      const orgs = await verifyConnection({ providerId: selectedManifest.id, baseUrl: baseUrl || undefined, token: form.token });
      setForm({ ...form, orgs, orgId: orgs.length === 1 ? orgs[0].id : '' });
    } catch (error) {
      setFormError(providerErrorMessage(error, t));
    } finally {
      setVerifying(false);
    }
  };

  const submitSave = async () => {
    if (!form || !selectedManifest || saving) return;
    if (!form.orgId) {
      setFormError(t('errors.connect.noOrg'));
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await completeConnection({
        providerId: selectedManifest.id,
        displayName: form.displayName.trim() || selectedManifest.name,
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

  /** 卡片：provider + 连接计数徽标（错误追踪走 errorsStore，代码托管走 forgeStore 账号）。 */
  const connectedCount = (manifest: ProviderManifest): number => {
    if (providerDomains(manifest).includes('code-hosting')) {
      return (manifest.id === 'gitlab' ? gitlabAccount : giteaAccount) ? 1 : 0;
    }
    return connections.filter((connection) => connection.providerId === manifest.id).length;
  };

  const renderCard = (manifest: ProviderManifest) => (
    <button
      key={manifest.id}
      aria-label={`${t('errors.settings.pickProvider')}: ${manifest.name}`}
      onClick={() => startAdd(manifest.id)}
      className="w-full flex items-center justify-between rounded-md border border-border px-2.5 py-2 text-left transition-colors hover:bg-accent/40"
    >
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium">{manifest.name}</span>
        <Badge
          variant="outline"
          className={cn('h-4 px-1 text-[10px]', connectedCount(manifest) > 0 ? 'text-emerald-500 border-emerald-500/40' : 'text-muted-foreground')}
        >
          {connectedCount(manifest) > 0 ? t('errors.settings.connectedCount').replace('{n}', String(connectedCount(manifest))) : t('errors.settings.notConnected')}
        </Badge>
      </div>
      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
    </button>
  );

  return (
    <section className="space-y-2 border-t border-border pt-3" data-testid="errors-integrations-section">
      <h3 className="text-xs font-medium">{t('errors.settings.title')}</h3>
      <p className="text-[12px] text-muted-foreground">{t('errors.settings.description')}</p>

      {form && selectedManifest && selectedIsForge ? (
        <ForgeConnectForm manifest={selectedManifest} onDone={dismissForm} />
      ) : form && selectedManifest ? (
        /* —— 连接表单：选定的插件 + 只需 token —— */
        <div className="space-y-2 rounded-lg border border-border p-2.5 bg-accent/20" data-testid="errors-connect-form">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">{t('errors.connect.formTitle').replace('{name}', selectedManifest.name)}</span>
            <Button variant="ghost" size="icon-xs" aria-label={t('common.close')} onClick={dismissForm}>
              <X className="h-3 w-3" />
            </Button>
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
              autoFocus
            />
          </label>
          <p className="text-[12px] text-muted-foreground leading-relaxed">{t(`errors.provider.${selectedManifest.id}.tokenHint`)}</p>
          <label className="block space-y-1">
            <span className="text-[12px] font-medium">{t('errors.connect.displayName')}</span>
            <Input
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              placeholder={t('errors.connect.displayNamePlaceholder')}
              aria-label={t('errors.connect.displayName')}
            />
          </label>
          <details className="rounded-md border border-border px-2 py-1.5">
            <summary className="cursor-pointer select-none text-[12px] text-muted-foreground">{t('errors.connect.advanced')}</summary>
            <label className="mt-2 block space-y-1">
              <span className="text-[12px] font-medium">{t('errors.connect.baseUrl')}</span>
              <Input
                value={form.baseUrl}
                onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                placeholder={t('errors.connect.baseUrlPlaceholder')}
                className="font-mono text-xs"
                aria-label={t('errors.connect.baseUrl')}
              />
            </label>
          </details>
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
        /* —— 插件卡片：按域分组，选一个进入表单 —— */
        <div className="space-y-1" data-testid="errors-provider-cards">
          <h4 className="pt-1 text-[12px] font-medium text-muted-foreground">{t('errors.settings.group.errorTracking')}</h4>
          {groupProviders('error-tracking').map(renderCard)}
          <h4 className="pt-1 text-[12px] font-medium text-muted-foreground">{t('errors.settings.group.codeHosting')}</h4>
          {groupProviders('code-hosting').map(renderCard)}
        </div>
      )}

      {/* 已有连接的管理列表（按平台分组：错误追踪连接 + 代码托管账号） */}
      {(connections.length > 0 || gitlabAccount || giteaAccount) && (
        <div className="space-y-1">
          {PROVIDER_REGISTRY
            .filter((manifest) => !providerDomains(manifest).includes('code-hosting'))
            .filter((manifest) => connections.some((connection) => connection.providerId === manifest.id))
            .map((manifest) => (
              <div key={manifest.id} className="space-y-1">
                <div className="pt-1 text-[11px] font-medium text-muted-foreground">{manifest.name}</div>
                {connections.filter((connection) => connection.providerId === manifest.id).map((connection) => (
                  <div key={connection.id} className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
                    <span className="font-medium shrink-0">{connection.displayName}</span>
                    <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">
                      {connection.orgId ?? ''}
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
            ))}
          {gitlabAccount && <ForgeAccountRow kind="gitlab" manifest={GITLAB_MANIFEST} />}
          {giteaAccount && <ForgeAccountRow kind="gitea" manifest={GITEA_MANIFEST} />}
        </div>
      )}
    </section>
  );
};
