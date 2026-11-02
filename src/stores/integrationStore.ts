import { create } from 'zustand';
import type { HostingBinding } from '@/services/integrations/repositoryBinding';

interface IntegrationState {
  repoPath: string | null;
  binding: HostingBinding | null;
  revision: number;
  setContext(repoPath: string | null, binding: HostingBinding | null): void;
}
/** 只持有非敏感的当前仓库上下文；账号与凭证仍由各 Provider 管理。 */
export const useIntegrationStore = create<IntegrationState>(set => ({
  repoPath: null, binding: null, revision: 0,
  setContext: (repoPath, binding) => set(state => ({ repoPath, binding, revision: state.revision + 1 })),
}));
