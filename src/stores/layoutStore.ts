import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface LayoutState {
  // 分栏宽度（单位：像素）
  leftSidebarWidth: number;
  rightPaneWidth: number;
  changesFileListWidth: number;
  actionsWorkflowsWidth: number;
  prListWidth: number;
  reviewFilesWidth: number;
  isEmbeddedTerminalOpen: boolean;
  navigationPinned: boolean;
  inspectorPresentation: 'auto' | 'inline' | 'drawer';

  // 调节动作
  setLeftSidebarWidth: (width: number) => void;
  setRightPaneWidth: (width: number) => void;
  setChangesFileListWidth: (width: number) => void;
  setActionsWorkflowsWidth: (width: number) => void;
  setPrListWidth: (width: number) => void;
  setReviewFilesWidth: (width: number) => void;
  toggleEmbeddedTerminal: () => void;
  setEmbeddedTerminalOpen: (open: boolean) => void;
  setNavigationPinned: (pinned: boolean) => void;
  setInspectorPresentation: (presentation: LayoutState['inspectorPresentation']) => void;

  // 恢复默认布局
  resetLayout: () => void;
}

export const DEFAULT_LAYOUT = {
  leftSidebarWidth: 200,
  rightPaneWidth: 400,
  changesFileListWidth: 260,
  actionsWorkflowsWidth: 260,
  prListWidth: 320,
  reviewFilesWidth: 230,
  isEmbeddedTerminalOpen: false,
  navigationPinned: true,
  inspectorPresentation: 'auto' as const,
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

      setReviewFilesWidth: (width: number) =>
        set({ reviewFilesWidth: Math.max(170, Math.min(420, width)) }),

      toggleEmbeddedTerminal: () =>
        set((state) => ({ isEmbeddedTerminalOpen: !state.isEmbeddedTerminalOpen })),

      setEmbeddedTerminalOpen: (open: boolean) =>
        set({ isEmbeddedTerminalOpen: open }),

      setNavigationPinned: (navigationPinned: boolean) => set({ navigationPinned }),
      setInspectorPresentation: (inspectorPresentation) => set({ inspectorPresentation }),

      resetLayout: () => set(DEFAULT_LAYOUT),
    }),
    {
      name: 'auu-git-layout-storage',
      version: 1,
      migrate: (persisted) => {
        const previous = (persisted && typeof persisted === 'object' ? persisted : {}) as Partial<LayoutState>;
        // Adopt the wider default for old default layouts; retain custom panel sizes.
        return { ...previous, rightPaneWidth: previous.rightPaneWidth == null || previous.rightPaneWidth === 320 ? DEFAULT_LAYOUT.rightPaneWidth : previous.rightPaneWidth };
      },
      storage: createJSONStorage(() => localStorage),
    }
  )
);
