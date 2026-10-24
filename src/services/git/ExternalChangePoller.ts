import { getGitWriteActivity } from './GitQueue';
import { gitService } from './GitService';
import { useRepoStore } from '@/stores/repoStore';

interface Options {
  check: () => Promise<unknown>;
  canCheck: () => boolean;
  /**
   * Async veto evaluated at the start of every tick: returning true skips the
   * refresh, and a later tick (or wake()) retries. The default veto skips
   * ticks while the active repository has queued or running Git writes, or an
   * in-progress operation (merge/rebase/cherry-pick) — refreshing mid-operation
   * would surface transient states such as conflict snapshots or a detached HEAD.
   */
  shouldSkip?: () => Promise<boolean>;
  now?: () => number;
  schedule?: typeof setTimeout;
  cancel?: typeof clearTimeout;
}

async function defaultShouldSkip(): Promise<boolean> {
  const repo = useRepoStore.getState().currentRepo;
  if (!repo) return false;
  // Cheap local check first: any queued or running write for this repository.
  if (getGitWriteActivity(repo.path)) return true;
  try {
    return (await gitService.getRepoOperationState(repo.path)).type !== 'none';
  } catch {
    // Probing failures must never stop the polling loop; the next tick retries.
    return false;
  }
}

/** One debounced check at a time; idle windows poll less frequently. */
export function createExternalChangePoller({ check, canCheck, shouldSkip = defaultShouldSkip, now = Date.now, schedule = setTimeout, cancel = clearTimeout }: Options) {
  let lastActivity = now(), stopped = false, running = false, wakePending = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const delay = () => now() - lastActivity >= 5 * 60_000 ? 60_000 : now() - lastActivity >= 2 * 60_000 ? 30_000 : 10_000;
  const plan = (ms: number) => {
    if (timer !== undefined) cancel(timer);
    if (!stopped) timer = schedule(() => { timer = undefined; void tick(); }, ms);
  };
  const tick = async () => {
    if (stopped) return;
    if (running) { wakePending = true; return; }
    // A veto probe failure keeps the initial `false` (never veto on probe errors).
    let vetoed = false;
    try { vetoed = await shouldSkip(); } catch { /* keep false */ }
    if (stopped) return;
    running = true;
    try { if (!vetoed && canCheck()) await check(); }
    catch (error) { console.warn('Repository refresh failed:', error); }
    finally {
      running = false;
      if (!stopped) { const next = wakePending ? 200 : delay(); wakePending = false; plan(next); }
    }
  };
  plan(10_000);
  return {
    touch() { const wasIdle = delay() > 10_000; lastActivity = now(); if (wasIdle && !running) plan(10_000); },
    wake() { lastActivity = now(); if (running) wakePending = true; else plan(200); },
    stop() { stopped = true; if (timer !== undefined) cancel(timer); },
  };
}
