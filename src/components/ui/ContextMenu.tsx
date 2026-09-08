import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/utils/cn';

export interface ContextMenuItem {
  id: string;
  label?: string;
  icon?: React.ReactNode;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
  onClick?: () => void;
}

interface ContextMenuProps {
  open: boolean;
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  open,
  x,
  y,
  items,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: y, left: x });

  useEffect(() => {
    if (!open) return;

    // Adjust position to stay strictly within viewport
    const menuWidth = 220;
    const menuHeight = items.length * 32 + 20;

    let adjustedLeft = x;
    let adjustedTop = y;

    if (x + menuWidth > window.innerWidth - 10) {
      adjustedLeft = Math.max(10, window.innerWidth - menuWidth - 12);
    }
    if (y + menuHeight > window.innerHeight - 10) {
      adjustedTop = Math.max(10, window.innerHeight - menuHeight - 12);
    }

    setPosition({ top: adjustedTop, left: adjustedLeft });

    const handlePointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    const handleScroll = () => {
      onClose();
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [open, x, y, items.length, onClose]);

  if (!open || items.length === 0) return null;

  return (
    <div
      ref={menuRef}
      style={{ top: `${position.top}px`, left: `${position.left}px` }}
      className="fixed z-50 w-56 rounded-xl border border-border/80 bg-popover/95 p-1 shadow-2xl backdrop-blur-xl animate-in fade-in-50 zoom-in-95 select-none"
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="space-y-0.5">
        {items.map((item, idx) => {
          if (item.separator) {
            return <div key={`sep-${idx}`} className="my-1 border-t border-border/50" />;
          }

          return (
            <button
              key={item.id}
              disabled={item.disabled}
              onClick={() => {
                if (item.disabled) return;
                item.onClick?.();
                onClose();
              }}
              className={cn(
                "w-full text-left px-2.5 py-1.5 text-xs rounded-lg flex items-center justify-between transition-colors group",
                item.disabled
                  ? "opacity-40 cursor-not-allowed text-muted-foreground"
                  : item.danger
                  ? "text-rose-500 hover:bg-rose-500/10 active:bg-rose-500/20 cursor-pointer"
                  : "text-foreground/90 hover:text-foreground hover:bg-accent cursor-pointer"
              )}
            >
              <div className="flex items-center gap-2 truncate">
                {item.icon && (
                  <span
                    className={cn(
                      "shrink-0",
                      item.disabled
                        ? "text-muted-foreground"
                        : item.danger
                        ? "text-rose-500"
                        : "text-muted-foreground group-hover:text-foreground"
                    )}
                  >
                    {item.icon}
                  </span>
                )}
                <span className="truncate">{item.label}</span>
              </div>
              {item.shortcut && (
                <span className="text-[10px] text-muted-foreground font-mono opacity-70 ml-2">
                  {item.shortcut}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
