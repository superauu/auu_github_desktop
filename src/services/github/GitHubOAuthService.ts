import { tNow } from '@/i18n';
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
    const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

    if (isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const rawJson = await invoke<string>('request_github_device_code', {
          clientId: GitHubOAuthService.CLIENT_ID,
          scope: GitHubOAuthService.SCOPES,
        });
        const data = JSON.parse(rawJson);
        if (!data.device_code || !data.user_code) {
          throw new Error(data.error_description || data.error || tNow('err.ghNoCredentials'));
        }
        return data as DeviceCodeResponse;
      } catch (err: any) {
        throw new Error(tNow('err.ghDeviceFailed').replace('{m}', err.message || String(err)));
      }
    }

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

    const rawText = await res.text();
    if (rawText.trim().startsWith('<')) {
      throw new Error(tNow('err.ghNoProxy'));
    }

    if (!res.ok) {
      throw new Error(tNow('err.ghDeviceHttp').replace('{s}', String(res.status)));
    }

    const data = JSON.parse(rawText) as DeviceCodeResponse;
    if (!data.device_code || !data.user_code) {
      throw new Error(tNow('err.ghNoDevice'));
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
    const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

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

      let data: DeviceTokenResponse;

      if (isTauri) {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          const rawJson = await invoke<string>('poll_github_device_token', {
            clientId: GitHubOAuthService.CLIENT_ID,
            deviceCode,
          });
          data = JSON.parse(rawJson);
        } catch (err: any) {
          throw new Error(tNow('err.ghPollFailed').replace('{m}', err.message || String(err)));
        }
      } else {
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

        const rawText = await res.text();
        if (rawText.trim().startsWith('<')) {
          throw new Error(tNow('err.ghNoProxy'));
        }

        if (!res.ok) {
          throw new Error(tNow('err.ghPollHttp').replace('{s}', String(res.status)));
        }

        data = JSON.parse(rawText) as DeviceTokenResponse;
      }

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
        throw new Error(tNow('err.ghCodeExpired'));
      }

      if (data.error === 'access_denied') {
        throw new Error(tNow('err.ghUserDenied'));
      }

      if (data.error) {
        throw new Error(data.error_description || tNow('err.ghAuthError').replace('{m}', data.error));
      }
    }

    throw new Error(tNow('err.ghTimeout'));
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
