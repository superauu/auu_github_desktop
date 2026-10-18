interface Options {
  check: () => Promise<unknown>;
  canCheck: () => boolean;
  now?: () => number;
  schedule?: typeof setTimeout;
  cancel?: typeof clearTimeout;
}

/** One debounced check at a time; idle windows poll less frequently. */
export function createExternalChangePoller({ check, canCheck, now = Date.now, schedule = setTimeout, cancel = clearTimeout }: Options) {
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
    running = true;
    try { if (canCheck()) await check(); }
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
