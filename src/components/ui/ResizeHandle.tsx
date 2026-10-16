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
  const dragInfoRef = useRef<{ startX: number; startWidth: number }>({
    startX: 0,
    startWidth: currentSize,
  });

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    dragInfoRef.current = {
      startX: e.clientX,
      startWidth: currentSize,
    };
    setIsDragging(true);
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

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragInfoRef.current.startX;
      const rawNewWidth = reverse
        ? dragInfoRef.current.startWidth - deltaX
        : dragInfoRef.current.startWidth + deltaX;

      const clamped = Math.max(minSize, Math.min(maxSize, rawNewWidth));
      onSizeChange(clamped);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    // 拖拽期间全局防止选中文本并保持 col-resize 指针
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, minSize, maxSize, reverse, onSizeChange]);

  return (
    <div
      role="separator" tabIndex={0} aria-label={title} aria-orientation="vertical" aria-valuemin={minSize} aria-valuemax={maxSize} aria-valuenow={currentSize}
      onKeyDown={event => {
        if (event.key === 'Home' && defaultSize !== undefined) { event.preventDefault(); onSizeChange(defaultSize); }
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); const delta = (event.key === 'ArrowRight' ? 16 : -16) * (reverse ? -1 : 1); onSizeChange(Math.max(minSize, Math.min(maxSize, currentSize + delta))); }
      }}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      title={title}
      className={cn(
        'group relative w-1.5 shrink-0 z-20 cursor-col-resize select-none transition-colors h-full flex items-center justify-center',
        isDragging ? 'bg-primary/80' : 'bg-transparent hover:bg-primary/30',
        className
      )}
    >
      {/* 居中的高亮细线 */}
      <div
        className={cn(
          'w-[1.5px] h-full transition-all duration-150',
          isDragging
            ? 'bg-primary shadow-[0_0_8px_rgba(59,130,246,0.8)]'
            : 'bg-transparent group-hover:bg-primary/80'
        )}
      />
    </div>
  );
};
