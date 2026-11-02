/**
 * Errors 页（PRD §7.2/§7.3，M3）：合并列表 + 详情。
 * - 作用域（本仓库/全部，决定徽标口径）、来源筛选、severity 筛选、搜索、手动刷新、加载更多；
 * - 按连接降级横幅（失败的连接保留旧数据）；双空态（无连接 / 无映射）；
 * - 详情：元信息、嫌疑提交、堆栈帧三档跳转（§8.4）、rawData 折叠区。
 * 平台返回的异常内容保持原文（§7.5），本视图文案全部走 t()。
 */
import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Bug, ExternalLink, Loader2, RefreshCw, Settings, Sparkles, SquareArrowOutUpRight, Trash2 } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useErrorsStore } from '@/stores/errorsStore';
import { useRepoStore } from '@/stores/repoStore';
import { useLayoutStore, DEFAULT_LAYOUT } from '@/stores/layoutStore';
import { ResizeHandle } from '@/components/ui/ResizeHandle';
import { openExternalUrl } from '@/utils/openExternal';
import { useI18n } from '@/i18n';
import { toast } from '@/stores/toastStore';
import { gitService } from '@/services/git/GitService';
import { createProviderClient, type ExternalProject } from '@/services/errors/providerService';
import { getIntegrationToken } from '@/services/errors/credentials';
import { filterIssues, scopeProjectIds, type ErrorsScope } from '@/services/errors/issueQuery';
import { listTrackedFiles, resolveStackFrame, revealLocalFile, type StackJumpFrame } from '@/services/errors/stackNavigation';
import type { CommitRef, NormalizedSeverity, NormalizedStatus, UnifiedErrorIssue } from '@/services/errors/types';
import { getProviderManifest, providerSupports } from '@/services/integrations/registry';
import { FixWorkflowSection } from './FixWorkflow';
import { AiFixDialog } from './AiFixDialog';
import { useSettingsStore } from '@/stores/settingsStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { ModalSurface } from '@/components/ui/ModalSurface';
import { cn } from '@/utils/cn';

const severityColor: Record<NormalizedSeverity, string> = {
  critical: 'text-destructive',
  error: 'text-git-deleted',
  warning: 'text-git-modified',
  info: 'text-muted-foreground',
};

/** 详情头部 tinted 徽标（主题 token，无蓝紫）：严重级别与状态的视觉锚点 */
const severityPill: Record<NormalizedSeverity, string> = {
  critical: 'bg-destructive/15 text-destructive border-destructive/30',
  error: 'bg-git-deleted/15 text-git-deleted border-git-deleted/30',
  warning: 'bg-git-modified/15 text-git-modified border-git-modified/30',
  info: 'bg-muted text-muted-foreground border-border',
};

const statusPill: Record<NormalizedStatus, string> = {
  unresolved: 'bg-git-modified/15 text-git-modified border-git-modified/30',
  resolved: 'bg-git-added/15 text-git-added border-git-added/30',
  ignored: 'bg-muted text-muted-foreground border-border',
};

const issueKeyOf = (issue: UnifiedErrorIssue): string => `${issue.connectionId}:${issue.issueId}`;

function formatRelative(iso: string | undefined, t: (key: string) => string): string {
  if (!iso) return '';
  try {
    const diffSec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diffSec < 60) return t('time.justNow');
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return t('time.minutesAgo').replace('{n}', String(diffMin));
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return t('time.hoursAgo').replace('{n}', String(diffHour));
    const diffDay = Math.floor(diffHour / 24);
    if (diffDay < 30) return t('time.daysAgo').replace('{n}', String(diffDay));
    return new Date(iso).toLocaleDateString(t('time.locale'));
  } catch {
    return iso;
  }
}

const firstLine = (message: string | undefined): string => (message ?? '').split('\n')[0] ?? '';

export const ErrorsView: React.FC = () => {
  const { t } = useI18n();
  const currentRepo = useRepoStore((state) => state.currentRepo);
  const { errorsListWidth, setErrorsListWidth } = useLayoutStore(useShallow((state) => ({ errorsListWidth: state.errorsListWidth, setErrorsListWidth: state.setErrorsListWidth })));
  const {
    connections, issues, scope, setScope, activeRepoKey, mappingsByRepo,
    syncing, lastSyncedAt, syncErrors, nextCursors,
    sync, loadMore, loadRepoContext, addMapping, removeMapping, updateMappingPrefixRules,
  } = useErrorsStore(
    useShallow((state) => ({
      connections: state.connections,
      issues: state.issues,
      scope: state.scope,
      setScope: state.setScope,
      activeRepoKey: state.activeRepoKey,
      mappingsByRepo: state.mappingsByRepo,
      syncing: state.syncing,
      lastSyncedAt: state.lastSyncedAt,
      syncErrors: state.syncErrors,
      nextCursors: state.nextCursors,
      sync: state.sync,
      loadMore: state.loadMore,
      loadRepoContext: state.loadRepoContext,
      addMapping: state.addMapping,
      removeMapping: state.removeMapping,
      updateMappingPrefixRules: state.updateMappingPrefixRules,
    })),
  );

  const [severityFilter, setSeverityFilter] = useState<NormalizedSeverity | 'all'>('all');
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [mapDialogOpen, setMapDialogOpen] = useState(false);
  const [trackedFiles, setTrackedFiles] = useState<string[]>([]);
  const [filePicker, setFilePicker] = useState<{ frame: StackJumpFrame; candidates: string[] } | null>(null);

  const repoPath = currentRepo?.path ?? null;

  // 仓库上下文（repoKey + 该仓映射）；origin 拉取是异步的，取消守卫防串仓
  useEffect(() => {
    if (!repoPath) return;
    let cancelled = false;
    void gitService
      .getOriginUrl(repoPath)
      .catch(() => undefined)
      .then((origin) => {
        if (!cancelled) loadRepoContext(origin ?? null, repoPath);
      });
    return () => {
      cancelled = true;
    };
  }, [repoPath, loadRepoContext]);

  // 工作区跟踪文件清单（堆栈跳转模糊匹配的数据源）
  useEffect(() => {
    if (!repoPath) {
      setTrackedFiles([]);
      return;
    }
    let cancelled = false;
    listTrackedFiles(repoPath)
      .then((files) => {
        if (!cancelled) setTrackedFiles(files);
      })
      .catch(() => {
        if (!cancelled) setTrackedFiles([]);
      });
    return () => {
      cancelled = true;
    };
  }, [repoPath]);

  // 进入页面立即同步一次（轮询由 AppLayout 常驻管理）
  useEffect(() => {
    void sync();
  }, [sync]);

  const enabledConnections = connections.filter((connection) => connection.enabled);
  const failedConnections = enabledConnections.filter((connection) => syncErrors[connection.id]);

  const mappedIds = useMemo(
    () => scopeProjectIds(scope, activeRepoKey, mappingsByRepo, sourceFilter),
    [scope, activeRepoKey, mappingsByRepo, sourceFilter],
  );
  const visibleIssues = useMemo(
    () =>
      filterIssues(issues, {
        scope,
        repoKey: activeRepoKey,
        mappedProjectIds: mappedIds,
        connectionId: sourceFilter,
        severity: severityFilter,
        search,
      }),
    [issues, scope, activeRepoKey, mappedIds, sourceFilter, severityFilter, search],
  );

  const selectedIssue = selectedKey ? issues.find((issue) => issueKeyOf(issue) === selectedKey) ?? null : null;

  // 堆栈跳转（§8.4）：三档置信度在父级统一处理，多候选走文件选择器
  const prefixMapOf = (issue: UnifiedErrorIssue) =>
    activeRepoKey
      ? mappingsByRepo[activeRepoKey]?.find(
          (mapping) =>
            mapping.connectionId === issue.connectionId && mapping.externalProjectId === issue.externalProjectId,
        )?.sourcePathPrefixMap
      : undefined;

  const revealJumpResult = async (result: { kind: 'exact' | 'unique'; path: string; line: number | null }) => {
    if (!repoPath) {
      toast.error(t('errors.detail.jumpMissing'), result.path);
      return;
    }
    const absolute = `${repoPath.replace(/[\\/]+$/, '')}/${result.path}`;
    try {
      const outcome = await revealLocalFile(absolute);
      if (outcome === 'copied') {
        toast.success(t('errors.detail.jumpCopied').replace('{path}', absolute));
        return;
      }
      const lineInfo = result.line != null ? ` ${t('errors.detail.lineInfo').replace('{line}', String(result.line))}` : '';
      toast.success(`${t('errors.detail.jumpOpened')}${lineInfo}`);
    } catch (error) {
      toast.error(t('errors.detail.jumpMissing'), String(error instanceof Error ? error.message : error));
    }
  };

  const jumpToFrame = async (issue: UnifiedErrorIssue, frame: StackJumpFrame) => {
    const result = resolveStackFrame(frame, { prefixMap: prefixMapOf(issue), trackedFiles });
    if (result.kind === 'ambiguous') {
      setFilePicker({ frame, candidates: result.candidates });
      return;
    }
    if (result.kind === 'unresolved') {
      toast.error(t('errors.detail.jumpMissing'), result.framePath || undefined);
      return;
    }
    await revealJumpResult(result);
  };

  const chooseCandidate = async (path: string) => {
    const frame = filePicker?.frame;
    setFilePicker(null);
    if (!frame) return;
    await revealJumpResult({ kind: 'unique', path, line: frame.line ?? null });
  };

  // 双空态（§7.3.3）：无连接 → 去设置；有连接但作用域内无映射 → 映射引导
  const hasConnections = enabledConnections.length > 0;
  const hasMappedProjects = mappedIds.size > 0;
  const openSettings = () => window.dispatchEvent(new CustomEvent('auugit:open-settings', { detail: 'integrations' }));

  const projectLabelOf = (issue: UnifiedErrorIssue): string => {
    for (const bucket of Object.values(mappingsByRepo)) {
      const mapping = bucket.find(
        (item) => item.connectionId === issue.connectionId && item.externalProjectId === issue.externalProjectId,
      );
      if (mapping) return mapping.externalProjectName;
    }
    return issue.externalProjectId;
  };

  return (
    <div className="flex h-full min-h-0">
      {/* 左：列表窗格（宽度可拖拽，layoutStore 持久化） */}
      <div style={{ width: errorsListWidth }} className="shrink-0 border-r border-border flex flex-col min-h-0">
        <div className="app-toolbar justify-between">
          <div className="app-toolbar-group">
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as ErrorsScope)}
              aria-label={t('errors.scope.repo')}
              className="h-7 rounded-md border border-input bg-transparent px-1.5 text-xs"
            >
              <option value="repo" className="bg-popover text-foreground">{t('errors.scope.repo')}</option>
              <option value="all" className="bg-popover text-foreground">{t('errors.scope.all')}</option>
            </select>
            <select
              value={sourceFilter ?? ''}
              onChange={(e) => setSourceFilter(e.target.value || null)}
              aria-label={t('errors.filter.source.all')}
              className="h-7 max-w-36 rounded-md border border-input bg-transparent px-1.5 text-xs"
            >
              <option value="" className="bg-popover text-foreground">{t('errors.filter.source.all')}</option>
              {connections.map((connection) => (
                <option key={connection.id} value={connection.id} className="bg-popover text-foreground">
                  {connection.displayName}
                </option>
              ))}
            </select>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value as NormalizedSeverity | 'all')}
              aria-label={t('errors.filter.severity.all')}
              className="h-7 rounded-md border border-input bg-transparent px-1.5 text-xs"
            >
              <option value="all" className="bg-popover text-foreground">{t('errors.filter.severity.all')}</option>
              {(['critical', 'error', 'warning', 'info'] as const).map((level) => (
                <option key={level} value={level} className="bg-popover text-foreground">{t(`errors.severity.${level}`)}</option>
              ))}
            </select>
          </div>
          <div className="app-toolbar-group">
            <Button variant="ghost" size="icon-sm" aria-label={t('errors.refresh')} disabled={syncing} onClick={() => void sync()}>
              <RefreshCw className={cn('h-3.5 w-3.5', syncing && 'animate-spin')} />
            </Button>
          </div>
        </div>
        {/* 搜索行：占满全宽（§7.2 工具栏） */}
        <div className="app-toolbar">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`${t('errors.search.placeholder')}…`}
            aria-label={t('errors.search.placeholder')}
            autoComplete="off"
            className="h-7 w-full rounded-md border border-input bg-transparent px-2 text-xs placeholder:text-muted-foreground"
          />
        </div>

        {/* 降级横幅：按连接粒度，不拖死整页（§7.3.2） */}
        {failedConnections.map((connection) => (
          <div key={connection.id} role="alert" className="mx-2 mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-[12px] flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
            <span className="min-w-0 flex-1 truncate text-foreground">
              {t('errors.banner.sourceFailed').replace('{name}', connection.displayName)}
            </span>
            <Button variant="ghost" size="xs" onClick={() => void sync()}>{t('errors.banner.retry')}</Button>
            <Button variant="ghost" size="xs" onClick={openSettings}>{t('errors.banner.settings')}</Button>
          </div>
        ))}

        <div className="flex-1 overflow-y-auto min-h-0">
          {!hasConnections ? (
            <div className="p-6">
              <EmptyState
                title={t('errors.empty.noConnection.title')}
                desc={t('errors.empty.noConnection.desc')}
                className="pointer-events-none"
              />
              <div className="flex justify-center">
                <Button variant="outline" size="xs" className="gap-1" onClick={openSettings}>
                  <Settings className="h-3 w-3" />
                  <span>{t('errors.empty.noConnection.action')}</span>
                </Button>
              </div>
            </div>
          ) : !hasMappedProjects ? (
            <div className="p-6">
              <EmptyState
                title={t('errors.empty.noMapping.title')}
                desc={t('errors.empty.noMapping.desc')}
                className="pointer-events-none"
              />
              <div className="flex justify-center">
                <Button variant="outline" size="xs" className="gap-1" onClick={() => setMapDialogOpen(true)}>
                  <Bug className="h-3 w-3" />
                  <span>{t('errors.empty.noMapping.action')}</span>
                </Button>
              </div>
            </div>
          ) : visibleIssues.length === 0 ? (
            <p className="p-4 text-center text-[12px] text-muted-foreground">{t('errors.list.emptyFiltered')}</p>
          ) : (
            <div className="py-1">
              {visibleIssues.map((issue) => {
                const key = issueKeyOf(issue);
                const connection = connections.find((item) => item.id === issue.connectionId);
                const selected = key === selectedKey;
                return (
                  <div
                    key={key}
                    className={cn(
                      'group flex items-stretch border-l-2 transition-colors',
                      selected ? 'bg-primary/10 border-l-primary' : 'border-l-transparent hover:bg-accent/40',
                    )}
                  >
                    {/* 行主体：独立 button（外链是兄弟节点，避免 button 嵌套 button） */}
                    <button
                      onClick={() => setSelectedKey(key)}
                      title={issue.title}
                      className="min-w-0 flex-1 text-left px-3 py-2"
                    >
                      <div className="flex items-start gap-2">
                        <span aria-hidden="true" className={cn('mt-1 shrink-0 text-[10px] leading-none', severityColor[issue.severity])}>●</span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-medium text-foreground">
                            {issue.shortId ? <span className="text-muted-foreground">{issue.shortId} </span> : null}
                            {issue.title}
                          </div>
                          <div className="truncate text-[12px] text-muted-foreground">
                            {connection?.displayName ?? getProviderManifest(issue.providerId)?.name ?? issue.providerId} · {projectLabelOf(issue)}
                          </div>
                          <div className="text-[12px] text-muted-foreground tabular-nums">
                            {issue.eventCount != null ? t('errors.row.events').replace('{count}', String(issue.eventCount)) : ''}
                            {issue.affectedUsers != null ? ` · ${t('errors.row.users').replace('{count}', String(issue.affectedUsers))}` : ''}
                            {issue.lastSeen ? ` · ${formatRelative(issue.lastSeen, t)}` : ''}
                          </div>
                        </div>
                      </div>
                    </button>
                    <div className="flex items-start pr-2 pt-2">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="shrink-0"
                        aria-label={t('errors.row.openExternal')}
                        disabled={!issue.externalUrl}
                        onClick={() => void openExternalUrl(issue.externalUrl)}
                      >
                        <SquareArrowOutUpRight className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
              <div className="px-3 py-2 space-y-1">
                {Object.values(nextCursors).some(Boolean) && (
                  <Button variant="outline" size="xs" className="w-full" disabled={syncing} onClick={() => void loadMore()}>
                    {t('errors.loadMore')}
                  </Button>
                )}
                {visibleIssues.length > 0 && Object.values(nextCursors).some(Boolean) && (
                  <p className="text-center text-[11px] text-muted-foreground">
                    {t('errors.list.loadedNote').replace('{count}', String(visibleIssues.length))}
                  </p>
                )}
                {syncing ? (
                  <p className="text-center text-[11px] text-muted-foreground">{t('errors.syncing')}</p>
                ) : lastSyncedAt ? (
                  <p className="text-center text-[11px] text-muted-foreground">
                    {t('errors.list.lastSynced').replace('{time}', formatRelative(new Date(lastSyncedAt).toISOString(), t))}
                  </p>
                ) : null}
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-border p-2">
          <Button variant="ghost" size="xs" className="gap-1" onClick={() => setMapDialogOpen(true)}>
            <Bug className="h-3 w-3" />
            <span>{t('errors.mapping.manage')}</span>
          </Button>
        </div>
      </div>

      <ResizeHandle
        currentSize={errorsListWidth}
        onSizeChange={setErrorsListWidth}
        minSize={280}
        maxSize={640}
        defaultSize={DEFAULT_LAYOUT.errorsListWidth}
        title={t('errors.resizeHint')}
      />

      {/* 右：详情窗格 */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        {selectedIssue ? (
          <ErrorDetail
            issue={selectedIssue}
            onJump={(frame) => void jumpToFrame(selectedIssue, frame)}
            repoPath={repoPath}
            trackedFiles={trackedFiles}
            prefixMap={prefixMapOf(selectedIssue)}
          />
        ) : (
          <div className="h-full flex items-center justify-center">
            <p className="text-[12px] text-muted-foreground">{t('errors.detail.select')}</p>
          </div>
        )}
      </div>

      <AmbiguousFilePicker
        state={filePicker ? { framePath: filePicker.frame.file, candidates: filePicker.candidates } : null}
        onChoose={(path) => void chooseCandidate(path)}
        onDismiss={() => setFilePicker(null)}
      />

      {mapDialogOpen && (
        <MapProjectDialog
          connections={enabledConnections}
          mappings={activeRepoKey ? mappingsByRepo[activeRepoKey] ?? [] : []}
          onMap={(connectionId, project) => addMapping(connectionId, project)}
          onUnmap={(connectionId, externalProjectId) => removeMapping(connectionId, externalProjectId)}
          onRulesChange={(connectionId, externalProjectId, rules) => updateMappingPrefixRules(connectionId, externalProjectId, rules)}
          onDismiss={() => setMapDialogOpen(false)}
        />
      )}
    </div>
  );
};

// —— 详情子组件：数据加载与展示；跳转决策由父级统一处理 ——
interface DetailLoad {
  loading: boolean;
  error: string;
  suspects: CommitRef[];
  frames: UnifiedErrorIssue['stacktrace'];
}

const ErrorDetail: React.FC<{
  issue: UnifiedErrorIssue;
  onJump: (frame: StackJumpFrame) => void;
  repoPath: string | null;
  trackedFiles: string[];
  prefixMap?: readonly { from: string; to: string }[];
}> = ({ issue, onJump, repoPath, trackedFiles, prefixMap }) => {
  const { t } = useI18n();
  const aiConfig = useSettingsStore((state) => state.aiConfig);
  const aiConfigured = aiConfig.provider === 'openai-compatible' && !!aiConfig.apiKey.trim();
  const [aiFixOpen, setAiFixOpen] = useState(false);
  const [load, setLoad] = useState<DetailLoad>({ loading: false, error: '', suspects: [], frames: undefined });
  const [showRaw, setShowRaw] = useState(false);
  const [statusBusy, setStatusBusy] = useState<string | null>(null);

  // 状态回写（§8.3）：按 capability 渲染操作项
  const manifest = getProviderManifest(issue.providerId);
  const canResolve = Boolean(manifest && providerSupports(manifest, 'error-tracking:resolve'));
  const canResolveInRelease = Boolean(manifest && providerSupports(manifest, 'error-tracking:resolve-in-release'));
  const canIgnore = Boolean(manifest && providerSupports(manifest, 'error-tracking:ignore'));

  const runStatusAction = async (action: 'resolve' | 'resolveInNextRelease' | 'ignore' | 'unresolve', key: string) => {
    if (statusBusy) return;
    setStatusBusy(key);
    try {
      await useErrorsStore.getState().updateIssueStatus(issue.connectionId, issue.issueId, action);
      toast.success(t('errors.fix.statusUpdated'));
    } catch (error) {
      // 操作级错误：toast 提示，不改连接健康态、不触发降级横幅（§8.3）
      toast.error(t('errors.fix.statusFailed'), String(error instanceof Error ? error.message : error));
    } finally {
      setStatusBusy(null);
    }
  };

  useEffect(() => {
    let cancelled = false;
    setLoad({ loading: true, error: '', suspects: [], frames: undefined });
    void (async () => {
      try {
        const token = await getIntegrationToken(issue.connectionId);
        if (!token) throw new Error('credential missing');
        const connection = useErrorsStore.getState().connections.find((item) => item.id === issue.connectionId);
        const client = createProviderClient(issue.providerId, { token, baseUrl: connection?.baseUrl });
        const [frames, suspects] = await Promise.all([
          client.getLatestEventStacktrace(issue.issueId).catch(() => []),
          client.listSuspectCommits(issue.issueId).catch(() => []),
        ]);
        if (!cancelled) setLoad({ loading: false, error: '', suspects, frames });
      } catch (error) {
        if (!cancelled) setLoad({ loading: false, error: String(error instanceof Error ? error.message : error), suspects: [], frames: undefined });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [issue.connectionId, issue.issueId, issue.providerId]);

  const metaItems: { label: string; value: string }[] = [
    { label: t('errors.detail.firstSeen'), value: issue.firstSeen ? formatRelative(issue.firstSeen, t) : '' },
    { label: t('errors.detail.lastSeen'), value: issue.lastSeen ? formatRelative(issue.lastSeen, t) : '' },
    { label: t('errors.detail.environment'), value: issue.environment ?? '' },
    { label: t('errors.detail.release'), value: issue.release ?? '' },
  ].filter((item) => item.value);

  return (
    <div className="p-4 space-y-5 text-xs" data-testid="errors-detail">
      {/* 头部区：tinted 徽标 + 标题 + 主 CTA——详情页的视觉锚点 */}
      <div className="pb-4 border-b border-border">
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className={cn('h-5 px-1.5 text-[11px] font-medium', severityPill[issue.severity])}>
            {t(`errors.severity.${issue.severity}`)}
          </Badge>
          <Badge variant="outline" className={cn('h-5 px-1.5 text-[11px] font-medium', statusPill[issue.status])}>
            {t(`errors.status.${issue.status}`)}
          </Badge>
          {issue.rawStatus && <span className="text-[11px] text-muted-foreground font-mono">{issue.rawStatus}</span>}
        </div>
        <h2 className="mt-2 text-base font-semibold text-foreground break-words select-text">{issue.title}</h2>
        {issue.message && <p className="mt-1 text-[12px] text-muted-foreground font-mono break-words select-text">{issue.message}</p>}
        <div className="mt-2 flex items-center gap-3 text-[12px] text-muted-foreground">
          <span className="font-mono">{issue.shortId}</span>
          {issue.externalUrl && (
            <button
              className="inline-flex items-center gap-1 text-primary hover:underline"
              onClick={() => void openExternalUrl(issue.externalUrl)}
            >
              {t('errors.row.openExternal')}
              <ExternalLink className="h-3 w-3" />
            </button>
          )}
        </div>
        {(canResolve || canIgnore || (aiConfigured && repoPath)) && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {issue.status === 'unresolved' ? (
              <>
                {canResolve && (
                  <Button variant="default" size="xs" disabled={!!statusBusy} onClick={() => void runStatusAction('resolve', 'resolve')}>
                    {t('errors.fix.resolve')}
                  </Button>
                )}
                {canResolveInRelease && (
                  <Button variant="ghost" size="xs" disabled={!!statusBusy} onClick={() => void runStatusAction('resolveInNextRelease', 'release')}>
                    {t('errors.fix.resolveInRelease')}
                  </Button>
                )}
                {canIgnore && (
                  <Button variant="ghost" size="xs" disabled={!!statusBusy} onClick={() => void runStatusAction('ignore', 'ignore')}>
                    {t('errors.fix.ignore')}
                  </Button>
                )}
              </>
            ) : (
              canResolve && (
                <Button variant="default" size="xs" disabled={!!statusBusy} onClick={() => void runStatusAction('unresolve', 'reopen')}>
                  {t('errors.fix.reopen')}
                </Button>
              )
            )}
            {/* AI 修复（§8.5）：无 apiKey / builtin 供给时不渲染（验收项）；堆栈未加载完前禁用 */}
            {aiConfigured && repoPath && (
              <Button variant="outline" size="xs" className="gap-1" disabled={load.loading} onClick={() => setAiFixOpen(true)}>
                <Sparkles className="h-3 w-3" />
                <span>{t('errors.ai.button')}</span>
              </Button>
            )}
          </div>
        )}
      </div>

      {aiFixOpen && repoPath && (
        <AiFixDialog
          open
          issue={issue}
          frames={(load.frames ?? []).map((frame) => ({ file: frame.file, line: frame.line }))}
          repoPath={repoPath}
          trackedFiles={trackedFiles}
          prefixMap={prefixMap}
          onDismiss={() => setAiFixOpen(false)}
        />
      )}

      {/* 元信息条：单容器分格（含次数/用户），消灭漂浮卡片与死空间 */}
      {(metaItems.length > 0 || issue.eventCount != null || issue.affectedUsers != null) && (
        <div className="grid grid-cols-2 lg:grid-cols-4 rounded-lg border border-border divide-x divide-border overflow-hidden">
          {issue.eventCount != null && (
            <div className="px-3 py-2">
              <div className="text-[11px] text-muted-foreground">{t('errors.detail.events')}</div>
              <div className="text-[12px] text-foreground tabular-nums">{issue.eventCount.toLocaleString(t('time.locale'))}</div>
            </div>
          )}
          {issue.affectedUsers != null && (
            <div className="px-3 py-2">
              <div className="text-[11px] text-muted-foreground">{t('errors.detail.users')}</div>
              <div className="text-[12px] text-foreground tabular-nums">{issue.affectedUsers.toLocaleString(t('time.locale'))}</div>
            </div>
          )}
          {metaItems.map((item) => (
            <div key={item.label} className="px-3 py-2 min-w-0">
              <div className="text-[11px] text-muted-foreground">{item.label}</div>
              <div className="truncate text-[12px] text-foreground tabular-nums" title={item.value}>{item.value}</div>
            </div>
          ))}
        </div>
      )}

      <FixWorkflowSection issue={issue} />

      {load.suspects.length > 0 && (
        <section className="space-y-1.5">
          <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('errors.detail.suspectCommit')}</h3>
          {load.suspects.map((commit) => (
            <div key={commit.sha} className="rounded-md border border-border px-2 py-1.5 font-mono text-[12px] hover:bg-accent/30 transition-colors">
              <div className="truncate text-foreground select-text">{commit.sha.slice(0, 10)} {firstLine(commit.message)}</div>
              <div className="truncate text-[11px] text-muted-foreground">
                {[commit.author, commit.repository].filter(Boolean).join(' · ')}
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="space-y-1.5">
        <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('errors.detail.stacktrace')}</h3>
        {load.loading && (
          <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            {t('errors.detail.loading')}
          </p>
        )}
        {load.error && <p role="alert" className="text-[12px] text-destructive select-text">{t('errors.detail.loadFailed')}: {load.error}</p>}
        {!load.loading && !load.error && (load.frames?.length ?? 0) === 0 && (
          <p className="text-[12px] text-muted-foreground">{t('errors.detail.stackEmpty')}</p>
        )}
        {(load.frames ?? []).map((frame, index) => (
          <div key={`${index}-${frame.file}-${frame.line ?? ''}`} className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 hover:bg-accent/30 transition-colors">
            <div className="min-w-0 flex-1 font-mono text-[12px]">
              <div className="truncate text-foreground select-text">{frame.func ?? ''}</div>
              <div className="truncate text-[11px] text-muted-foreground select-text">
                {frame.file}{frame.line != null ? `:${frame.line}` : ''}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon-xs"
              className="shrink-0"
              aria-label={`${t('errors.detail.jump')}: ${frame.file}:${frame.line ?? ''}`}
              title={t('errors.detail.jump')}
              onClick={() => onJump(frame)}
            >
              <SquareArrowOutUpRight className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </section>

      {issue.rawData != null && (
        <section>
          <button
            className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setShowRaw((value) => !value)}
          >
            {showRaw ? '▾' : '▸'} {t('errors.detail.rawData')}
          </button>
          {showRaw && (
            /* 不自限高度/滚动：随详情窗格唯一一条滚动流式展开，避免嵌套双滚动条 */
            <pre className="mt-1 rounded-md border border-border p-2 text-[11px] font-mono whitespace-pre-wrap break-words select-text">
              {JSON.stringify(issue.rawData, null, 2)}
            </pre>
          )}
        </section>
      )}
    </div>
  );
};

const MapProjectDialog: React.FC<{
  connections: PersistedConnectionView[];
  mappings: { connectionId: string; externalProjectId: string; externalProjectName: string; sourcePathPrefixMap?: { from: string; to: string }[] }[];
  onMap: (connectionId: string, project: Pick<ExternalProject, 'id' | 'name'>) => void;
  onUnmap: (connectionId: string, externalProjectId: string) => void;
  onRulesChange: (connectionId: string, externalProjectId: string, rules: { from: string; to: string }[]) => void;
  onDismiss: () => void;
}> = ({ connections, mappings, onMap, onUnmap, onRulesChange, onDismiss }) => {
  const { t } = useI18n();
  const [connectionId, setConnectionId] = useState(connections[0]?.id ?? '');
  const [projects, setProjects] = useState<ExternalProject[] | null>(null);
  const [error, setError] = useState('');
  // 堆栈路径前缀规则草稿（§8.4 一档）：每次编辑即持久化（空 from/to 的行不入库）
  const [rules, setRules] = useState<Record<string, { from: string; to: string }[]>>(() => {
    const initial: Record<string, { from: string; to: string }[]> = {};
    for (const mapping of mappings) {
      initial[`${mapping.connectionId}:${mapping.externalProjectId}`] = (mapping.sourcePathPrefixMap ?? []).map((rule) => ({ ...rule }));
    }
    return initial;
  });

  const rulesKeyOf = (id: string, projectId: string): string => `${id}:${projectId}`;
  const commitRules = (id: string, projectId: string, next: { from: string; to: string }[]) => {
    setRules((previous) => ({ ...previous, [rulesKeyOf(id, projectId)]: next }));
    onRulesChange(id, projectId, next.filter((rule) => rule.from.trim() && rule.to.trim()).map((rule) => ({ from: rule.from.trim(), to: rule.to.trim() })));
  };

  useEffect(() => {
    if (!connectionId) return;
    let cancelled = false;
    setProjects(null);
    setError('');
    void (async () => {
      try {
        const connection = useErrorsStore.getState().connections.find((item) => item.id === connectionId);
        const token = await getIntegrationToken(connectionId);
        if (!token || !connection?.orgId) throw new Error('credential missing');
        const client = createProviderClient(connection.providerId, { token, baseUrl: connection.baseUrl });
        const list = await client.listProjects(connection.orgId);
        if (!cancelled) setProjects(list);
      } catch (cause) {
        if (!cancelled) setError(String(cause instanceof Error ? cause.message : cause));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connectionId]);

  const mappedForConnection = (externalProjectId: string): boolean =>
    mappings.some((mapping) => mapping.connectionId === connectionId && mapping.externalProjectId === externalProjectId);

  return (
    <ModalSurface
      label={t('errors.mapping.title')}
      onDismiss={onDismiss}
      className="fixed inset-0 z-50 bg-background/80 backdrop-blur-xs flex items-center justify-center animate-in fade-in-0"
    >
      <div
        className="w-[420px] max-h-[70vh] rounded-xl border border-border bg-card shadow-2xl flex flex-col animate-in zoom-in-95"
        onClick={(event) => event.stopPropagation()}
        data-testid="errors-mapping-dialog"
      >
        <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
          <span className="text-xs font-semibold">{t('errors.mapping.title')}</span>
        </div>
        <div className="p-4 space-y-2 overflow-y-auto">
          <p className="text-[12px] text-muted-foreground">{t('errors.mapping.desc')}</p>
          <select
            value={connectionId}
            onChange={(event) => setConnectionId(event.target.value)}
            aria-label={t('errors.filter.source.all')}
            className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs"
          >
            {connections.map((connection) => (
              <option key={connection.id} value={connection.id} className="bg-popover text-foreground">{connection.displayName}</option>
            ))}
          </select>
          {error && <p role="alert" className="text-[12px] text-destructive select-text">{t('errors.mapping.loadFailed')}: {error}</p>}
          {projects && projects.length === 0 && <p className="text-[12px] text-muted-foreground">{t('errors.mapping.empty')}</p>}
          <div className="space-y-1">
            {(projects ?? []).map((project) => {
              const mapped = mappedForConnection(project.id);
              const key = rulesKeyOf(connectionId, project.id);
              const projectRules = rules[key] ?? [];
              return (
                <div key={project.id} className="rounded-md border border-border px-2 py-1.5">
                  <label className="flex items-center gap-2 cursor-pointer hover:bg-accent/40">
                    <input
                      type="checkbox"
                      checked={mapped}
                      onChange={() => (mapped ? onUnmap(connectionId, project.id) : onMap(connectionId, project))}
                      aria-label={project.name}
                    />
                    <span className="min-w-0 flex-1 truncate text-xs">{project.name}</span>
                    <span className="text-[11px] text-muted-foreground font-mono">{project.slug}</span>
                  </label>
                  {mapped && (
                    <div className="ml-5 mt-1 space-y-1 border-l border-border pl-2">
                      <div className="text-[11px] text-muted-foreground">{t('errors.mapping.pathRules')}</div>
                      {projectRules.map((rule, index) => (
                        <div key={index} className="flex items-center gap-1">
                          <input
                            value={rule.from}
                            placeholder={t('errors.mapping.ruleFrom')}
                            aria-label={`${t('errors.mapping.ruleFrom')} ${index + 1}`}
                            className="h-6 min-w-0 flex-1 rounded border border-input bg-transparent px-1.5 font-mono text-[11px]"
                            onChange={(event) => {
                              const next = projectRules.map((item, i) => (i === index ? { ...item, from: event.target.value } : item));
                              commitRules(connectionId, project.id, next);
                            }}
                          />
                          <span className="shrink-0 text-muted-foreground">→</span>
                          <input
                            value={rule.to}
                            placeholder={t('errors.mapping.ruleTo')}
                            aria-label={`${t('errors.mapping.ruleTo')} ${index + 1}`}
                            className="h-6 min-w-0 flex-1 rounded border border-input bg-transparent px-1.5 font-mono text-[11px]"
                            onChange={(event) => {
                              const next = projectRules.map((item, i) => (i === index ? { ...item, to: event.target.value } : item));
                              commitRules(connectionId, project.id, next);
                            }}
                          />
                          <button
                            aria-label={t('errors.mapping.removeRule')}
                            className="h-6 w-6 shrink-0 rounded text-muted-foreground hover:text-destructive hover:bg-accent"
                            onClick={() => commitRules(connectionId, project.id, projectRules.filter((_, i) => i !== index))}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                      <button
                        className="text-[11px] text-primary hover:underline"
                        onClick={() => commitRules(connectionId, project.id, [...projectRules, { from: '', to: '' }])}
                      >
                        + {t('errors.mapping.addRule')}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground">{t('errors.mapping.mappedCount').replace('{count}', String(mappings.length))}</p>
        </div>
        <div className="px-4 py-2.5 border-t border-border flex justify-end">
          <Button variant="outline" size="xs" onClick={onDismiss}>{t('common.close')}</Button>
        </div>
      </div>
    </ModalSurface>
  );
};

type PersistedConnectionView = {
  id: string;
  displayName: string;
  orgId?: string;
};

// —— 多候选文件选择器（§8.4 第 2 档）：挂载在 ErrorsView 根部 ——
export const AmbiguousFilePicker: React.FC<{
  state: { framePath: string; candidates: string[] } | null;
  onChoose: (path: string) => void;
  onDismiss: () => void;
}> = ({ state, onChoose, onDismiss }) => {
  const { t } = useI18n();
  if (!state) return null;
  return (
    <ModalSurface
      label={t('errors.filePicker.title')}
      onDismiss={onDismiss}
      className="fixed inset-0 z-50 bg-background/80 backdrop-blur-xs flex items-center justify-center animate-in fade-in-0"
    >
      <div
        className="w-[440px] max-h-[60vh] rounded-xl border border-border bg-card shadow-2xl flex flex-col animate-in zoom-in-95"
        onClick={(event) => event.stopPropagation()}
        data-testid="errors-file-picker"
      >
        <div className="px-4 py-2.5 border-b border-border text-xs font-semibold">{t('errors.filePicker.title')}</div>
        <div className="p-4 space-y-2 overflow-y-auto">
          <p className="text-[12px] text-muted-foreground">
            {t('errors.filePicker.framePath')}: <span className="font-mono select-text">{state.framePath}</span>
          </p>
          {state.candidates.map((candidate) => (
            <button
              key={candidate}
              className="w-full text-left rounded-md border border-border px-2 py-1.5 font-mono text-[12px] hover:bg-accent/40 truncate"
              onClick={() => onChoose(candidate)}
            >
              {candidate}
            </button>
          ))}
        </div>
      </div>
    </ModalSurface>
  );
};
