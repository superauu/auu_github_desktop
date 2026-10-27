/**
 * 审查视图纯函数层:风险发现与 AI 作者识别。无 React、无网络依赖,便于单测。
 * 风险发现只做「疑似」标注(零漏报优先,容忍误报),永不阻断或删除任何内容。
 */

export interface ReviewFileSummary {
  path: string;
  status: string;
  insertions?: number;
  deletions?: number;
}

export type ReviewRiskKind = 'secret' | 'envFile' | 'massDeletion' | 'dependency' | 'ci' | 'binary';
export type ReviewRiskSeverity = 'high' | 'medium';

export interface ReviewRiskFinding {
  kind: ReviewRiskKind;
  severity: ReviewRiskSeverity;
  files: string[];
}

/** 已知密钥形态;对「新增行」逐行匹配,删除行不构成推送风险。私钥头单独优先判定。 */
const PRIVATE_KEY_HEADER = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/;
const SECRET_LINE_PATTERNS: RegExp[] = [
  PRIVATE_KEY_HEADER,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{16,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{18,}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
  /\bAIza[0-9A-Za-z_-]{35}\b/,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/,
  /(api[_-]?key|apikey|secret|token|passwd|password|pwd)\s*[:=]\s*['"]?[A-Za-z0-9+/_=-]{16,}/i,
];

/** 明显的占位/引用形态,不计为疑似密钥(模板示例、环境变量读取、测试桩)。 */
const SECRET_PLACEHOLDER = /your[_-]|example|placeholder|changeme|change[_-]?me|dummy|\bxxx+\b|\*\*\*|<[^>\n]+>|\{\{|\$\{|process\.env|import\.meta\.env|os\.environ|getenv|-{4,}|_{4,}/i;

const ENV_FILE = /(^|\/)\.env(\.[^/]+)?$/i;
const ENV_TEMPLATE = /(^|\/)\.env\.(example|sample|template|dist)$/i;
const DEPENDENCY_FILE = /(^|\/)(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb|Cargo\.toml|Cargo\.lock|go\.mod|go\.sum|requirements\.txt|poetry\.lock|Pipfile\.lock|Gemfile\.lock|composer\.lock|pom\.xml|build\.gradle(\.kts)?)$/i;
const CI_FILE = /(^|\/)(\.github\/workflows\/|\.gitlab-ci\.yml|Jenkinsfile|\.circleci\/|azure-pipelines\.yml|\.drone\.yml)/i;
/** 单文件净删除达到该行数且远超新增时标记;整文件删除属于正常清理,不在其列。 */
const MASS_DELETION_MIN_LINES = 100;

/** diff patch 按文件分段;路径优先取 +++ 行(重命名/删除时回退 --- 或留空),added 为该段新增行。 */
function splitPatchSections(patch: string): { path: string; added: string[]; text: string }[] {
  const sections: { path: string; added: string[]; text: string }[] = [];
  let current: { path: string; added: string[]; text: string[] } | null = null;
  for (const line of patch.split('\n')) {
    if (line.startsWith('diff --git ')) {
      if (current) sections.push({ path: current.path, added: current.added, text: current.text.join('\n') });
      current = { path: '', added: [], text: [] };
      continue;
    }
    if (!current) continue;
    if (line.startsWith('+++ ')) {
      const target = line.slice(4).replace(/^b\//, '').replace(/^"|"$/g, '');
      if (target !== '/dev/null') current.path = target;
    } else if (line.startsWith('--- ')) {
      const source = line.slice(4).replace(/^a\//, '').replace(/^"|"$/g, '');
      if (source !== '/dev/null' && !current.path) current.path = source;
    }
    if (line.startsWith('+') && !line.startsWith('+++')) current.added.push(line.slice(1));
    current.text.push(line);
  }
  if (current) sections.push({ path: current.path, added: current.added, text: current.text.join('\n') });
  return sections;
}

export function computeRiskFindings(files: ReviewFileSummary[], patch: string): ReviewRiskFinding[] {
  const secretFiles = new Set<string>();
  const binaryFiles = new Set<string>();
  for (const section of splitPatchSections(patch)) {
    const sectionPath = section.path;
    if (/^GIT binary patch/m.test(section.text) || /^Binary files .+ differ/m.test(section.text)) {
      if (sectionPath) binaryFiles.add(sectionPath);
    }
    for (const added of section.added) {
      // 私钥头自带 ----- 前缀,不受占位符过滤影响。
      const isSecret = PRIVATE_KEY_HEADER.test(added)
        || (!SECRET_PLACEHOLDER.test(added) && SECRET_LINE_PATTERNS.some((pattern) => pattern.test(added)));
      if (isSecret) {
        if (sectionPath) secretFiles.add(sectionPath);
        break;
      }
    }
  }

  const envFiles = files.filter((file) => ENV_FILE.test(file.path) && !ENV_TEMPLATE.test(file.path)).map((file) => file.path);
  const massDeletionFiles = files
    .filter((file) => file.status === 'modified'
      && (file.deletions ?? 0) >= MASS_DELETION_MIN_LINES
      && (file.deletions ?? 0) > 3 * (file.insertions ?? 0))
    .map((file) => file.path);
  const dependencyFiles = files.filter((file) => DEPENDENCY_FILE.test(file.path)).map((file) => file.path);
  const ciFiles = files.filter((file) => CI_FILE.test(file.path)).map((file) => file.path);

  const findings: ReviewRiskFinding[] = [];
  if (secretFiles.size) findings.push({ kind: 'secret', severity: 'high', files: [...secretFiles] });
  if (envFiles.length) findings.push({ kind: 'envFile', severity: 'high', files: envFiles });
  if (massDeletionFiles.length) findings.push({ kind: 'massDeletion', severity: 'medium', files: massDeletionFiles });
  if (dependencyFiles.length) findings.push({ kind: 'dependency', severity: 'medium', files: dependencyFiles });
  if (ciFiles.length) findings.push({ kind: 'ci', severity: 'medium', files: ciFiles });
  if (binaryFiles.size) findings.push({ kind: 'binary', severity: 'medium', files: [...binaryFiles] });
  return findings;
}

/** Co-Authored-By/页脚署名与 AI 服务邮箱后缀的启发式;宁可多标(AI 参与),由人判断。 */
const AI_COAUTHOR = /co-authored-by:[^\n]*(claude|anthropic|openai|\bgpt|copilot|cursor|gemini|codex|devin|deepseek|qwen|kimi|glm|windsurf|junie)/i;
const AI_FOOTER = /generated[- ]with|🤖/i;
const AI_EMAIL = /(anthropic\.com|openai\.com)$/i;

export function detectAiAuthorship(body: string | undefined, email: string): boolean {
  if (AI_EMAIL.test(email.trim())) return true;
  const text = body ?? '';
  return AI_COAUTHOR.test(text) || AI_FOOTER.test(text);
}

// ---- 分级审查:代码块解析、通过进度与面向 AI 的报告 ----

export interface ReviewHunk {
  /** 新起始行(diff 头 +c 的 c),作为稳定的代码块标识 */
  newStart: number;
  /** 新侧行数 */
  count: number;
  /** 在 ParsedDiffLine 数组中的下标(header 行) */
  index: number;
}

const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

/** 从 ParsedDiffLine 列表解析代码块边界(unified/split 共用 header 行)。 */
export function parseHunks(diffLines: { type: string; content: string }[]): ReviewHunk[] {
  const hunks: ReviewHunk[] = [];
  diffLines.forEach((line, index) => {
    if (line.type !== 'header') return;
    const match = HUNK_HEADER.exec(line.content);
    if (match) hunks.push({ newStart: Number(match[1]), count: match[2] === undefined ? 1 : Number(match[2]), index });
  });
  return hunks;
}

export interface ReviewComment {
  id: string;
  path: string;
  /** hunk 注释为新侧行范围;文件级注释两个值为 null */
  startLine: number | null;
  endLine: number | null;
  text: string;
  status?: ReviewCommentStatus;
  /** 当前行号尚未验证,不能在新 diff 中直接挂载。 */
  anchorStale?: boolean;
  /** 创建意见时的不可变位置和代码快照,与当前行号分开保存。 */
  origin?: {
    headHash: string;
    startLine: number | null;
    endLine: number | null;
    context: string;
    fingerprint?: string;
  };
}

export type ReviewCommentStatus = 'open' | 'needsReview' | 'resolved' | 'outdated';
export const commentStatus = (comment: ReviewComment): ReviewCommentStatus => comment.status ?? 'open';

export interface ReviewHunkEvidence {
  startLine: number;
  endLine: number;
  fingerprint: string;
  context: string;
}

export interface ReviewFileEvidence {
  /** Git blob IDs + modes + status;空字符串表示无法验证,不能继承通过状态。 */
  version: string;
  hunks: ReviewHunkEvidence[];
}

/** 通过进度:文件级通过集合 + 代码块级通过记录(按新起始行)。 */
export interface ReviewApproval {
  approvedFiles: string[];
  approvedHunks: Record<string, number[]>;
}

export function isFileApproved(approval: ReviewApproval, path: string): boolean {
  return approval.approvedFiles.includes(path);
}

export function isHunkApproved(approval: ReviewApproval, path: string, newStart: number): boolean {
  return isFileApproved(approval, path) || (approval.approvedHunks[path] ?? []).includes(newStart);
}

/** 代码块级通过是否已覆盖该文件全部代码块(用于自动升级为文件通过)。 */
export function coversAllHunks(approval: ReviewApproval, path: string, hunks: ReviewHunk[]): boolean {
  return hunks.length > 0 && hunks.every((hunk) => isHunkApproved(approval, path, hunk.newStart));
}

/** toggle 单个代码块;返回新状态(不可变)。取消时文件级通过随之降级,其余代码块记录保留。 */
export function toggleHunkApproval(approval: ReviewApproval, path: string, newStart: number): ReviewApproval {
  const approved = isHunkApproved(approval, path, newStart);
  const current = approval.approvedHunks[path] ?? [];
  if (approved) {
    return {
      approvedFiles: approval.approvedFiles.filter((value) => value !== path),
      approvedHunks: { ...approval.approvedHunks, [path]: current.filter((value) => value !== newStart) },
    };
  }
  return {
    approvedFiles: approval.approvedFiles,
    approvedHunks: { ...approval.approvedHunks, [path]: [...current, newStart] },
  };
}

export function toggleFileApproval(approval: ReviewApproval, path: string): ReviewApproval {
  const has = approval.approvedFiles.includes(path);
  return {
    approvedFiles: has ? approval.approvedFiles.filter((value) => value !== path) : [...approval.approvedFiles, path],
    approvedHunks: approval.approvedHunks,
  };
}

export interface ReportLine {
  /** 已翻译的「行 a-b」或「文件整体」标签 */
  location: string;
  text: string;
  context?: string;
}
export interface ReportFile {
  path: string;
  lines: ReportLine[];
}

/**
 * 组装面向 AI 的审查报告:只收录带注释的条目(无注释文件整段省略),文件保持传入顺序。
 * 模板文字(标题/导语)由调用方传入,保证 i18n 与纯函数解耦。
 */
export function buildReviewReport(header: string[], files: ReportFile[]): string {
  const commented = files.filter((file) => file.lines.length > 0);
  if (!commented.length) return '';
  const sections = commented.map((file) => [`## ${file.path}`, ...file.lines.map((line) => [
    `- ${line.location}${line.location ? ':' : ''}${line.text.replace(/\n/g, '\n  ')}`,
    ...(line.context ? ['', ...line.context.split('\n').map((part) => `    ${part}`)] : []),
  ].join('\n'))].join('\n'));
  return [header.join('\n'), '', ...sections, ''].join('\n');
}
