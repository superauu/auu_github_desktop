import { create } from 'zustand';

interface HunkPlanDialogState {
  context: { path: string; branch: string } | null;
  open: (path: string, branch: string) => void;
  close: () => void;
}
// Planning belongs to the repository session, not the responsive inspector.
// This state is deliberately in memory; an old index snapshot is never restored on launch.
export const useHunkPlanDialogStore = create<HunkPlanDialogState>(set => ({
  context: null,
  open: (path, branch) => set({ context: { path, branch } }),
  close: () => set({ context: null }),
}));
