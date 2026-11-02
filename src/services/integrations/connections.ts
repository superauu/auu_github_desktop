import type { DomainId } from './registry';

export type ConnectionHealth = 'connected' | 'error' | 'unverified';

export interface ProviderConnection {
  id: string;
  providerId: string;
  /** 用户自定义显示名——同平台多连接的消歧单位（"公司 Sentry"）。 */
  displayName: string;
  enabled: boolean;
  /** 自托管地址（默认官方云）；仅 http(s)，见 §6.4 请求目标限制。 */
  baseUrl?: string;
  orgId?: string;
  /** 重算结果（manifest 声明 ∩ 凭证实际可访问），仅在权限检查成功时更新（§4.4）。 */
  domains: DomainId[];
}

