import { create } from 'zustand';
import { loadOperationHistory, saveOperationHistory } from './operationHistoryStorage';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  duration?: number;
  action?: { label: string; onClick: () => void | Promise<void> };
}

export interface OperationEntry extends Omit<ToastItem, 'duration'> {
  createdAt: number;
  repoPath?: string;
  elapsedMs?: number;
}

interface ToastState {
  toasts: ToastItem[];
  history: OperationEntry[];
  historyStorageFailed: boolean;
  record: (entry: Omit<OperationEntry, 'id' | 'createdAt'>) => void;
  clearHistory: () => void;
  consumeAction: (id: string) => void;
  addToast: (toast: Omit<ToastItem, 'id'>) => string;
  removeToast: (id: string) => void;
  success: (title: string, description?: string) => string;
  error: (title: string, description?: string) => string;
  info: (title: string, description?: string) => string;
  warning: (title: string, description?: string) => string;
}

const savedHistory = loadOperationHistory();
const historyState = (history: OperationEntry[]) => ({ history, historyStorageFailed: !saveOperationHistory(history) });
export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  history: savedHistory.history, historyStorageFailed: savedHistory.failed,
  record: (entry) => set(state => historyState([{ ...entry, description: entry.description && entry.description.length > 64000 ? `${entry.description.slice(0, 64000)}…` : entry.description,
    id: `operation-${Date.now()}-${Math.random().toString(36).slice(2)}`, createdAt: Date.now() }, ...state.history].slice(0, 100))),
  clearHistory: () => set(historyState([])),
  consumeAction: (id) => set(state => ({ ...historyState(state.history.map(entry => entry.id === id ? { ...entry, action: undefined } : entry)),
    toasts: state.toasts.map(entry => entry.id === id ? { ...entry, action: undefined } : entry) })),

  addToast: (toast) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const duration = toast.duration ?? 4000;

    set((state) => ({
      toasts: [...state.toasts, { ...toast, id }],
      ...historyState([{ ...toast, id, createdAt: Date.now(), description: toast.description && toast.description.length > 64000 ? `${toast.description.slice(0, 64000)}…` : toast.description }, ...state.history].slice(0, 100)),
    }));

    if (duration > 0) {
      setTimeout(() => {
        get().removeToast(id);
      }, duration);
    }

    return id;
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },

  success: (title, description) => {
    return get().addToast({ type: 'success', title, description });
  },

  error: (title, description) => {
    return get().addToast({ type: 'error', title, description, duration: 6000 });
  },

  info: (title, description) => {
    return get().addToast({ type: 'info', title, description });
  },

  warning: (title, description) => {
    return get().addToast({ type: 'warning', title, description });
  },
}));

export const toast = {
  success: (title: string, description?: string) => useToastStore.getState().success(title, description),
  error: (title: string, description?: string) => useToastStore.getState().error(title, description),
  info: (title: string, description?: string) => useToastStore.getState().info(title, description),
  warning: (title: string, description?: string) => useToastStore.getState().warning(title, description),
};
