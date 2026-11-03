import { LINEAR_PROVIDER } from '../manifests';
import { LinearClient } from './client';
import { linearOAuthService } from './oauth';
import type { AuxPlugin } from '@/services/integrations/plugin';

/** 独立任务系统插件（task 装配档）：令牌由 taskStore 管理（OAuth PKCE 轮转 + keyring）。 */
export const linearPlugin: AuxPlugin = {
  manifest: LINEAR_PROVIDER,
  createClient: ({ token }) => new LinearClient(token),
  oauthRefresh: refreshToken => linearOAuthService.refresh(refreshToken),
  oauth: { authorize: () => linearOAuthService.authorize() },
};
