import { tNow } from '@/i18n';
import { validateGitHubUrl } from '@/utils/externalUrl';
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

/**
 * Device-flow error codes that represent a definitive failure of the authorization
 * attempt itself. Per RFC 8628 section 3.5 and GitHub's device flow documentation
 * these must stop polling immediately. Everything else (network failures, proxies
 * answering non-2xx, unrecognized payloads) is transient and must be retried until
 * the device code expires instead of aborting the whole sign-in flow.
 */
const TERMINAL_DEVICE_FLOW_ERRORS: ReadonlySet<string> = new Set([
  'access_denied',
  'expired_token',
  'unsupported_response_type',
  'unsupported_grant_type',
  'unauthorized_client',
  'incorrect_client_credentials',
  'incorrect_device_code',
  'device_flow_disabled',
]);

export class GitHubOAuthService {
  // AuuGit 自己注册的 OAuth App（https://github.com/settings/developers，已启用
  // device flow）。授权页显示该应用名，用户可在 GitHub 的 Settings → Applications
  // 中查看与撤销授权。
  private static readonly CLIENT_ID = 'Ov23liAzBMxR3hnHnV4L';
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
        data.verification_uri = validateGitHubUrl(data.verification_uri);
        return data as DeviceCodeResponse;
      } catch (err: any) {
        throw new Error(tNow('err.ghDeviceFailed').replace('{m}', err.message || String(err)), { cause: err });
      }
    }

    const res = await fetch('/api/github/device-code', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-AuuGit-Request': '1',
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

    data.verification_uri = validateGitHubUrl(data.verification_uri);
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
    let lastFailure: string | undefined;
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
      try {
        data = await this.requestDeviceToken(deviceCode, isTauri);
      } catch (err: any) {
        // 瞬时网络类失败（DNS 抖动、代理闪断、无 OAuth 错误负载的非 2xx）：
        // 记录后继续轮询，直到设备码过期才统一报超时。
        lastFailure = err?.message || String(err);
        console.warn(`GitHub device token poll attempt ${attempt} failed transiently, retrying: ${lastFailure}`);
        continue;
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

      if (data.error && TERMINAL_DEVICE_FLOW_ERRORS.has(data.error)) {
        if (data.error === 'expired_token') {
          throw new Error(tNow('err.ghCodeExpired'));
        }
        if (data.error === 'access_denied') {
          throw new Error(tNow('err.ghUserDenied'));
        }
        throw new Error(data.error_description || tNow('err.ghAuthError').replace('{m}', data.error));
      }

      if (data.error) {
        // 无法证实为终态的错误负载：保持轮询而非终止整个授权流程
        lastFailure = data.error_description || data.error;
        console.warn(`GitHub device token poll returned an unrecognized error, retrying: ${lastFailure}`);
        continue;
      }
    }

    throw new Error(lastFailure ? `${tNow('err.ghTimeout')} (${lastFailure})` : tNow('err.ghTimeout'));
  }

  /**
   * 单次 Token 轮询请求。仅抛出传输层异常（视为瞬时失败）；
   * 结构化的 OAuth 错误负载会作为返回值交给调用方分类处理。
   */
  private async requestDeviceToken(deviceCode: string, isTauri: boolean): Promise<DeviceTokenResponse> {
    if (isTauri) {
      const { invoke } = await import('@tauri-apps/api/core');
      let rawJson: string;
      try {
        rawJson = await invoke<string>('poll_github_device_token', {
          clientId: GitHubOAuthService.CLIENT_ID,
          deviceCode,
        });
      } catch (err: any) {
        // Rust 桥把非 2xx 响应压平为 "HTTP {status}: {body}" 文本；
        // 尝试还原其中的结构化 OAuth 错误负载，让终态错误码仍能立即生效。
        const text = err?.message || String(err);
        const embedded = /HTTP \d+: ([\s\S]+)$/.exec(text)?.[1];
        if (embedded) {
          try {
            return JSON.parse(embedded) as DeviceTokenResponse;
          } catch {
            // 非 JSON 负载，按传输层瞬时错误处理
          }
        }
        throw new Error(text, { cause: err });
      }
      return JSON.parse(rawJson) as DeviceTokenResponse;
    }

    const res = await fetch('/api/github/device-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-AuuGit-Request': '1',
      },
      body: JSON.stringify({
        client_id: GitHubOAuthService.CLIENT_ID,
        device_code: deviceCode,
      }),
    });

    const rawText = await res.text();

    if (!res.ok) {
      // GitHub 设备码接口通常以 HTTP 200 + 错误 JSON 报告状态，但代理可能以非 2xx
      // 转发同一负载；先尝试还原，失败则视为瞬时网络错误。
      try {
        return JSON.parse(rawText) as DeviceTokenResponse;
      } catch {
        throw new Error(`HTTP ${res.status}: ${rawText.slice(0, 200)}`);
      }
    }

    if (rawText.trim().startsWith('<')) {
      // 认证代理返回了 HTML（代理缺失或正在重启）：按瞬时错误重试
      throw new Error(tNow('err.ghNoProxy'));
    }

    return JSON.parse(rawText) as DeviceTokenResponse;
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
