import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useI18n } from '@/i18n';
import { toast } from '@/stores/toastStore';

type WindowAction = 'minimize' | 'toggleMaximize' | 'close';
const INTERACTIVE = 'button, a, input, textarea, select, [contenteditable="true"], [role="button"], [data-keyboard-row], [data-no-window-drag]';

/** Keep browser previews inert while connecting desktop controls to the native window. */
export function useWindowChrome() {
  const desktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  const [maximized, setMaximized] = useState(false);
  const [focused, setFocused] = useState(true);
  const [pending, setPending] = useState(false);
  const performing = useRef(false);
  const mounted = useRef(false);
  const resizeRead = useRef(0);
  const { t } = useI18n();
  const report = useCallback((error: unknown) => {
    toast.error(t('window.operationFailed'), error instanceof Error ? error.message : String(error));
  }, [t]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const readMaximized = useCallback(async () => {
    const id = ++resizeRead.current;
    const value = await getCurrentWindow().isMaximized();
    if (mounted.current && id === resizeRead.current) setMaximized(value);
  }, []);

  useEffect(() => {
    if (!desktop) return;
    let cancelled = false, focusEvent = 0;
    const disposers: (() => void)[] = [];
    const failed = (error: unknown) => { if (!cancelled) report(error); };
    const listen = (listener: Promise<() => void>) => {
      void listener.then(dispose => { if (cancelled) dispose(); else disposers.push(dispose); }).catch(failed);
    };
    try {
      const native = getCurrentWindow();
      listen(native.onResized(() => { if (!cancelled) void readMaximized().catch(failed); }));
      listen(native.onFocusChanged(({ payload }) => {
        focusEvent++;
        if (!cancelled) setFocused(payload);
      }));
      const initialFocusEvent = focusEvent;
      void native.isFocused().then(value => {
        if (!cancelled && initialFocusEvent === focusEvent) setFocused(value);
      }).catch(failed);
      void readMaximized().catch(failed);
    } catch (error) { failed(error); }
    return () => { cancelled = true; resizeRead.current++; disposers.forEach(dispose => dispose()); };
  }, [desktop, report, readMaximized]);

  const perform = useCallback(async (action: WindowAction) => {
    if (!desktop || performing.current) return;
    performing.current = true;
    setPending(true);
    try {
      const native = getCurrentWindow();
      await native[action]();
      if (action === 'toggleMaximize') await readMaximized();
    } catch (error) { if (mounted.current) report(error); }
    finally {
      performing.current = false;
      if (mounted.current) setPending(false);
    }
  }, [desktop, report, readMaximized]);

  const drag = useCallback((event: MouseEvent<HTMLElement>) => {
    if (!desktop || event.button !== 0 || (event.target as Element).closest(INTERACTIVE)) return;
    if (event.detail === 2) { void perform('toggleMaximize'); return; }
    try { void getCurrentWindow().startDragging().catch(report); }
    catch (error) { report(error); }
  }, [desktop, perform, report]);

  return { desktop, maximized, focused, pending, perform, drag };
}

export type WindowChrome = ReturnType<typeof useWindowChrome>;
