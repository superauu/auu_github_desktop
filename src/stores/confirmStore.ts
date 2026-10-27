import { create } from 'zustand';
import { useRepoStore } from './repoStore';

interface Confirmation {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  checkbox?: { label: string; onChange: (checked: boolean) => void };
  danger?: boolean;
  detail?: string;
}
interface PendingConfirmation extends Confirmation {
  repoPath?: string;
  branch?: string;
  resolve: (accepted: boolean) => void;
}

export const useConfirmStore = create<{ pending: PendingConfirmation | null; settle: (accepted: boolean) => void }>((set, get) => ({
  pending: null,
  settle: (accepted) => {
    const pending = get().pending;
    set({ pending: null });
    pending?.resolve(accepted);
  },
}));

export function confirmAction(options: Confirmation): Promise<boolean> {
  useConfirmStore.getState().settle(false);
  const { currentRepo, status } = useRepoStore.getState();
  return new Promise((resolve) => useConfirmStore.setState({ pending: {
    ...options, repoPath: currentRepo?.path, branch: status?.currentBranch || currentRepo?.currentBranch, resolve,
  } }));
}
