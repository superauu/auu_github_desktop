import React, { useState, useEffect, useRef } from 'react';
import { cn } from '@/utils/cn';

interface ResizeHandleProps {
  currentSize: number;
  onSizeChange: (newSize: number) => void;
  minSize?: number;
  maxSize?: number;
  defaultSize?: number;
  reverse?: boolean; // 如果为 true，则鼠标向左拖拽增加宽度（适用于右侧面板）
  className?: string;
  title?: string;
}

export const ResizeHandle: React.FC<ResizeHandleProps> = ({
  currentSize,
  onSizeChange,
  minSize = 160,
  maxSize = 600,
  defaultSize,
  reverse = false,
  className,
  title = '按住并拖动调节宽度，双击恢复默认',
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const dragInfoRef = useRef<{ startX: number; startWidth: number; pointerId: number; element: HTMLDivElement } | null>(null);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !e.isPrimary) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.focus({ preventScroll: true });
    e.currentTarget.setPointerCapture(e.pointerId);
    dragInfoRef.current = {
      startX: e.clientX,
      startWidth: currentSize,
      pointerId: e.pointerId,
      element: e.currentTarget,
    };
    setIsDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragInfoRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const delta = (e.clientX - drag.startX) * (reverse ? -1 : 1);
    onSizeChange(Math.max(minSize, Math.min(maxSize, drag.startWidth + delta)));
  };

  const finishDrag = () => {
    const drag = dragInfoRef.current;
    dragInfoRef.current = null;
    if (drag?.element.hasPointerCapture(drag.pointerId)) drag.element.releasePointerCapture(drag.pointerId);
    setIsDragging(false);
  };

  const handlePointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragInfoRef.current?.pointerId === e.pointerId) finishDrag();
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (defaultSize !== undefined) {
      onSizeChange(defaultSize);
    }
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleBlur = () => {
      const drag = dragInfoRef.current;
      dragInfoRef.current = null;
      if (drag?.element.hasPointerCapture(drag.pointerId)) drag.element.releasePointerCapture(drag.pointerId);
      setIsDragging(false);
    };

    // 拖拽期间全局防止选中文本并保持 col-resize 指针
    const cursor = document.body.style.cursor;
    const userSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('blur', handleBlur);

    return () => {
      document.body.style.cursor = cursor;
      document.body.style.userSelect = userSelect;
      window.removeEventListener('blur', handleBlur);
    };
  }, [isDragging]);

  return (
    <div
      role="separator" tabIndex={0} aria-label={title} aria-orientation="vertical" aria-valuemin={minSize} aria-valuemax={maxSize} aria-valuenow={currentSize}
      onKeyDown={event => {
        if (event.key === 'Home' && defaultSize !== undefined) { event.preventDefault(); onSizeChange(defaultSize); }
        if (event.key === 'End') { event.preventDefault(); onSizeChange(maxSize); }
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); const delta = (event.key === 'ArrowRight' ? 16 : -16) * (reverse ? -1 : 1); onSizeChange(Math.max(minSize, Math.min(maxSize, currentSize + delta))); }
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onLostPointerCapture={handlePointerEnd}
      onDoubleClick={handleDoubleClick}
      title={title}
      className={cn(
        'group relative w-1.5 shrink-0 z-20 cursor-col-resize touch-none select-none transition-colors h-full flex items-center justify-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring',
        isDragging ? 'bg-primary/15' : 'bg-transparent hover:bg-primary/10',
        className
      )}
    >
      {/* 居中的高亮细线 */}
      <div
        className={cn(
          'w-px h-full transition-colors duration-150',
          isDragging
            ? 'bg-primary'
            : 'bg-border group-hover:bg-primary/80 group-focus-visible:bg-primary'
        )}
      />
    </div>
  );
};
