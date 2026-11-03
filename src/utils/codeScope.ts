import type { ParsedDiffLine } from '@/services/git/PorcelainParser';
import { parseDiffHunkHeader } from './diffHunkLabel';

/**
 * 块头展示用的作用域信息（所属函数/方法/类）。
 * 纯展示：不参与任何 Git 操作，识别不出来就返回 null，绝不猜测。
 */
export type ScopeKind = 'function' | 'method' | 'class' | 'type';
export interface CodeScope {
  name: string;
  kind: ScopeKind;
  /** 1 起的声明行；0 表示来源无法定位（例如取自 Git 提取的块头上下文）。 */
  line: number;
}

/** 控制流关键字：`if (x) {` 这类行虽然形似方法声明，但不是作用域。 */
const CONTROL = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'with', 'return', 'else', 'do', 'try', 'finally',
  'new', 'typeof', 'await', 'yield', 'delete', 'void', 'throw', 'case', 'default', 'import', 'export',
]);

/**
 * 声明识别规则，按优先级排列。
 * 语言无关的保守启发式：宁可识别不出，也不把普通表达式当成函数。
 */
const DECLARATIONS: ReadonlyArray<{ kind: ScopeKind; re: RegExp }> = [
  { kind: 'function', re: /(?:^|[^\w$.])(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/ },
  { kind: 'function', re: /(?:^|[^\w$.])(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;]+)?=\s*(?:async\s*)?(?:function\b|\([^()]*\)\s*(?::[^=;]+)?=>|[A-Za-z_$][\w$]*\s*=>)/ },
  { kind: 'class', re: /(?:^|[^\w$.])(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/ },
  { kind: 'type', re: /(?:^|[^\w$.])(?:export\s+)?(?:declare\s+)?(?:interface|enum|namespace|module)\s+([A-Za-z_$][\w$]*)/ },
  { kind: 'type', re: /(?:^|[^\w$.])(?:export\s+)?type\s+([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*=/ },
  { kind: 'function', re: /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)/ },
  { kind: 'class', re: /^\s*class\s+([A-Za-z_]\w*)/ },
  { kind: 'function', re: /^\s*func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)/ },
  { kind: 'function', re: /(?:^|[^\w$.])fn\s+([A-Za-z_]\w*)/ },
  { kind: 'method', re: /^\s*(?:(?:public|private|protected|static|async|readonly|override|abstract|final|virtual|synchronized|suspend)\s+)*\*?\s*([A-Za-z_$][\w$]*)\s*\([^;{}]*\)\s*(?::\s*[^{};]+?)?\s*\{\s*\}?\s*$/ },
];

/** 单行文本是否像一条声明；是则返回名称（行号留给调用方补）。 */
export function matchDeclaration(text: string): CodeScope | null {
  const line = text.trim();
  if (!line) return null;
  for (const { kind, re } of DECLARATIONS) {
    const match = re.exec(line);
    if (!match || CONTROL.has(match[1])) continue;
    return { name: match[1], kind, line: 0 };
  }
  return null;
}

/** 去掉字符串与行注释，避免其中的花括号干扰深度统计（近似处理，够用即可）。 */
function stripLiterals(text: string): string {
  let out = '';
  let quote = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') { i++; continue; }
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '/' && text[i + 1] === '/') break;
    out += ch;
  }
  return out;
}

/** 多行签名（参数跨行）允许的最大向上等待行数。 */
const PENDING_LIMIT = 12;

/**
 * 逐行作用域索引：result[i] 是第 i+1 行所属的最近一层声明。
 * - 有花括号的语言：按花括号深度维护作用域栈；声明先挂起，等到真正开块时入栈，
 *   因此多行参数列表不会丢作用域，JSX 里成对的 `{}` 也不会误弹外层函数。
 * - 无花括号的文件（Python 等）：退化为按缩进判断。
 */
export function buildScopeIndex(lines: readonly string[]): (CodeScope | null)[] {
  const result: (CodeScope | null)[] = new Array(lines.length).fill(null);
  if (!lines.length) return result;
  if (!lines.some(line => line.includes('{'))) return buildIndentScopeIndex(lines, result);

  const stack: { depth: number; scope: CodeScope }[] = [];
  let pending: CodeScope | null = null;
  let pendingAge = 0;
  let depth = 0;

  for (let i = 0; i < lines.length; i++) {
    const text = lines[i];
    while (stack.length && stack[stack.length - 1].depth > depth) stack.pop();
    if (pending && /;\s*$/.test(text)) pending = null;

    const declaration = matchDeclaration(text);
    if (declaration) { pending = { ...declaration, line: i + 1 }; pendingAge = 0; }
    else if (pending && ++pendingAge > PENDING_LIMIT) pending = null;

    const cleaned = stripLiterals(text);
    let delta = 0;
    for (const ch of cleaned) {
      if (ch === '{') delta++;
      else if (ch === '}') delta--;
    }
    if (delta > 0) {
      // 本行开了一个块：把挂起的声明落到这个块上（没有声明就只是匿名块）。
      if (pending) { stack.push({ depth: depth + 1, scope: pending }); pending = null; }
    }
    depth += delta;
    // 自闭合的声明行（如 `other() {}`、单行箭头函数）没有可入栈的块，直接算作自身作用域。
    result[i] = delta === 0 && declaration ? declaration : (stack.length ? stack[stack.length - 1].scope : null);
  }
  return result;
}

/** 缩进作用域（Python 等无花括号文件）：声明覆盖其后缩进更深的行。 */
function buildIndentScopeIndex(lines: readonly string[], result: (CodeScope | null)[]): (CodeScope | null)[] {
  const stack: { indent: number; scope: CodeScope }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i];
    if (!text.trim()) { result[i] = stack.length ? stack[stack.length - 1].scope : null; continue; }
    const indent = text.length - text.trimStart().length;
    while (stack.length && indent <= stack[stack.length - 1].indent) stack.pop();
    const declaration = matchDeclaration(text);
    if (declaration) stack.push({ indent, scope: { ...declaration, line: i + 1 } });
    result[i] = stack.length ? stack[stack.length - 1].scope : null;
  }
  return result;
}

/** 内容属于哪一侧：整文件读取按新侧，删除的文件只能读旧侧。 */
export type DiffContentSide = 'new' | 'old';

/** 内容含新增/上下文行说明有新侧，否则是纯删除（只能看旧侧）。 */
export function diffContentSide(lines: readonly ParsedDiffLine[]): DiffContentSide {
  return lines.some(line => line.newNo != null) ? 'new' : 'old';
}

/** 每个块头下标 → 该块起始行所在的作用域。 */
export function hunkScopes(
  diffLines: readonly ParsedDiffLine[],
  fileLines: readonly string[],
  side: DiffContentSide = 'new',
): Map<number, CodeScope> {
  const scopes = new Map<number, CodeScope>();
  if (!fileLines.length) return scopes;
  const index = buildScopeIndex(fileLines);
  diffLines.forEach((line, lineIndex) => {
    if (line.type !== 'header') return;
    const parsed = parseDiffHunkHeader(line.content);
    if (!parsed) return;
    const target = side === 'new' ? parsed.next.start : parsed.old.start;
    const position = Math.min(Math.max(target, 1), index.length) - 1;
    const scope = index[position];
    if (scope) scopes.set(lineIndex, scope);
  });
  return scopes;
}
