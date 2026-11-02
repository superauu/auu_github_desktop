import { useCollaborationStore } from '@/stores/collaborationStore';
import { activeProviderId } from '@/stores/collaboration/activeProvider';

/** 视图读取平台语义时使用：优先活跃账号，切换/恢复间隙不借用上一个平台。 */
export const useActiveProviderId = () => useCollaborationStore(state => activeProviderId(state));
