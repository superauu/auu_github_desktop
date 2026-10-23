import { create } from 'zustand';
import type { PushContext, PushOptions } from '@/services/git/types';

export type RemoteAction = 'branch' | 'tag' | 'tags' | 'deleteTag';
export interface RemoteSelection extends PushOptions { remote: string; branch?: string }
export interface RemoteRequest {
  repoPath: string;
  currentBranch: string;
  action: RemoteAction;
  branch?: string;
  tag?: string;
  forceWithLease?: boolean;
  context?: PushContext;
}
interface Pending extends RemoteRequest { resolve: (selection: RemoteSelection | null) => void }

export const useRemoteDialogStore = create<{
  pending: Pending | null;
  settle: (selection: RemoteSelection | null) => void;
}>((set, get) => ({
  pending: null,
  settle: selection => {
    const pending = get().pending;
    set({ pending: null });
    pending?.resolve(selection);
  },
}));

export function requestRemoteOperation(request: RemoteRequest): Promise<RemoteSelection | null> {
  useRemoteDialogStore.getState().settle(null);
  return new Promise(resolve => useRemoteDialogStore.setState({ pending: { ...request, resolve } }));
}
