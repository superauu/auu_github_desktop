// Test-only loopback retries. A disconnected response does not prove that a
// POST was never executed: retrying it can cherry-pick or commit twice.
// 必须装在 nativeFetch 一层：测试内安装的请求计数拦截器不受影响；整体替换
// globalThis.fetch 的失败模拟 mock（如 oauth-resilience）也不会被误重试。
const CONNECT_ERROR_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'ENOTFOUND', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET']);
const BEFORE_CONNECT_CODES = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT']);

export function retryDevFetch(nativeFetch, { attempts = 4, backoffMs = 250 } = {}) {
  return async (input, init) => {
    const request = typeof Request !== 'undefined' && input instanceof Request ? input : undefined;
    // Each test suite owns a short-lived loopback server. Do not reuse an idle
    // pooled connection while another synchronous Git fixture blocks its loop;
    // a dropped POST response is ambiguous and must not be retried as a write.
    const url = new URL(request?.url || String(input), 'http://local.invalid');
    if (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
      const headers = new Headers(init?.headers || request?.headers);
      headers.set('Connection', 'close');
      init = { ...init, headers };
    }
    const method = (init?.method || request?.method || 'GET').toUpperCase();
    const safe = method === 'GET' || method === 'HEAD' || isReadOnlyGitPost(request?.url || input, init);
    const signal = init?.signal || request?.signal;
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        return await nativeFetch(input, init);
      } catch (error) {
        lastError = error;
        if (attempt >= attempts || signal?.aborted || !isConnectLevelFailure(error, safe ? CONNECT_ERROR_CODES : BEFORE_CONNECT_CODES)) throw error;
        await new Promise(resolve => setTimeout(resolve, backoffMs * 2 ** (attempt - 1)));
      }
    }
    throw lastError;
  };
}

// Git reads also use POST to the local bridge. Keep this whitelist deliberately
// narrow: an unknown command or body must never gain an ambiguous retry.
function isReadOnlyGitPost(input, init) {
  try {
    if (new URL(String(input), 'http://local.invalid').pathname !== '/api/git' || typeof init?.body !== 'string') return false;
    const args = JSON.parse(init.body).args;
    if (!Array.isArray(args) || args.some(arg => typeof arg !== 'string')) return false;
    let index = 0;
    while (index < args.length) {
      if (['-c', '-C', '--git-dir', '--work-tree', '--namespace', '--config-env'].includes(args[index])) { index += 2; continue; }
      if (/^--(literal-pathspecs|no-literal-pathspecs|no-optional-locks|no-pager|paginate)$/.test(args[index]) || /^--(git-dir|work-tree|namespace|config-env)=/.test(args[index])) { index++; continue; }
      break;
    }
    // merge-tree previews may create content-addressed objects, but never move
    // refs or modify the index/worktree. Repeating the preview is safe.
    return ['status', 'log', 'show', 'diff', 'rev-parse', 'for-each-ref', 'ls-files', 'ls-tree', 'cat-file', 'blame', 'check-ignore', 'show-ref', 'rev-list', 'merge-tree', 'diff-tree', '--version'].includes(args[index]);
  } catch { return false; }
}

function isConnectLevelFailure(error, codes) {
  // happy-eyeballs 下所有地址族连接失败会聚合成 AggregateError。
  if (error instanceof AggregateError) return error.errors.length > 0 && error.errors.every(cause => isConnectLevelFailure(cause, codes));
  return codes.has(error?.code) || Boolean(error?.cause && isConnectLevelFailure(error.cause, codes));
}
