export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export interface DeviceTokenResponse {
  access_token?: string;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
  error_uri?: string;
}

export class GitHubOAuthService {
  private static readonly CLIENT_ID = '178c6fc778ccc68e1d6a';
  private static readonly SCOPES = 'repo,workflow,read:user';

  /**
   * 向 GitHub 申请设备授权码与用户核验码
   */
  async requestDeviceCode(): Promise<DeviceCodeResponse> {
    const res = await fetch('/api/github/device-code', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: GitHubOAuthService.CLIENT_ID,
        scope: GitHubOAuthService.SCOPES,
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`获取 GitHub 设备码失败 (HTTP ${res.status}): ${errorText}`);
    }

    const data = (await res.json()) as DeviceCodeResponse;
    if (!data.device_code || !data.user_code) {
      throw new Error('GitHub 未返回有效的设备授权凭据');
    }

    return data;
  }

  /**
   * 轮询 GitHub 直至用户在浏览器中授权成功或超时/取消
   */
  async pollForToken(
    deviceCode: string,
    initialInterval: number,
    expiresInSeconds: number,
    options?: {
      signal?: AbortSignal;
      onPollStep?: (info: { attempt: number; nextInterval: number; remainingSeconds: number }) => void;
    }
  ): Promise<string> {
    let interval = Math.max(initialInterval || 5, 5);
    const expiresAt = Date.now() + expiresInSeconds * 1000;
    let attempt = 0;

    while (Date.now() < expiresAt) {
      if (options?.signal?.aborted) {
        throw new DOMException('用户取消了授权流程', 'AbortError');
      }

      attempt++;
      const remainingSeconds = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
      options?.onPollStep?.({ attempt, nextInterval: interval, remainingSeconds });

      // 等待指定 interval 秒
      await this.sleep(interval * 1000, options?.signal);

      if (options?.signal?.aborted) {
        throw new DOMException('用户取消了授权流程', 'AbortError');
      }

      const res = await fetch('/api/github/device-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: GitHubOAuthService.CLIENT_ID,
          device_code: deviceCode,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`轮询 GitHub Token 异常 (HTTP ${res.status}): ${errorText}`);
      }

      const data = (await res.json()) as DeviceTokenResponse;

      if (data.access_token) {
        return data.access_token;
      }

      if (data.error === 'authorization_pending') {
        // 用户尚未确认授权，继续正常轮询
        continue;
      }

      if (data.error === 'slow_down') {
        // GitHub 要求降低轮询频次
        interval += 5;
        continue;
      }

      if (data.error === 'expired_token') {
        throw new Error('设备授权验证码已过期，请重新发起登录');
      }

      if (data.error === 'access_denied') {
        throw new Error('用户在 GitHub 页面上拒绝了授权请求');
      }

      if (data.error) {
        throw new Error(data.error_description || `授权异常: ${data.error}`);
      }
    }

    throw new Error('授权请求已超时，请重试');
  }

  private sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        return reject(new DOMException('用户取消了操作', 'AbortError'));
      }

      const timer = setTimeout(() => {
        if (signal) {
          signal.removeEventListener('abort', onAbort);
        }
        resolve();
      }, ms);

      const onAbort = () => {
        clearTimeout(timer);
        reject(new DOMException('用户取消了操作', 'AbortError'));
      };

      if (signal) {
        signal.addEventListener('abort', onAbort, { once: true });
      }
    });
  }
}

export const gitHubOAuthService = new GitHubOAuthService();
