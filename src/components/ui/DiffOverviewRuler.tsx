import { useEffect, useMemo, useState, type MouseEvent, type RefObject } from 'react';
import { useI18n } from '@/i18n';
import type { DiffMarkerRun } from '@/utils/diffOverview';

/**
 * 差异视图右缘的概览标尺：每段连续修改按内容位置排成红/绿双车道标记，
 * 点击居中跳到对应位置。几何偏移来自 VirtualRows 写入的 ref（auugit-geometry
 * 事件感知更新），不经过父组件 state，滚动测高期间不会放大整页重渲。
 */
export function DiffOverviewRuler({ runs, geometryRef, port }: {
  runs: readonly DiffMarkerRun[];
  geometryRef: RefObject<number[] | null>;
  port: HTMLElement | null;
}) {
  const { t } = useI18n();
  const [geometry, setGeometry] = useState<{ offsets: number[]; total: number } | null>(null);

  useEffect(() => {
    if (!port) return;
    const read = () => {
      const offsets = geometryRef.current;
      if (!offsets?.length) { setGeometry(null); return; }
      const total = offsets[offsets.length - 1];
      setGeometry(previous => previous && previous.total === total ? previous : { offsets, total });
    };
    read();
    port.addEventListener('auugit-geometry', read);
    return () => port.removeEventListener('auugit-geometry', read);
  }, [port, geometryRef]);

  const segments = useMemo(() => {
    if (!geometry || !runs.length || geometry.total <= 0) return [];
    const { offsets, total } = geometry;
    return runs.map(run => ({
      run,
      top: (offsets[run.startIndex] / total) * 100,
      // 过短的修改至少给约 3px 的可点击高度；位置是近似对齐滚动条几何的。
      height: Math.max(((offsets[run.endIndex + 1] - offsets[run.startIndex]) / total) * 100, 0.4),
    }));
  }, [geometry, runs]);

  if (!segments.length) return null;
  const jump = (event: MouseEvent<HTMLDivElement>) => {
    const target = port;
    if (!target) return;
    const index = Number(event.currentTarget.dataset.overviewRow);
    target.querySelector('[data-virtual-count]')?.dispatchEvent(new CustomEvent('auugit-focus-row', { detail: index }));
    target.focus({ preventScroll: true });
  };
  return (
    <div className="pointer-events-none absolute inset-y-0 right-[6px] z-10 w-[5px]" data-diff-overview role="group" aria-label={t('diff.overviewMarker')}>
      {segments.map(({ run, top, height }) => (
        <div
          key={run.startIndex}
          data-overview-segment
          data-overview-row={run.startIndex}
          className="pointer-events-auto absolute inset-x-0 cursor-pointer opacity-70 transition-opacity hover:opacity-100"
          style={{ top: `${top}%`, height: `${height}%` }}
          title={t('diff.overviewMarker')}
          onClick={jump}
        >
          {run.hasDel && <div className="absolute inset-y-0 left-0 w-[2px] rounded-full bg-git-deleted" />}
          {run.hasAdd && <div className="absolute inset-y-0 right-0 w-[2px] rounded-full bg-git-added" />}
        </div>
      ))}
    </div>
  );
}
