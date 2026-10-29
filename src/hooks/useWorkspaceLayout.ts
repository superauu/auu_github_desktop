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
  const { leftSidebarWidth, rightPaneWidth, historyPaneWidth, changesFileListWidth, navigationPinned, inspectorPresentation } = useLayoutStore();
  const { activeTab, currentRepo, isLeftSidebarCollapsed, isRightPaneCollapsed } = useRepoStore(useShallow(state => ({ activeTab: state.activeTab, currentRepo: state.currentRepo, isLeftSidebarCollapsed: state.isLeftSidebarCollapsed, isRightPaneCollapsed: state.isRightPaneCollapsed })));
  const navigationOverlay = !navigationPinned;
  const inspectorOverlay = inspectorPresentation === 'drawer' || (inspectorPresentation !== 'inline' && width < 1200);
  const inlineInspector = !inspectorOverlay && !isRightPaneCollapsed && !!currentRepo && ['history', 'changes'].includes(activeTab);
  // Panel dividers are accounted for by fitWorkspacePanels; the workspace has no outer gutter.
  const panels = fitWorkspacePanels(width, { left: leftSidebarWidth, right: activeTab === 'history' ? historyPaneWidth : rightPaneWidth, files: changesFileListWidth }, {
    left: !navigationOverlay && !isLeftSidebarCollapsed,
    right: inlineInspector,
    files: !!currentRepo && activeTab === 'changes',
  }, inlineInspector && navigationPinned && !isLeftSidebarCollapsed && width < 1480 ? 500 : 640);
  return { navigationOverlay, inspectorOverlay, width, panels };
}
