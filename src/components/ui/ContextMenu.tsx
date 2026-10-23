import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [position, setPosition] = useState({ top: y, left: x });

  useEffect(() => {
    if (!open) return;

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => menuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true }));
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
        closeRef.current();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeRef.current(); }
    };

    const handleScroll = (event: Event) => {
      if (!menuRef.current?.contains(event.target as Node)) closeRef.current();
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      cancelAnimationFrame(frame);
      if (menuRef.current?.contains(document.activeElement) || document.activeElement === document.body) previousFocus?.focus({ preventScroll: true });
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [open, x, y, items.length]);

  if (!open || items.length === 0) return null;

  // Frosted panels establish containing blocks; menus still use viewport coordinates.
  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      onKeyDown={event => {
        if (event.key === 'Tab') { event.preventDefault(); closeRef.current(); return; }
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus({ preventScroll: true });
      }}
      style={{ top: `${position.top}px`, left: `${position.left}px` }}
      className="glass-dialog fixed z-50 w-56 rounded-xl border border-border/80 p-1 shadow-2xl animate-in fade-in-50 zoom-in-95 select-none"
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
              role="menuitem"
              tabIndex={-1}
              disabled={item.disabled}
              onClick={() => {
                if (item.disabled) return;
                closeRef.current();
                requestAnimationFrame(() => item.onClick?.());
              }}
              className={cn(
                "w-full text-left px-2.5 py-1.5 text-[13px] rounded-lg flex items-center justify-between transition-colors group",
                item.disabled
                  ? "opacity-40 cursor-not-allowed text-muted-foreground"
                  : item.danger
                  ? "text-destructive hover:bg-rose-500/10 active:bg-rose-500/20 cursor-pointer"
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
                        ? "text-destructive"
                        : "text-muted-foreground group-hover:text-foreground"
                    )}
                  >
                    {item.icon}
                  </span>
                )}
                <span className="truncate">{item.label}</span>
              </div>
              {item.shortcut && (
                <span className="text-[11px] text-muted-foreground font-mono opacity-70 ml-2">
                  {item.shortcut}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>, document.body
  );
};
