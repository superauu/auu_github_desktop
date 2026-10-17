import type React from 'react';

/** Roving focus for mounted list rows. Interactive children keep their own keys. */
export function moveListFocus(event: React.KeyboardEvent<HTMLElement>) {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  if (event.target !== (event.target as HTMLElement).closest('[data-list-row]')) return;
  const group = (event.target as HTMLElement).closest<HTMLElement>('[data-virtual-count]');
  if (group) {
    const groups = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[data-virtual-count]'));
    const currentGroup = groups.indexOf(group);
    const index = Number((event.target as HTMLElement).closest<HTMLElement>('[data-virtual-row-index]')?.dataset.virtualRowIndex);
    const counts = groups.map(element => Number(element.dataset.virtualCount));
    const position = counts.slice(0, currentGroup).reduce((sum, count) => sum + count, 0) + index;
    const total = counts.reduce((sum, count) => sum + count, 0);
    let next = event.key === 'Home' ? 0 : event.key === 'End' ? total - 1 : Math.max(0, Math.min(total - 1, position + (event.key === 'ArrowDown' ? 1 : -1)));
    event.preventDefault();
    for (let section = 0; section < groups.length; section++) {
      if (next < counts[section]) { groups[section].dispatchEvent(new CustomEvent('auugit-focus-row', { detail: next })); break; }
      next -= counts[section];
    }
    return;
  }
  const rows = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[data-list-row]'));
  const index = rows.indexOf(event.target as HTMLElement);
  if (index < 0 || !rows.length) return;
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1
    : Math.max(0, Math.min(rows.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
  event.preventDefault();
  rows[next].focus();
}
