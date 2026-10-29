/**
 * GitHub PR/issue 正文常是 HTML（Dependabot、release notes bot 直接写 HTML 段落），
 * 原样 whitespace-pre-wrap 渲染会把 <details>/<a> 等标签当文字显示。
 * 这里用 DOMParser 提取可读纯文本：块级元素各占一行、取 textContent（链接保留文字，
 * 丢弃 href——完整链接场景走「在浏览器打开」）。textContent 提取不存在脚本执行面。
 */
const BLOCK_SELECTOR = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, summary, dd, dt, tr';

export function htmlToPlainText(input: string | null | undefined): string {
  const value = input ?? '';
  const trimmed = value.trim();
  // 快路径：不含 HTML 特征字符的原样返回（GitHub API 多数 body 本就是 markdown 纯文本）。
  if (!trimmed || !/[<>&]/.test(trimmed)) return value;
  if (typeof DOMParser === 'undefined') return value;
  try {
    const doc = new DOMParser().parseFromString(trimmed, 'text/html');
    doc.querySelectorAll('script, style').forEach(node => node.remove());
    const blocks = Array.from(doc.body.querySelectorAll(BLOCK_SELECTOR))
      // 只取最外层块：blockquote 内的 p 已由 blockquote 的 textContent 覆盖，避免重复。
      .filter(node => !node.parentElement?.closest(BLOCK_SELECTOR));
    const lines = blocks
      .map(node => (node.textContent || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    if (lines.length) return lines.join('\n');
    // 没有任何块级结构（内联片段）时退回整体文本。
    return (doc.body.textContent || '').trim();
  } catch {
    return value;
  }
}
