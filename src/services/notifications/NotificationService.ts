/**
 * T4 系统通知：应用在后台（窗口失焦/最小化，document.hidden）时，被监听的 CI 检查
 * 从运行中走向终态（success / failure）即弹系统通知（tauri-plugin-notification）。
 *
 * 信号来源（githubStore 对外只读，这里仅做外部 zustand subscribe，不改它）：
 * - store 的 CI watch 状态字段是 `commitChecks: Record<sha, GitHubCheckRun[]>`
 *   （watchPushChecks 轮询与 RightPane 选中提交等路径都会写入该字段）。
 * - 「watch 会话完成」的判定：同一 sha 的检查数组出现
 *   「存在未完成项（queued / in_progress）→ 全部 completed」的迁移，
 *   结论按 conclusion 归类：全部 success 即成功，否则失败。
 * - 每个会话只通知一次：按「head sha + 完成状态」去重（Set），无论当时窗口是否可见。
 * - 只有 document.hidden === true 时才弹通知（前台时应用内 toast 已足够）。
 * - 节流：30 秒内同仓库同结论的通知合并（内存时间戳），避免批量提交推送时轰炸。
 *
 * 全部副作用经由可注入的 deps（假 plugin API / 假 store 可替换），通知失败与
 * 权限拒绝都静默降级，绝不影响 store 监听器（它运行在 zustand setState 内）。
 */
import { useGitHubStore } from '@/stores/githubStore';
import { tNow } from '@/i18n';
import type { GitHubCheckRun } from '@/services/github/types';

/** 同仓库同结论通知的最小间隔（毫秒）。 */
const THROTTLE_MS = 30_000;
/** 去重集合上限：超出后丢弃最早的一半，防止长会话无界增长。 */
const DEDUP_LIMIT = 256;
/** 失败清单最多列出的检查名数量。 */
const MAX_FAILED_NAMES = 3;

/** 注入面：与 @tauri-apps/plugin-notification 的实际调用面同构（便于测试替换）。 */
export interface NotificationPluginApi {
  isPermissionGranted(): Promise<boolean>;
  requestPermission(): Promise<NotificationPermission>;
  sendNotification(options: { title: string; body: string }): unknown;
  /** 返回注销函数；桌面端点击通知本体时 actionId 为 'tap'。 */
  onAction(cb: (event: { actionId: string }) => void): Promise<() => void>;
}

/** 一次可通知的 CI watch 会话完成事件。 */
export interface CiWatchCompletion {
  /** 被监听的 head sha（commitChecks 的键）。 */
  sha: string;
  outcome: 'success' | 'failure';
  passed: number;
  total: number;
  /** conclusion !== 'success' 的检查名（保持返回顺序）。 */
  failedNames: string[];
}

export interface NotificationsDeps {
  /** 仅桌面端 Tauri 环境启用；浏览器开发模式静默停用。 */
  isTauriEnv: () => boolean;
  /** 窗口失焦判定；只有 hidden 时才弹系统通知。 */
  isHidden: () => boolean;
  now: () => number;
  /** 外部订阅 store（zustand v5：listener 收到 (state, prevState)）。 */
  subscribeStore(listener: (state: CiNotificationsState, prevState: CiNotificationsState) => void): () => void;
  plugin: NotificationPluginApi;
}

/** 通知服务关心的 store 切面（githubStore 全量状态的窄化视图）。 */
export interface CiNotificationsState {
  commitChecks: Record<string, GitHubCheckRun[]> | undefined;
  currentOwner: string | null;
  currentRepoName: string | null;
}

/** 纯函数：从 commitChecks 的前后快照中提取「running → completed」的会话完成事件。 */
export function diffCommitCheckCompletions(
  next: CiNotificationsState['commitChecks'],
  prev: CiNotificationsState['commitChecks'],
): CiWatchCompletion[] {
  if (!next || next === prev) return [];
  const completions: CiWatchCompletion[] = [];
  for (const [sha, runs] of Object.entries(next)) {
    if (!Array.isArray(runs) || runs.length === 0) continue;
    if (!runs.every((run) => run?.status === 'completed')) continue;
    // 只有此前观察到过「运行中」快照才算一次会话完成（首见即完成不通知）。
    const previous = prev?.[sha];
    if (!Array.isArray(previous) || previous.length === 0) continue;
    if (!previous.some((run) => run?.status !== 'completed')) continue;
    const passed = runs.filter((run) => run?.conclusion === 'success').length;
    completions.push({
      sha,
      outcome: passed === runs.length ? 'success' : 'failure',
      passed,
      total: runs.length,
      failedNames: runs.filter((run) => run?.conclusion !== 'success').map((run) => run?.name).filter((name): name is string => Boolean(name)),
    });
  }
  return completions;
}

/** 组装提交摘要：短 sha + 通过统计（成功）或失败检查名清单（失败）。 */
function composeSummary(completion: CiWatchCompletion): string {
  const shortSha = completion.sha.slice(0, 7);
  if (completion.outcome === 'success') {
    const stats = tNow('notifications.ciSummaryPassed')
      .replace('{passed}', String(completion.passed))
      .replace('{total}', String(completion.total));
    return `${shortSha} · ${stats}`;
  }
  const shown = completion.failedNames.slice(0, MAX_FAILED_NAMES);
  const more = completion.failedNames.length - shown.length;
  let detail = tNow('notifications.ciSummaryFailedNames').replace('{names}', shown.join(', '));
  if (more > 0) detail += ` +${tNow('notifications.ciSummaryMore').replace('{count}', String(more))}`;
  return `${shortSha} · ${detail}`;
}

export interface CiNotificationController {
  /** 挂到 useGitHubStore.subscribe 上的监听器。 */
  handleStoreChange(state: CiNotificationsState, prevState: CiNotificationsState): void;
  dispose(): void;
}

/** 创建通知控制器：去重（sha+结论）→ 前台过滤 → 30s 节流 → 弹通知。 */
export function createCiNotificationController(deps: NotificationsDeps): CiNotificationController {
  /** 会话去重：`sha:outcome`，同一会话只通知一次（含前台消费的场景）。 */
  const notified = new Set<string>();
  /** 节流：`owner/repo:outcome` → 上次弹出时间戳。 */
  const throttledAt = new Map<string, number>();

  const handleStoreChange = (state: CiNotificationsState, prevState: CiNotificationsState): void => {
    const next = state?.commitChecks;
    if (!next || next === prevState?.commitChecks) return;
    const owner = state.currentOwner;
    const repo = state.currentRepoName;
    if (!owner || !repo) return;
    for (const completion of diffCommitCheckCompletions(next, prevState?.commitChecks)) {
      const dedupKey = `${completion.sha}:${completion.outcome}`;
      if (notified.has(dedupKey)) continue;
      notified.add(dedupKey);
      if (notified.size > DEDUP_LIMIT) {
        for (const key of [...notified].slice(0, notified.size - DEDUP_LIMIT / 2)) notified.delete(key);
      }
      // 前台不弹系统通知：应用内 toast 已经覆盖该时刻。
      if (!deps.isHidden()) continue;
      const now = deps.now();
      for (const [key, ts] of throttledAt) {
        if (now - ts >= THROTTLE_MS) throttledAt.delete(key);
      }
      const throttleKey = `${owner}/${repo}:${completion.outcome}`;
      const last = throttledAt.get(throttleKey);
      if (last !== undefined && now - last < THROTTLE_MS) continue;
      throttledAt.set(throttleKey, now);
      const success = completion.outcome === 'success';
      const title = tNow(success ? 'notifications.ciSuccessTitle' : 'notifications.ciFailureTitle');
      const body = tNow(success ? 'notifications.ciSuccessDesc' : 'notifications.ciFailureDesc')
        .replace('{repo}', `${owner}/${repo}`)
        .replace('{summary}', composeSummary(completion));
      try {
        deps.plugin.sendNotification({ title, body });
      } catch { /* 系统通知失败绝不影响 store 监听器 */ }
    }
  };

  return {
    handleStoreChange,
    dispose: () => {
      notified.clear();
      throttledAt.clear();
    },
  };
}

const defaultIsTauriEnv = (): boolean => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
const defaultIsHidden = (): boolean => typeof document !== 'undefined' && document.hidden === true;

/** 动态加载真实插件并归一化成注入面；失败返回 null（静默停用）。 */
async function loadDefaultPlugin(): Promise<NotificationPluginApi | null> {
  try {
    const module = await import('@tauri-apps/plugin-notification');
    return {
      isPermissionGranted: () => module.isPermissionGranted(),
      requestPermission: () => module.requestPermission(),
      sendNotification: (options) => module.sendNotification(options),
      onAction: async (cb) => {
        const listener = await module.onAction(cb);
        return () => { void listener.unregister(); };
      },
    };
  } catch {
    return null;
  }
}

/** 权限检查绝不抛错：任何插件异常都按「未授权」处理（静默停用）。 */
async function ensurePermission(plugin: NotificationPluginApi): Promise<boolean> {
  try {
    if (await plugin.isPermissionGranted()) return true;
    return (await plugin.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

/** 点击通知本体（actionId 'tap'）时聚焦主窗口。 */
async function focusMainWindow(): Promise<void> {
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const window = getCurrentWindow();
    await window.show();
    await window.setFocus();
  } catch { /* 聚焦失败可忽略：通知本身已经送达 */ }
}

/**
 * 初始化系统通知：Tauri 环境且授权后才订阅 store；返回清理函数
 * （注销订阅、注销点击监听并清空内存状态），供 React effect 卸载时调用。
 * 非桌面端 / 权限被拒 / 插件不可用一律静默返回空清理函数。
 */
export async function initNotifications(overrides?: Partial<NotificationsDeps>): Promise<() => void> {
  const isTauriEnv = overrides?.isTauriEnv ?? defaultIsTauriEnv;
  if (!isTauriEnv()) return () => {};
  const plugin = overrides?.plugin ?? (await loadDefaultPlugin());
  if (!plugin) return () => {};
  if (!(await ensurePermission(plugin))) return () => {};
  const deps: NotificationsDeps = {
    isTauriEnv,
    isHidden: overrides?.isHidden ?? defaultIsHidden,
    now: overrides?.now ?? (() => Date.now()),
    subscribeStore: overrides?.subscribeStore ?? ((listener) => useGitHubStore.subscribe(listener)),
    plugin,
  };
  const controller = createCiNotificationController(deps);
  const unsubscribe = deps.subscribeStore(controller.handleStoreChange);
  // 必须先于首次通知注册点击监听（桌面端只为「监听存在期间发出的通知」回报点击）。
  let unlistenAction: (() => void) | null = null;
  try {
    unlistenAction = await plugin.onAction((event) => {
      if (event.actionId !== 'tap') return; // 通知按钮 action 不聚焦，仅响应点击本体
      void focusMainWindow();
    });
  } catch { /* 点击聚焦不可用时通知仍然可用 */ }
  return () => {
    unsubscribe();
    controller.dispose();
    unlistenAction?.();
  };
}
