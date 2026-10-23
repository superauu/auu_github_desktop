import type { HTMLAttributes, KeyboardEvent } from 'react';

/** Keyboard activation and movement for rows that also contain independent actions. */
export function keyboardRowProps(label: string): HTMLAttributes<HTMLDivElement> {
  return {
    role: 'listitem', tabIndex: 0, 'aria-label': label,
    'data-keyboard-row': true,
    onKeyDown: handleRowKeyDown,
  } as HTMLAttributes<HTMLDivElement>;
}

export function handleRowKeyDown(event: KeyboardEvent<HTMLDivElement>) {
  if (event.target !== event.currentTarget) return;
  const row = event.currentTarget;
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault(); row.click();
  } else if ((event.shiftKey && event.key === 'F10') || event.key === 'ContextMenu') {
    event.preventDefault();
    const rect = row.getBoundingClientRect();
    row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: rect.left + 16, clientY: rect.top + rect.height / 2 }));
  } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    const scope = row.closest('[data-keyboard-list]');
    if (!scope) return;
    const rows = Array.from(scope.querySelectorAll<HTMLElement>('[data-keyboard-row]')).filter(item => item.getClientRects().length > 0);
    const index = rows.indexOf(row);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : index + (event.key === 'ArrowDown' ? 1 : -1);
    if (rows[next]) { event.preventDefault(); rows[next].focus(); }
  }
}
