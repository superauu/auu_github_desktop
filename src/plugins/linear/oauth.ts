/** Linear OAuth 2.0 + PKCE：开源桌面客户端免 client_secret 的浏览器授权流程。 */
import { openExternalUrl } from '@/utils/openExternal';
import { tNow } from '@/i18n';
import { ProviderApiError } from '@/services/collaboration/client';
import { providerHttpRequest } from '@/services/http/providerHttp';

const AUTHORIZE_URL = 'https://linear.app/oauth/authorize';
/** 令牌端点在 api 子域：linear.app/oauth/token 会命中 SPA fallback 返回 200+HTML。 */
const TOKEN_URL = 'https://api.linear.app/oauth/token';
/** 与 Linear OAuth 应用登记的回跳地址保持一致（oauth_callback.rs 注释同步）。 */
export const LOOPBACK_PORT = 53862;
const REDIRECT_URI = `http://127.0.0.1:${LOOPBACK_PORT}/callback`;
const SCOPES = 'read,issues:create';
/** 等浏览器授权的上限：与 oauth_loopback_wait 的 MAX_WAIT_MS 一致取 10 分钟。 */
const WAIT_TIMEOUT_MS = 10 * 60 * 1000;

export interface LinearTokenSet {
  accessToken: string;
  refreshToken: string;
  /** 毫秒时间戳；Linear access token 24h。 */
  expiresAt: number;
  scope?: string;
}

/**
 * AuuGit 自己注册的 Linear OAuth 应用（linear.app → Settings → API → OAuth
 * applications，回跳地址 http://127.0.0.1:53862/callback，scopes read,issues:create，
 * Public client 开启）。PKCE(S256) 模式下免 client_secret，公开客户端只凭
 * client_id + code_verifier 换令牌。测试经 setLinearClientId 覆盖默认值。
 */
export let LINEAR_CLIENT_ID = '840ca5172c5aca527874e369544b060f';
export function setLinearClientId(clientId: string): void { LINEAR_CLIENT_ID = clientId; }

export interface OAuthCallbackResult { code: string | null; state: string | null; error: string | null }

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

async function challenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

/** 桌面端 Rust 回跳监听；web 预览没有该命令，给出明确错误而不是静默挂起。 */
async function invokeLoopback<T>(command: string, args: Record<string, unknown>): Promise<T> {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
    throw new Error(tNow('connections.errors.oauthDesktopOnly'));
  }
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(command, args);
}

export class LinearOAuthService {
  /**
   * 打开系统浏览器走授权，阻塞至回跳到达或超时。state 由本地生成并在此比对，
   * 防止回调被其他应用伪造；code_verifier 的一次性由每次调用重新生成保证。
   */
  async authorize(): Promise<LinearTokenSet> {
    if (!LINEAR_CLIENT_ID) throw new Error(tNow('connections.errors.oauthNotConfigured'));
    const verifier = randomVerifier();
    const state = randomVerifier();
    const session = await invokeLoopback<{ id: string; port: number }>('oauth_loopback_begin', { port: LOOPBACK_PORT });
    try {
      const url = new URL(AUTHORIZE_URL);
      url.searchParams.set('client_id', LINEAR_CLIENT_ID);
      url.searchParams.set('redirect_uri', REDIRECT_URI);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('scope', SCOPES);
      url.searchParams.set('state', state);
      url.searchParams.set('code_challenge', await challenge(verifier));
      url.searchParams.set('code_challenge_method', 'S256');
      await openExternalUrl(url.toString());
      const callback = await invokeLoopback<OAuthCallbackResult>('oauth_loopback_wait', { id: session.id, timeoutMs: WAIT_TIMEOUT_MS });
      if (callback.error) throw new ProviderApiError(400, `Linear: ${callback.error}`);
      if (!callback.code) throw new ProviderApiError(400, 'Linear OAuth callback missing code');
      if (callback.state !== state) throw new ProviderApiError(400, 'Linear OAuth state mismatch');
      return await this.exchangeCode(callback.code, verifier);
    } finally {
      await invokeLoopback('oauth_loopback_cancel', { id: session.id }).catch(() => { /* 会话可能已被 wait 消费 */ });
    }
  }

  /** 授权码换令牌：PKCE 模式免 secret。 */
  async exchangeCode(code: string, codeVerifier: string): Promise<LinearTokenSet> {
    const payload = await this.tokenRequest({
      grant_type: 'authorization_code', client_id: LINEAR_CLIENT_ID, redirect_uri: REDIRECT_URI,
      code, code_verifier: codeVerifier,
    });
    return this.toTokenSet(payload);
  }

  /**
   * 刷新令牌。Linear 的 refresh token 是轮转的：响应里的新 refresh token 必须
   * 原子落盘后此调用才算成功，调用方负责持久化；漏存会在下次刷新时 invalid_grant。
   */
  async refresh(refreshToken: string): Promise<LinearTokenSet> {
    const payload = await this.tokenRequest({
      grant_type: 'refresh_token', client_id: LINEAR_CLIENT_ID, refresh_token: refreshToken,
    });
    return this.toTokenSet(payload, refreshToken);
  }

  private toTokenSet(payload: any, fallbackRefresh?: string): LinearTokenSet {
    if (!payload?.access_token) throw new ProviderApiError(400, 'Linear token response missing access_token');
    const refreshToken = payload.refresh_token ?? fallbackRefresh;
    if (!refreshToken) throw new ProviderApiError(400, 'Linear token response missing refresh_token');
    return { accessToken: payload.access_token, refreshToken, expiresAt: Date.now() + (payload.expires_in ?? 86399) * 1000, scope: payload.scope };
  }

  private async tokenRequest(form: Record<string, string>): Promise<any> {
    const response = await providerHttpRequest('POST', TOKEN_URL, { 'Content-Type': 'application/x-www-form-urlencoded' },
      new URLSearchParams(form).toString());
    let payload: any;
    // 非 JSON 响应附带正文片段：端点漂移/网关页/风控页都能一眼定位。
    if (!/^application\/json/i.test(response.headers['content-type'] ?? '')) {
      throw new ProviderApiError(response.status, `Linear token endpoint returned ${response.headers['content-type'] ?? 'unknown content-type'}: ${response.status} ${response.body.slice(0, 160)}`);
    }
    try { payload = JSON.parse(response.body); } catch { throw new ProviderApiError(response.status, `Linear token endpoint returned non-JSON: ${response.status} ${response.body.slice(0, 160)}`); }
    if (response.status < 200 || response.status >= 300 || payload.error) {
      throw new ProviderApiError(response.status === 200 ? 400 : response.status,
        `Linear token endpoint: ${payload.error_description || payload.error || `HTTP ${response.status}`}`);
    }
    return payload;
  }
}

export const linearOAuthService = new LinearOAuthService();
