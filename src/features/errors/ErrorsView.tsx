/**
 * Errors 页（PRD §7.2/§7.3，M3）：合并列表 + 详情。
 * - 作用域（本仓库/全部，决定徽标口径）、来源筛选、severity 筛选、搜索、手动刷新、加载更多；
 * - 按连接降级横幅（失败的连接保留旧数据）；双空态（无连接 / 无映射）；
 * - 详情：元信息、嫌疑提交、堆栈帧三档跳转（§8.4）、rawData 折叠区。
 * 平台返回的异常内容保持原文（§7.5），本视图文案全部走 t()。
 */
import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Bug, ExternalLink, Loader2, RefreshCw, Settings, SquareArrowOutUpRight } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useErrorsStore } from '@/stores/errorsStore';
import { useRepoStore } from '@/stores/repoStore';
import { useI18n } from '@/i18n';
import { toast } from '@/stores/toastStore';
import { gitService } from '@/services/git/GitService';
import { createProviderClient, type ExternalProject } from '@/services/errors/providerService';
import { getIntegrationToken } from '@/services/errors/credentials';
import { filterIssues, scopeProjectIds, type ErrorsScope } from '@/services/errors/issueQuery';
import { listTrackedFiles, resolveStackFrame, revealLocalFile, type StackJumpFrame } from '@/services/errors/stackNavigation';
import type { CommitRef, NormalizedSeverity, UnifiedErrorIssue } from '@/services/errors/types';
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
  const {
    connections, issues, scope, setScope, activeRepoKey, mappingsByRepo,
    syncing, lastSyncedAt, syncErrors, nextCursors,
    sync, loadMore, loadRepoContext, addMapping, removeMapping,
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
      {/* 左：列表窗格 */}
      <div className="w-[400px] shrink-0 border-r border-border flex flex-col min-h-0">
        <div className="app-toolbar">
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
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('errors.search.placeholder')}
              aria-label={t('errors.search.placeholder')}
              className="h-7 w-32 rounded-md border border-input bg-transparent px-2 text-xs placeholder:text-muted-foreground"
            />
            <Button variant="ghost" size="icon-sm" aria-label={t('errors.refresh')} disabled={syncing} onClick={() => void sync()}>
              <RefreshCw className={cn('h-3.5 w-3.5', syncing && 'animate-spin')} />
            </Button>
          </div>
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
                  <button
                    key={key}
                    onClick={() => setSelectedKey(key)}
                    className={cn(
                      'w-full text-left px-3 py-2 border-l-2 transition-colors',
                      selected ? 'bg-primary/10 border-l-primary' : 'border-l-transparent hover:bg-accent/40',
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <span className={cn('mt-1 shrink-0 text-[10px] leading-none', severityColor[issue.severity])}>●</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium text-foreground">
                          {issue.shortId ? <span className="text-muted-foreground">{issue.shortId} </span> : null}
                          {issue.title}
                        </div>
                        <div className="truncate text-[12px] text-muted-foreground">
                          Sentry · {connection?.displayName ?? issue.connectionId} · {projectLabelOf(issue)}
                        </div>
                        <div className="text-[12px] text-muted-foreground tabular-nums">
                          {issue.eventCount != null ? t('errors.row.events').replace('{count}', String(issue.eventCount)) : ''}
                          {issue.affectedUsers != null ? ` · ${t('errors.row.users').replace('{count}', String(issue.affectedUsers))}` : ''}
                          {issue.lastSeen ? ` · ${formatRelative(issue.lastSeen, t)}` : ''}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="shrink-0"
                        aria-label={t('errors.row.openExternal')}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (issue.externalUrl) window.open(issue.externalUrl, '_blank', 'noopener');
                        }}
                      >
                        <SquareArrowOutUpRight className="h-3 w-3" />
                      </Button>
                    </div>
                  </button>
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

      {/* 右：详情窗格 */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        {selectedIssue ? (
          <ErrorDetail issue={selectedIssue} onJump={(frame) => void jumpToFrame(selectedIssue, frame)} />
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
}> = ({ issue, onJump }) => {
  const { t } = useI18n();
  const [load, setLoad] = useState<DetailLoad>({ loading: false, error: '', suspects: [], frames: undefined });
  const [showRaw, setShowRaw] = useState(false);

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
    <div className="p-4 space-y-4 text-xs" data-testid="errors-detail">
      <div>
        <div className="flex items-center gap-2">
          <span className={cn('text-[10px] leading-none', severityColor[issue.severity])}>●</span>
          <Badge variant="outline" className="h-4 px-1 text-[10px]">{t(`errors.severity.${issue.severity}`)}</Badge>
          {issue.rawStatus && <Badge variant="outline" className="h-4 px-1 text-[10px] text-muted-foreground">{issue.rawStatus}</Badge>}
        </div>
        <h2 className="mt-1.5 text-sm font-semibold text-foreground break-words select-text">{issue.title}</h2>
        {issue.message && <p className="mt-1 text-[12px] text-muted-foreground font-mono break-words select-text">{issue.message}</p>}
        <div className="mt-1.5 flex items-center gap-2 text-[12px] text-muted-foreground">
          <span>{issue.shortId}</span>
          {issue.externalUrl && (
            <a href={issue.externalUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
              {t('errors.row.openExternal')}
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>

      {metaItems.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {metaItems.map((item) => (
            <div key={item.label} className="rounded-md border border-border px-2 py-1.5">
              <div className="text-[11px] text-muted-foreground">{item.label}</div>
              <div className="truncate text-[12px] text-foreground" title={item.value}>{item.value}</div>
            </div>
          ))}
        </div>
      )}

      {issue.eventCount != null && (
        <div className="text-[12px] text-muted-foreground tabular-nums">
          {t('errors.row.events').replace('{count}', String(issue.eventCount))}
          {issue.affectedUsers != null ? ` · ${t('errors.row.users').replace('{count}', String(issue.affectedUsers))}` : ''}
        </div>
      )}

      {load.suspects.length > 0 && (
        <section className="space-y-1">
          <h3 className="text-[12px] font-medium">{t('errors.detail.suspectCommit')}</h3>
          {load.suspects.map((commit) => (
            <div key={commit.sha} className="rounded-md border border-border px-2 py-1.5 font-mono text-[12px]">
              <div className="truncate text-foreground select-text">{commit.sha.slice(0, 10)} {firstLine(commit.message)}</div>
              <div className="truncate text-[11px] text-muted-foreground">
                {[commit.author, commit.repository].filter(Boolean).join(' · ')}
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="space-y-1">
        <h3 className="text-[12px] font-medium">{t('errors.detail.stacktrace')}</h3>
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
          <div key={`${index}-${frame.file}-${frame.line ?? ''}`} className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
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
          <button className="text-[12px] font-medium text-muted-foreground hover:text-foreground" onClick={() => setShowRaw((value) => !value)}>
            {showRaw ? '▾' : '▸'} {t('errors.detail.rawData')}
          </button>
          {showRaw && (
            <pre className="mt-1 max-h-64 overflow-auto rounded-md border border-border p-2 text-[11px] font-mono whitespace-pre-wrap select-text">
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
  mappings: { connectionId: string; externalProjectId: string; externalProjectName: string }[];
  onMap: (connectionId: string, project: Pick<ExternalProject, 'id' | 'name'>) => void;
  onUnmap: (connectionId: string, externalProjectId: string) => void;
  onDismiss: () => void;
}> = ({ connections, mappings, onMap, onUnmap, onDismiss }) => {
  const { t } = useI18n();
  const [connectionId, setConnectionId] = useState(connections[0]?.id ?? '');
  const [projects, setProjects] = useState<ExternalProject[] | null>(null);
  const [error, setError] = useState('');

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
              return (
                <label key={project.id} className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 cursor-pointer hover:bg-accent/40">
                  <input
                    type="checkbox"
                    checked={mapped}
                    onChange={() => (mapped ? onUnmap(connectionId, project.id) : onMap(connectionId, project))}
                    aria-label={project.name}
                  />
                  <span className="min-w-0 flex-1 truncate text-xs">{project.name}</span>
                  <span className="text-[11px] text-muted-foreground font-mono">{project.slug}</span>
                </label>
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
