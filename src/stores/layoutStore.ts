import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface LayoutState {
  // 分栏宽度（单位：像素）
  leftSidebarWidth: number;
  rightPaneWidth: number;
  changesFileListWidth: number;
  actionsWorkflowsWidth: number;
  prListWidth: number;

  // 调节动作
  setLeftSidebarWidth: (width: number) => void;
  setRightPaneWidth: (width: number) => void;
  setChangesFileListWidth: (width: number) => void;
  setActionsWorkflowsWidth: (width: number) => void;
  setPrListWidth: (width: number) => void;

  // 恢复默认布局
  resetLayout: () => void;
}

export const DEFAULT_LAYOUT = {
  leftSidebarWidth: 240,
  rightPaneWidth: 300,
  changesFileListWidth: 260,
  actionsWorkflowsWidth: 260,
  prListWidth: 320,
};

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      ...DEFAULT_LAYOUT,

      setLeftSidebarWidth: (width: number) =>
        set({ leftSidebarWidth: Math.max(160, Math.min(500, width)) }),

      setRightPaneWidth: (width: number) =>
        set({ rightPaneWidth: Math.max(220, Math.min(650, width)) }),

      setChangesFileListWidth: (width: number) =>
        set({ changesFileListWidth: Math.max(160, Math.min(500, width)) }),

      setActionsWorkflowsWidth: (width: number) =>
        set({ actionsWorkflowsWidth: Math.max(160, Math.min(500, width)) }),

      setPrListWidth: (width: number) =>
        set({ prListWidth: Math.max(200, Math.min(550, width)) }),

      resetLayout: () => set(DEFAULT_LAYOUT),
    }),
    {
      name: 'auu-git-layout-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
