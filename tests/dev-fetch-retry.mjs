// 测试专用：对真实本地 dev server（vite middleware）的 fetch 做连接层透明重试。
// 全量并发跑测试时，Windows 高负载下 loopback 连接偶发被拒/超时/被重置（undici 报
// TypeError: fetch failed）。ECONNRESET 一类断流也参与重试：loopback 上绝大多数
// reset 发生在服务端受理之前，而各测试以 git 终态读回做断言，万一真的重复执行了
// 写操作会立刻在断言上显形——净收益是消除偶发。
// 必须装在 nativeFetch 一层：测试内安装的请求计数拦截器不受影响；整体替换
// globalThis.fetch 的失败模拟 mock（如 oauth-resilience）也不会被误重试。
const CONNECT_ERROR_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'ENOTFOUND', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET']);

export function retryDevFetch(nativeFetch, { attempts = 4, backoffMs = 250 } = {}) {
  return async (input, init) => {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        return await nativeFetch(input, init);
      } catch (error) {
        lastError = error;
        if (attempt >= attempts || init?.signal?.aborted || !isConnectLevelFailure(error)) throw error;
        await new Promise(resolve => setTimeout(resolve, backoffMs * 2 ** (attempt - 1)));
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
