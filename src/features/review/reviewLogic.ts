/**
 * 审查视图纯函数层:风险发现与 AI 作者识别。无 React、无网络依赖,便于单测。
 * 风险发现只做「疑似」标注(零漏报优先,容忍误报),永不阻断或删除任何内容。
 */

export interface ReviewFileSummary {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed';
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
