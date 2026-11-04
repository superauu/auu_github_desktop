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
  // Linear 的分享链接以 identifier 为键（linear.app/issue/ENG-12）；无 identifier 的
  // 引用退回 teamKey-number 猜测（owner 为 'all' 时无法构造，返回空由 UI 降级处理）。
  issueUrl: reference => {
    const identifier = reference.identifier ?? (reference.owner && reference.owner !== 'all' ? `${reference.owner.toUpperCase()}-${reference.number}` : null);
    return identifier ? `https://linear.app/issue/${encodeURIComponent(identifier)}` : '';
  },
};
