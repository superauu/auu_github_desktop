import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface ComposerDraft { title: string; body: string }
export interface HistoryViewState {
  query: string; scrollTop: number; metadataWidth: number;
  columns: { author: boolean; date: boolean; hash: boolean };
}
export const EMPTY_DRAFT: ComposerDraft = { title: '', body: '' };
export const DEFAULT_HISTORY_VIEW: HistoryViewState = { query: '', scrollTop: 0, metadataWidth: 176, columns: { author: true, date: true, hash: false } };
export const draftKey = (repoPath?: string, branch?: string) => JSON.stringify([repoPath || '', branch || '']);

let pending: { name: string; value: string } | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
export function flushWorkspaceSession() {
  clearTimeout(timer);
  if (pending) { try { localStorage.setItem(pending.name, pending.value); } catch {} pending = null; }
}
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushWorkspaceSession);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushWorkspaceSession(); });
}

interface WorkspaceSessionState {
  drafts: Record<string, ComposerDraft>;
  historyViews: Record<string, HistoryViewState>;
  updateDraft: (key: string, patch: Partial<ComposerDraft>) => void;
  updateHistoryView: (key: string, patch: Partial<HistoryViewState>) => void;
}
export const useWorkspaceSessionStore = create<WorkspaceSessionState>()(persist((set) => ({
  drafts: {}, historyViews: {},
  updateDraft: (key, patch) => { set(state => {
    const next = { ...(state.drafts[key] || EMPTY_DRAFT), ...patch };
    const drafts = { ...state.drafts }; delete drafts[key];
    if (next.title || next.body) drafts[key] = next;
    return { drafts: Object.fromEntries(Object.entries(drafts).slice(-100)) };
  }); flushWorkspaceSession(); },
  updateHistoryView: (key, patch) => set(state => ({ historyViews: { ...state.historyViews, [key]: { ...(state.historyViews[key] || DEFAULT_HISTORY_VIEW), ...patch } } })),
}), {
  name: 'auu-git-workspace-session',
  storage: createJSONStorage(() => ({
    getItem: name => localStorage.getItem(name),
    setItem: (name, value) => { pending = { name, value }; clearTimeout(timer); timer = setTimeout(flushWorkspaceSession, 300); },
    removeItem: name => { localStorage.removeItem(name); },
  })),
}));
