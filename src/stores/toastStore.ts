import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  duration?: number;
}

interface ToastState {
  toasts: ToastItem[];
  addToast: (toast: Omit<ToastItem, 'id'>) => string;
  removeToast: (id: string) => void;
  success: (title: string, description?: string) => string;
  error: (title: string, description?: string) => string;
  info: (title: string, description?: string) => string;
  warning: (title: string, description?: string) => string;
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  addToast: (toast) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const duration = toast.duration ?? 4000;

    set((state) => ({
      toasts: [...state.toasts, { ...toast, id }],
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
