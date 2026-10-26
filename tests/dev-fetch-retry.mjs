// 测试专用：对真实本地 dev server（vite middleware）的 fetch 做连接层透明重试。
// 全量并发跑测试时，Windows 高负载下 loopback 连接偶发被拒/超时（undici 报
// TypeError: fetch failed）。这里只重试"请求未被服务端受理"的连接类错误；
// ECONNRESET 等中途断流不重试——那可能意味着请求已被服务端执行过，盲目重试
// 会重复执行 git 写操作。
// 必须装在 nativeFetch 一层：测试内安装的请求计数拦截器不受影响；整体替换
// globalThis.fetch 的失败模拟 mock（如 oauth-resilience）也不会被误重试。
const CONNECT_ERROR_CODES = new Set(['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT']);

export function retryDevFetch(nativeFetch, { attempts = 3, backoffMs = 250 } = {}) {
  return async (input, init) => {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        return await nativeFetch(input, init);
      } catch (error) {
        lastError = error;
        if (attempt >= attempts || init?.signal?.aborted || !isConnectLevelFailure(error)) throw error;
        await new Promise(resolve => setTimeout(resolve, backoffMs * attempt));
      }
    }
    throw lastError;
  };
}

function isConnectLevelFailure(error) {
  // happy-eyeballs 下所有地址族连接失败会聚合成 AggregateError。
  if (error instanceof AggregateError) return true;
  return Boolean(error?.cause && CONNECT_ERROR_CODES.has(error.cause.code));
}
