import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface ComposerDraft { title: string; body: string }
export interface HistoryViewState {
  query: string; scrollTop: number;
  columns: { author: boolean; date: boolean; hash: boolean };
}
export const EMPTY_DRAFT: ComposerDraft = { title: '', body: '' };
export const DEFAULT_HISTORY_VIEW: HistoryViewState = { query: '', scrollTop: 0, columns: { author: true, date: true, hash: false } };
export const draftKey = (repoPath?: string, branch?: string) => JSON.stringify([repoPath || '', branch || '']);

/** historyViews 按仓库路径保存的容量上限（LRU：写入即 touch，保留最近使用的 N 个仓库） */
const HISTORY_VIEW_LIMIT = 50;

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

type WorkspaceSessionData = Pick<WorkspaceSessionState, 'drafts' | 'historyViews'>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** 只保留值为对象的键，避免损坏的持久化数据进入 store */
const pickRecordEntries = (value: unknown): Record<string, unknown> => {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => isRecord(entry)));
};

/**
 * LRU 语义（利用对象插入序）：先移除旧位置的 key 再重新插入使其移到末尾，
 * 最后只保留最后 limit 条 —— 即最近使用的 limit 个仓库条目。
 */
const touchWithLimit = <T>(record: Record<string, T>, key: string, value: T, limit: number): Record<string, T> => {
  const rest: Record<string, T> = {};
  for (const [k, v] of Object.entries(record)) { if (k !== key) rest[k] = v; }
  rest[key] = value;
  const entries = Object.entries(rest);
  return entries.length <= limit ? rest : Object.fromEntries(entries.slice(-limit));
};

export const useWorkspaceSessionStore = create<WorkspaceSessionState>()(persist((set) => ({
  drafts: {}, historyViews: {},
  updateDraft: (key, patch) => { set(state => {
    const next = { ...(state.drafts[key] || EMPTY_DRAFT), ...patch };
    const drafts = { ...state.drafts }; delete drafts[key];
    if (next.title || next.body) drafts[key] = next;
    return { drafts: Object.fromEntries(Object.entries(drafts).slice(-100)) };
  }); flushWorkspaceSession(); },
  updateHistoryView: (key, patch) => set(state => {
    // 写侧保证写入的形状完整：以 DEFAULT 为底，columns 做逐字段合并，
    // 不做部分字段覆盖写入；读侧（CommitHistoryView）不依赖 store 补默认值。
    const previous = state.historyViews[key];
    const merged: HistoryViewState = {
      ...DEFAULT_HISTORY_VIEW,
      ...previous,
      ...patch,
      columns: { ...DEFAULT_HISTORY_VIEW.columns, ...previous?.columns, ...patch.columns },
    };
    return { historyViews: touchWithLimit(state.historyViews, key, merged, HISTORY_VIEW_LIMIT) };
  }),
}), {
  name: 'auu-git-workspace-session',
  version: 1,
  partialize: (state): WorkspaceSessionData => ({ drafts: state.drafts, historyViews: state.historyViews }),
  // 旧数据无 version 字段（视为 0）：形状与 v1 一致，这里做防御性归一——
  // 丢弃非对象顶层与非对象条目，并按 LRU 上限裁剪历史视图。
  migrate: (persisted): WorkspaceSessionData => {
    const legacy = isRecord(persisted) ? persisted : {};
    const drafts = pickRecordEntries(legacy.drafts) as WorkspaceSessionData['drafts'];
    const historyViews = pickRecordEntries(legacy.historyViews) as WorkspaceSessionData['historyViews'];
    const entries = Object.entries(historyViews);
    return { drafts, historyViews: entries.length <= HISTORY_VIEW_LIMIT ? historyViews : Object.fromEntries(entries.slice(-HISTORY_VIEW_LIMIT)) };
  },
  storage: createJSONStorage(() => ({
    getItem: name => localStorage.getItem(name),
    setItem: (name, value) => { pending = { name, value }; clearTimeout(timer); timer = setTimeout(flushWorkspaceSession, 300); },
    removeItem: name => { localStorage.removeItem(name); },
  })),
}));
