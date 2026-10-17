import type { AiApiConfig } from '@/stores/settingsStore';
import { tNow } from '@/i18n';
import { requestAiCompletion } from './AiTransport';

export type AiProtocol = 'chat-completions' | 'responses' | 'anthropic-messages';
export interface AiMessage { role: 'system' | 'user' | 'assistant'; content: string }

export function aiEndpoint(endpoint: string, protocol: AiProtocol = 'chat-completions'): string {
  const url = new URL(endpoint.trim());
  const suffix = protocol === 'responses' ? '/responses' : protocol === 'anthropic-messages' ? '/messages' : '/chat/completions';
  const path = url.pathname.replace(/\/+$/, '');
  const hasApiSuffix = /\/(chat\/completions|responses|messages)$/.test(path);
  const base = hasApiSuffix ? path.replace(/\/(chat\/completions|responses|messages)$/, '') : path || '/v1';
  url.pathname = base + suffix;
  return url.toString();
}

/** Shared protocol adapter for generation, explanations, and connection tests. */
export async function requestAiText(config: AiApiConfig, messages: AiMessage[], options: { signal?: AbortSignal; temperature?: number; maxTokens?: number } = {}): Promise<string> {
  const protocol = config.protocol || 'chat-completions';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const model = config.model.trim();
  if (!model) throw new Error(tNow('settings.ai.needModel'));
  let body: Record<string, unknown>;
  if (protocol === 'anthropic-messages') {
    headers['x-api-key'] = config.apiKey.trim();
    headers['anthropic-version'] = '2023-06-01';
    body = { model, max_tokens: options.maxTokens ?? 4096,
      system: messages.filter(message => message.role === 'system').map(message => message.content).join('\n\n'),
      messages: messages.filter(message => message.role !== 'system'),
    };
  } else {
    headers.Authorization = `Bearer ${config.apiKey.trim()}`;
    body = protocol === 'responses'
      ? { model, input: messages, store: false, ...(options.maxTokens ? { max_output_tokens: options.maxTokens } : {}) }
      : { model, messages, ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}) };
  }
  // Newer reasoning models reject sampling parameters; use provider defaults for Responses.
  if (options.temperature !== undefined && protocol === 'chat-completions') body.temperature = options.temperature;
  const response = await requestAiCompletion(aiEndpoint(config.endpoint, protocol), {
    method: 'POST', headers, body: JSON.stringify(body), signal: options.signal,
  });
  if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const raw = await response.text();
  const responseError = (message: string) => new Error(`${message}\nHTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}\n${raw}`);
  if (!response.ok) {
    throw new Error(tNow('err.aiHttp').replace('{s}', String(response.status)).replace('{m}', () => raw));
  }
  let data;
  try { data = JSON.parse(raw); }
  catch { throw responseError(tNow('err.aiInvalidResponse')); }
  if (!data || typeof data !== 'object') throw responseError(tNow('err.aiInvalidResponse'));
  if (data.error) throw responseError(tNow('settings.ai.testFailed'));
  // A Responses request can return HTTP 200 with a failed/incomplete result.
  if (protocol === 'responses' && ['failed', 'incomplete', 'cancelled', 'queued', 'in_progress'].includes(data.status)) {
    throw responseError(`AI response ${data.status}: ${data.incomplete_details?.reason || data.status}`);
  }
  const textBlocks = (blocks: unknown, type: string) => (Array.isArray(blocks) ? blocks : []).filter(block => block?.type === type && typeof block.text === 'string').map(block => block.text).join('\n');
  const content = protocol === 'responses'
    ? (Array.isArray(data.output) ? data.output : []).filter((item: any) => item?.type === 'message').map((item: any) => textBlocks(item.content, 'output_text')).join('\n')
    : protocol === 'anthropic-messages'
      ? (data.stop_reason === 'max_tokens' ? '' : textBlocks(data.content || [], 'text'))
      : data.choices?.[0]?.finish_reason === 'length' ? '' : data.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw responseError(tNow('err.aiEmptyResponse'));
  if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  return content.trim();
}
