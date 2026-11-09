import React, { useEffect, useState } from 'react';
import { Check, CheckCircle2, ChevronRight, Plus, Power, RefreshCw, Trash2, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useErrorsStore, type PersistedConnection } from '@/stores/errorsStore';
import { useTaskStore, type TaskConnection } from '@/stores/taskStore';
import { useI18n } from '@/i18n';
import { toast } from '@/stores/toastStore';
import { confirmAction } from '@/stores/confirmStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ProviderRequestError, type ExternalOrg } from '@/services/errors/providerService';
import { getProviderManifest, PROVIDER_REGISTRY, type ConnectionHealth, type DomainId, type ProviderManifest } from '@/services/integrations/registry';
import { getTaskPlugin } from '@/services/integrations/plugins';
import { ProviderApiError } from '@/services/collaboration/client';
import { useCollaborationStore } from '@/stores/collaborationStore';
import { getHostingPlugin, subscribePlugins } from '@/services/integrations/plugins';
import { cn } from '@/utils/cn';
import { useCiStore } from '@/stores/ciStore';
import { CiConnectionManager } from './CiConnectionManager';

/**
 * 设置「集成」分区（PRD §7.4）：按域分组的平台连接管理。
 * 入口是**已支持插件的卡片**（来自核心 Provider 注册表，按声明的域分组）——
 * 错误追踪平台只需 token（自托管地址收进高级选项，验证后选组织）；
 * 代码托管平台（GitLab / Gitea）为「服务地址 + token」一步连接（仓库宿主没有组织层）；
 * 独立任务系统（task-account，Linear 起步）为「浏览器授权（OAuth PKCE）+ 个人 API Key 兜底」。
 * 连接管理：启用/停用、测试（健康态就地更新，不触碰导航）、删除（联动清 keyring 凭证）。
 */

const groupProviders = (domain: DomainId) => PROVIDER_REGISTRY.filter(manifest => manifest.primaryDomain === domain && (manifest.connectionKind !== 'hosting-account' || getHostingPlugin(manifest.id)));
const providerGroups = [
  ['error-tracking', 'errorTracking'], ['code-hosting', 'codeHosting'],
  ['task-tracking', 'taskTracking'], ['ci-cd', 'ciCd'], ['observability', 'observability'],
] as const;

interface ConnectFormState {
  displayName: string;
  baseUrl: string;
  token: string;
  orgs: ExternalOrg[] | null;
  orgId: string;
}

function providerErrorMessage(error: unknown, translate: (key: string) => string): string {
  // 协作通道客户端（任务插件）抛 ProviderApiError；errors 通道抛 ProviderRequestError。
  const apiStatus = error instanceof ProviderApiError ? error.status : undefined;
  const kind = error instanceof ProviderRequestError ? error.kind
    : apiStatus === 401 ? 'auth'
    : apiStatus === 403 ? 'forbidden'
    : 'unknown';
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

/** 连接管理行的统一渲染：托管（errors 通道）与独立任务（task 通道）共用。 */
const ConnectionRow: React.FC<{
  name: string;
  detail: string;
  enabled: boolean;
  health: ConnectionHealth;
  testing: boolean;
  labels: { toggle: string; test: string; delete: string; connected: string; error: string; unverified: string };
  onToggle(): void;
  onTest(): void;
  onDelete(): void;
}> = ({ name, detail, enabled, health, testing, labels, onToggle, onTest, onDelete }) => (
  <div className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
    <span className="font-medium shrink-0">{name}</span>
    <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">{detail}</span>
    {!enabled && (
      <Badge variant="outline" className="h-4 px-1 gap-0.5 text-[10px] shrink-0 text-muted-foreground">
        {labels.unverified}
      </Badge>
    )}
    {enabled && (
      <Badge
        variant="outline"
        className={
          cn('h-4 px-1 gap-0.5 text-[10px] shrink-0',
            health === 'connected' ? 'text-emerald-500 border-emerald-500/40'
            : health === 'error' ? 'text-destructive border-destructive/40'
            : 'text-muted-foreground')
        }
      >
        {health === 'connected' ? labels.connected : health === 'error' ? labels.error : labels.unverified}
      </Badge>
    )}
    <Button
      variant="ghost"
      size="xs"
      className="p-0 shrink-0"
      aria-label={labels.toggle}
      aria-pressed={enabled}
      onClick={onToggle}
    >
      <Power className={enabled ? 'h-3 w-3 text-primary' : 'h-3 w-3 text-muted-foreground'} />
    </Button>
    <Button variant="ghost" size="xs" className="p-0 shrink-0" aria-label={labels.test} disabled={testing} onClick={onTest}>
      <RefreshCw className={testing ? 'h-3 w-3 animate-spin' : 'h-3 w-3'} />
    </Button>
    <Button variant="ghost" size="xs" className="p-0 shrink-0 hover:text-destructive" aria-label={labels.delete} onClick={onDelete}>
      <Trash2 className="h-3 w-3" />
    </Button>
  </div>
);

export const IntegrationsSection: React.FC<{ onManageAccounts: (providerId: string) => void; onOpenAccountsTab?: () => void }> = ({ onManageAccounts, onOpenAccountsTab }) => {
  const { t } = useI18n();
  const hostingProfiles = useCollaborationStore(state => state.profiles);
  const ciConnections = useCiStore(state => state.connections);
  const activeProfileId = useCollaborationStore(state => state.activeProfileId);
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
  // 独立任务连接（task-account）：与 errors 连接同构的管理动作，令牌/健康态各自独立。
  const task = useTaskStore(
    useShallow((state) => ({
      connections: state.connections,
      restoreConnections: state.restoreConnections,
      connectWithToken: state.connectWithToken,
      connectWithOAuth: state.connectWithOAuth,
      retestConnection: state.retestConnection,
      updateConnection: state.updateConnection,
      removeConnection: state.removeConnection,
      getRuntime: state.getRuntime,
    })),
  );
  const [, updatePlugins] = useState(0);
  useEffect(() => subscribePlugins(() => updatePlugins(value => value + 1)), []);
  // 插件选择：null = 卡片列表；否则展开该平台的连接表单
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  // 卡片展开态：连接信息合并进平台卡片，同屏只展开一个。
  const [expandedProviderId, setExpandedProviderId] = useState<string | null>(null);
  const [form, setForm] = useState<ConnectFormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [oauthConnecting, setOauthConnecting] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  // task 通道：恢复连接幂等（App 启动已调过一次），此处覆盖仅挂设置页的场景。
  const taskRestore = task.restoreConnections;
  useEffect(() => { restoreConnections(); void taskRestore(); }, [restoreConnections, taskRestore]);

  const selectedManifest = selectedProviderId ? getProviderManifest(selectedProviderId) : null;
  const isTaskForm = selectedManifest?.connectionKind === 'task-account';

  const startAdd = (providerId: string) => {
    if (getProviderManifest(providerId)?.connectionKind === 'hosting-account') {
      // 复用既有多账号管理和 OAuth/PAT 流程，避免创建第二份凭证。
      onManageAccounts(providerId);
      return;
    }
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

  /** 独立任务系统：浏览器授权（OAuth PKCE，令牌自动入 keyring），推荐路径。 */
  const startOauth = async () => {
    if (!form || !selectedManifest || oauthConnecting) return;
    setOauthConnecting(true);
    setFormError(null);
    try {
      const plugin = getTaskPlugin(selectedManifest.id);
      if (!plugin?.oauth) throw new Error(t('connections.errors.oauthNotConfigured'));
      const tokenSet = await plugin.oauth.authorize();
      // 显示名留空时由 store 以平台账号 login 兜底。
      await task.connectWithOAuth({ providerId: selectedManifest.id, displayName: form.displayName.trim(), tokenSet });
      toast.success(t('errors.settings.saved'));
      dismissForm();
    } catch (error) {
      setFormError(String(error instanceof Error ? error.message : error));
    } finally {
      setOauthConnecting(false);
    }
  };

  /** 独立任务系统：个人 API Key 兜底（验证内含在保存里，无组织步骤）。 */
  const submitTaskSave = async () => {
    if (!form || !selectedManifest || saving) return;
    if (!form.token.trim()) {
      setFormError(t('errors.connect.needToken'));
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await task.connectWithToken({ providerId: selectedManifest.id, displayName: form.displayName.trim(), token: form.token });
      toast.success(t('errors.settings.saved'));
      dismissForm();
    } catch (error) {
      setFormError(providerErrorMessage(error, t));
    } finally {
      setSaving(false);
    }
  };

  const runTaskTest = async (id: string) => {
    if (testingId) return;
    setTestingId(id);
    try {
      await task.retestConnection(id);
      const runtime = task.getRuntime(id);
      if (runtime.health === 'connected') toast.success(t('errors.settings.testOk'));
      else toast.error(t('errors.settings.testFailed'), runtime.statusMessage || undefined);
    } finally {
      setTestingId(null);
    }
  };

  const deleteTaskConnection = async (connection: TaskConnection) => {
    if (
      !await confirmAction({
        title: t('errors.settings.deleteTitle').replace('{name}', connection.displayName),
        description: t('errors.settings.deleteDesc'),
      })
    ) {
      return;
    }
    try {
      await task.removeConnection(connection.id);
    } catch (error) {
      toast.error(t('errors.settings.deleteFailed'), String(error instanceof Error ? error.message : error));
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

  const rowLabels = (displayName: string) => ({
    toggle: t('errors.settings.toggleConnection'),
    test: t('errors.settings.test'),
    delete: t('errors.settings.deleteTitle').replace('{name}', displayName),
    connected: t('errors.settings.health.connected'),
    error: t('errors.settings.health.error'),
    unverified: t('errors.settings.health.unverified'),
  });

  /** 卡片：provider + 连接计数徽标，账号统一来自协作状态。 */
  const connectedCount = (manifest: ProviderManifest): number => {
    if (manifest.connectionKind === 'hosting-account') return hostingProfiles.filter(profile => profile.providerId === manifest.id).length;
    // 独立任务连接在 taskStore（errors 通道只存 error-token 连接）。
    if (manifest.connectionKind === 'task-account') return task.connections.filter((connection) => connection.providerId === manifest.id).length;
    if (manifest.connectionKind === 'ci-server') return ciConnections.filter(connection => connection.providerId === manifest.id).length;
    return connections.filter((connection) => connection.providerId === manifest.id).length;
  };

  /** 卡片：可展开的平台项——连接信息合并进卡片本体，不再有独立的底部列表。 */
  const renderCard = (manifest: ProviderManifest) => {
    const open = expandedProviderId === manifest.id;
    const hostingRows = manifest.connectionKind === 'hosting-account'
      ? hostingProfiles.filter(profile => profile.providerId === manifest.id)
      : [];
    const errorRows = manifest.connectionKind === 'error-token' ? connections.filter((connection) => connection.providerId === manifest.id) : [];
    const taskRows = manifest.connectionKind === 'task-account' ? task.connections.filter((connection) => connection.providerId === manifest.id) : [];
    return (
      <div key={manifest.id} className="rounded-md border border-border">
        <button
          aria-label={`${t('errors.settings.pickProvider')}: ${manifest.name}`}
          aria-expanded={open}
          onClick={() => setExpandedProviderId(open ? null : manifest.id)}
          className="w-full flex items-center justify-between rounded-md px-2.5 py-2 text-left transition-colors hover:bg-accent/40"
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
          <ChevronRight className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', open && 'rotate-90')} />
        </button>
        {open && (
          <div className="space-y-1 border-t border-border px-2 py-1.5" data-testid={`provider-expanded-${manifest.id}`}>
            {hostingRows.map(profile => (
              <div key={profile.id} className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
                <span className="font-medium shrink-0">{profile.user?.login ?? profile.label}</span>
                <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">{profile.server}</span>
                {profile.id === activeProfileId && (
                  <Badge variant="success" className="h-4 px-1 gap-0.5 text-[10px] shrink-0">
                    <CheckCircle2 className="h-2.5 w-2.5" />
                    <span>{t('errors.settings.currentBadge')}</span>
                  </Badge>
                )}
                <Button variant="ghost" size="xs" className="shrink-0" onClick={() => (onOpenAccountsTab ? onOpenAccountsTab() : onManageAccounts(manifest.id))}>
                  {t('errors.settings.manageAccounts')}
                </Button>
              </div>
            ))}
            {errorRows.map(connection => (
              <ConnectionRow
                key={connection.id}
                name={connection.displayName}
                detail={`${connection.orgId ?? ''}${connection.baseUrl ? ` · ${hostOf(connection.baseUrl)}` : ''}`}
                enabled={connection.enabled}
                health={getRuntime(connection.id).health}
                testing={testingId === connection.id}
                labels={rowLabels(connection.displayName)}
                onToggle={() => updateConnection(connection.id, { enabled: !connection.enabled })}
                onTest={() => void runTest(connection.id)}
                onDelete={() => void deleteConnection(connection)}
              />
            ))}
            {taskRows.map(connection => (
              <ConnectionRow
                key={connection.id}
                name={connection.displayName}
                detail=""
                enabled={connection.enabled}
                health={task.getRuntime(connection.id).health}
                testing={testingId === connection.id}
                labels={rowLabels(connection.displayName)}
                onToggle={() => task.updateConnection(connection.id, { enabled: !connection.enabled })}
                onTest={() => void runTaskTest(connection.id)}
                onDelete={() => void deleteTaskConnection(connection)}
              />
            ))}
            {manifest.connectionKind === 'ci-server' && <CiConnectionManager providerId={manifest.id} />}
            {manifest.connectionKind !== 'ci-server' && <Button
              variant="ghost"
              size="xs"
              aria-label={t('errors.settings.addConnection')}
              className="w-full justify-start gap-1 text-muted-foreground"
              onClick={() => (manifest.connectionKind === 'hosting-account' ? onManageAccounts(manifest.id) : startAdd(manifest.id))}
            >
              <Plus className="h-3 w-3" />
              <span>{t('errors.settings.addConnection')}</span>
            </Button>}
          </div>
        )}
      </div>
    );
  };

  return (
    <section className="space-y-3 border-t border-border pt-3" data-testid="errors-integrations-section">
      <div className="space-y-1">
        <h3 className="text-xs font-medium">{t('errors.settings.title')}</h3>
        <p className="text-[12px] text-muted-foreground leading-relaxed">{t('errors.settings.description')}</p>
      </div>

      {form && selectedManifest ? (
        /* —— 连接表单：托管平台只需 token；独立任务系统为 OAuth + API Key 兜底 —— */
        <div className="space-y-2 rounded-lg border border-border p-2.5 bg-accent/20" data-testid="errors-connect-form">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">{t('errors.connect.formTitle').replace('{name}', selectedManifest.name)}</span>
            <Button variant="ghost" size="icon-xs" aria-label={t('common.close')} onClick={dismissForm}>
              <X className="h-3 w-3" />
            </Button>
          </div>
          {isTaskForm && (
            <div className="space-y-1.5 rounded-md border border-border p-2">
              <Button variant="outline" size="xs" onClick={() => void startOauth()} disabled={oauthConnecting} className="w-full gap-1">
                <RefreshCw className={oauthConnecting ? 'h-3 w-3 animate-spin' : 'h-3 w-3'} />
                <span>{oauthConnecting ? t('errors.connect.oauthConnecting') : t('errors.connect.oauth')}</span>
              </Button>
              <p className="text-[12px] text-muted-foreground leading-relaxed">{t('errors.connect.oauthHint')}</p>
            </div>
          )}
          <label className="block space-y-1">
            <span className="text-[12px] font-medium">{t('errors.connect.token')}</span>
            <Input
              type="password"
              value={form.token}
              onChange={(e) => setForm({ ...form, token: e.target.value })}
              placeholder={t('errors.connect.tokenPlaceholder')}
              className="font-mono text-xs"
              aria-label={t('errors.connect.token')}
              autoFocus={!isTaskForm}
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
          {!isTaskForm && (
            <>
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
            </>
          )}
          {formError && <p role="alert" className="text-destructive select-text whitespace-pre-wrap">{formError}</p>}
          {isTaskForm ? (
            <div className="flex items-center justify-end gap-2 pt-1">
              <Button variant="outline" size="xs" onClick={() => void submitTaskSave()} disabled={verifying || saving} className="gap-1">
                <Check className="h-3 w-3" />
                <span>{saving ? t('errors.connect.saving') : t('errors.connect.save')}</span>
              </Button>
            </div>
          ) : (
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
          )}
        </div>
      ) : (
        /* —— 插件卡片：按域分组，选一个进入表单 —— */
        <div className="space-y-1" data-testid="errors-provider-cards">
          {providerGroups.map(([domain, label]) => {
            const providers = groupProviders(domain);
            return providers.length > 0 && <React.Fragment key={domain}>
              <h4 className="pt-1 text-[12px] font-medium text-muted-foreground">{t(`errors.settings.group.${label}`)}</h4>
              {providers.map(renderCard)}
            </React.Fragment>;
          })}
        </div>
      )}

    </section>
  );
};
