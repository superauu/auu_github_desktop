import { useShallow } from 'zustand/react/shallow';
import { useSyncExternalStore } from 'react';
import { useLayoutStore } from '@/stores/layoutStore';
import { useRepoStore } from '@/stores/repoStore';
import { fitWorkspacePanels } from '@/utils/workspaceSizing';

const subscribe = (notify: () => void) => {
  window.addEventListener('resize', notify);
  return () => window.removeEventListener('resize', notify);
};

/** Keep room for a file list, a readable diff, and the commit editor. */
export function useWorkspaceLayout() {
  const width = useSyncExternalStore(subscribe, () => window.innerWidth);
  const { leftSidebarWidth, rightPaneWidth, changesFileListWidth, navigationPinned } = useLayoutStore();
  const { activeTab, currentRepo, isLeftSidebarCollapsed, isRightPaneCollapsed } = useRepoStore(useShallow(state => ({ activeTab: state.activeTab, currentRepo: state.currentRepo, isLeftSidebarCollapsed: state.isLeftSidebarCollapsed, isRightPaneCollapsed: state.isRightPaneCollapsed })));
  const navigationOverlay = !navigationPinned;
  // A pinned navigation takes priority over keeping the inspector inline.
  const inspectorOverlay = width < (navigationPinned && !isLeftSidebarCollapsed ? 1480 : 1240);
  const panels = fitWorkspacePanels(width, { left: leftSidebarWidth, right: rightPaneWidth, files: changesFileListWidth }, {
    left: !navigationOverlay && !isLeftSidebarCollapsed,
    right: !inspectorOverlay && !isRightPaneCollapsed && !!currentRepo && ['history', 'changes'].includes(activeTab),
    files: !!currentRepo && activeTab === 'changes',
  });
  return { navigationOverlay, inspectorOverlay, width, panels };
}
