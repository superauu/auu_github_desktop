import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';

/** Window long lists, measuring wrapped rows while keeping normal text selection. */
export function VirtualRows<T>({ items, renderRow, rowHeight = 24, threshold = 300, contentWidth = false }: {
  items: readonly T[]; renderRow: (item: T, index: number) => ReactNode;
  rowHeight?: number; threshold?: number; contentWidth?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const port = useRef<HTMLElement | null>(null);
  const pendingFocus = useRef<number | null>(null);
  const [viewport, setViewport] = useState({ top: 0, height: 800 });
  const [revision, setRevision] = useState(0);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => { setWidth(0); }, [items, contentWidth]);
  const measured = useMemo(() => new Map<number, number>(), [items, rowHeight]);
  const virtual = items.length > threshold;
  const offsets = useMemo(() => {
    const result = [0];
    for (let index = 0; index < items.length; index++) result.push(result[index] + (measured.get(index) || rowHeight));
    return result;
  }, [items.length, measured, rowHeight, revision]);
  const lowerBound = (value: number) => {
    let low = 0, high = items.length;
    while (low < high) { const middle = (low + high) >>> 1; if (offsets[middle + 1] < value) low = middle + 1; else high = middle; }
    return low;
  };
  const start = virtual ? Math.max(0, lowerBound(viewport.top) - 12) : 0;
  const end = virtual ? Math.min(items.length, lowerBound(viewport.top + viewport.height) + 13) : items.length;

  useLayoutEffect(() => {
    let element = root.current?.parentElement || null;
    while (element && !/(auto|scroll)/.test(getComputedStyle(element).overflowY)) element = element.parentElement;
    port.current = element;
    if (!element) return;
    let frame = 0;
    const update = () => {
      if (!root.current) return;
      const top = element!.getBoundingClientRect().top - root.current.getBoundingClientRect().top;
      setViewport(previous => previous.top === top && previous.height === element!.clientHeight ? previous : { top, height: element!.clientHeight });
    };
    const scroll = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
    const observer = new ResizeObserver(update); observer.observe(element); update();
    element.addEventListener('scroll', scroll, { passive: true });
    const focus = (event: Event) => {
      const index = (event as CustomEvent<number>).detail;
      if (index < 0 || index >= items.length || !root.current) return;
      if (!virtual) {
        const row = root.current.querySelector<HTMLElement>(`[data-virtual-row-index="${index}"]`);
        const focusable = row?.querySelector<HTMLElement>('[data-list-row]');
        if (focusable) focusable.focus(); else row?.scrollIntoView({ block: 'center' });
        return;
      }
      pendingFocus.current = root.current.querySelector('[data-list-row]') ? index : null;
      const listTop = root.current.getBoundingClientRect().top - element!.getBoundingClientRect().top + element!.scrollTop;
      element!.scrollTop = Math.max(0, listTop + offsets[index] - element!.clientHeight / 2);
      update(); setRevision(value => value + 1);
    };
    root.current?.addEventListener('auugit-focus-row', focus);
    const list = root.current;
    return () => { cancelAnimationFrame(frame); observer.disconnect(); element!.removeEventListener('scroll', scroll); list?.removeEventListener('auugit-focus-row', focus); };
  }, [items.length, offsets, virtual]);

  useLayoutEffect(() => {
    const focus = pendingFocus.current;
    if (focus === null) return;
    const row = root.current?.querySelector<HTMLElement>(`[data-virtual-row-index="${focus}"] [data-list-row]`);
    if (row) { pendingFocus.current = null; row.focus({ preventScroll: true }); }
  }, [start, end, revision]);

  useLayoutEffect(() => {
    if (!virtual || !root.current) return;
    const observer = new ResizeObserver(entries => {
      let changed = false;
      let widest = 0;
      for (const entry of entries) {
        const element = entry.target as HTMLElement;
        const index = Number(element.dataset.virtualRowIndex);
        const height = element.getBoundingClientRect().height;
        if (height > 0 && measured.get(index) !== height) { measured.set(index, height); changed = true; }
        widest = Math.max(widest, element.scrollWidth);
      }
      if (changed) setRevision(value => value + 1);
      if (contentWidth) setWidth(previous => Math.max(previous, widest));
    });
    root.current.querySelectorAll('[data-virtual-row-index]').forEach(element => observer.observe(element));
    return () => observer.disconnect();
  }, [start, end, measured, virtual, contentWidth]);

  return <div ref={root} data-virtual-count={items.length} style={virtual ? { position: 'relative', height: offsets[items.length], minWidth: '100%', width: contentWidth && width ? width : undefined, overflowAnchor: 'none' } : undefined}>
    {items.slice(start, end).map((item, offset) => {
      const index = start + offset;
      return <div key={index} data-virtual-row-index={index} style={virtual ? { position: 'absolute', top: offsets[index], minWidth: '100%', width: contentWidth ? 'max-content' : '100%' } : undefined}>{renderRow(item, index)}</div>;
    })}
  </div>;
}
