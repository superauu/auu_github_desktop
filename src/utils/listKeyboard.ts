import type React from 'react';

/** Roving focus for mounted list rows. Interactive children keep their own keys. */
export function moveListFocus(event: React.KeyboardEvent<HTMLElement>) {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  if (event.target !== (event.target as HTMLElement).closest('[data-list-row]')) return;
  const rows = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[data-list-row]'));
  const index = rows.indexOf(event.target as HTMLElement);
  if (index < 0 || !rows.length) return;
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1
    : Math.max(0, Math.min(rows.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
  event.preventDefault();
  rows[next].focus();
}
