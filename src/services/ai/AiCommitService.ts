import { requestAiText } from './AiClient';
import { tNow } from '@/i18n';
import { gitService } from '@/services/git/GitService';
import type { GitFileChange } from '@/services/git/types';
import type { AiApiConfig } from '@/stores/settingsStore';

export interface GenerateCommitOptions {
  repoPath: string;
  files: GitFileChange[];
  aiConfig: AiApiConfig;
}

export interface GenerationResult {
  message: string;
  source: 'builtin' | 'llm';
  model?: string;
  fallback: boolean;
}

export class AiCommitService {
  /**
   * 综合生成智能 Commit 说明：
   * 1. 采集并分析修改的文件及实际 Git Diff 内容
   * 2. 若配置了大模型 API Key，则尝试通过 OpenAI 兼容接口生成
   * 3. 若无 API Key 或大模型调用超时/失败，则由本地规则引擎生成
   */
  async generateCommitMessage(options: GenerateCommitOptions): Promise<string> {
    return (await this.generateCommitMessageResult(options)).message;
  }

  async generateCommitMessageResult(options: GenerateCommitOptions): Promise<GenerationResult> {
    const { repoPath, files, aiConfig } = options;

    if (!files || files.length === 0) {
      throw new Error(tNow('err.aiNoFiles'));
    }

    // 1. 采集主要文件的 Diff 内容
    const diffSnippets = await this.collectDiffSnippets(repoPath, files.slice(0, 8));

    // 2. 尝试调用外部大模型
    if (aiConfig.provider === 'openai-compatible' && aiConfig.apiKey.trim()) {
      try {
        const llmMessage = await this.callLlmApi(files, diffSnippets, aiConfig);
        if (llmMessage && llmMessage.trim()) {
          return { message: llmMessage.trim(), source: 'llm', model: aiConfig.model || 'deepseek-chat', fallback: false };
        }
      } catch (err: any) {
        console.warn('AI 大模型 API 调用失败，自动降级为本地规则引擎:', err?.message || err);
      }
    }

    // 3. 本地规则分析引擎
    return { message: this.generateLocalSemanticCommit(files, diffSnippets), source: 'builtin', fallback: aiConfig.provider === 'openai-compatible' };
  }

  /**
   * 生成分支间对比的 PR 描述（Markdown 正文）：
   * 配置了 API Key 时走大模型，否则降级为本地文件清单模板。
   */
  async generatePRDescription(options: {
    repoPath: string;
    base: string;
    head: string;
    aiConfig: AiApiConfig;
  }): Promise<string> {
    return (await this.generatePRDescriptionResult(options)).message;
  }

  async generatePRDescriptionResult(options: {
    repoPath: string; base: string; head: string; aiConfig: AiApiConfig;
  }): Promise<GenerationResult> {
    const { repoPath, base, head, aiConfig } = options;
    const { files, patchText } = await gitService.getBranchDiff(repoPath, base, head);
    if (files.length === 0) {
      throw new Error(tNow('pr.aiNoDiff'));
    }

    if (aiConfig.provider === 'openai-compatible' && aiConfig.apiKey.trim()) {
      try {
        const body = await this.callPrLlm(files, patchText, aiConfig);
        if (body && body.trim()) return { message: body.trim(), source: 'llm', model: aiConfig.model || 'deepseek-chat', fallback: false };
      } catch (err: any) {
        console.warn('AI PR 描述生成失败，降级本地模板:', err?.message || err);
      }
    }
    return { message: this.localPRBody(files, base, head), source: 'builtin', fallback: aiConfig.provider === 'openai-compatible' };
  }

  private async callPrLlm(
    files: GitFileChange[],
    patchText: string,
    aiConfig: AiApiConfig
  ): Promise<string> {

    const fileListText = files
      .map((f) => `- [${f.status}] ${f.path}`)
      .slice(0, 20)
      .join('\n');

    const systemPrompt = [
      '你是一个资深的软件工程师与技术文档作者。',
      '请根据分支差异的文件列表与代码 Diff 片段，为 Pull Request 撰写高质量的 Markdown 描述。',
      '要求：',
      '1. 以一句概括本次变更目的的话开头；',
      '2. 使用"## 主要变更"小节，用无序列表列出 2~5 条核心改动点；',
      '3. 如有风险或需要注意的事项，追加"## 注意事项"小节；',
      '4. 与代码同语言（提交信息为中文则输出中文，为英文则输出英文）；',
      '5. 直接输出 Markdown 正文，不要包含问候语或代码块包裹符号。',
    ].join('\n');

    const userPrompt = [
      `变更文件列表 (${files.length} 个文件):`,
      fileListText,
      '代码变更摘录:',
      patchText || '(无代码增量摘录)',
    ].join('\n\n');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      let content = await requestAiText(aiConfig, [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ], { signal: controller.signal, temperature: 0.3 });

      // 剥离可能包裹的 ``` 或 ```markdown（用字符串切割避免正则歧义）
      const fence = String.fromCharCode(96).repeat(3);
      if (content.includes(fence)) {
        content = content.split(fence).join('');
      }
      content = content.trim();
      return content;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /** 本地模板兜底：无 API Key 时生成结构化文件清单 */
  private localPRBody(files: GitFileChange[], base: string, head: string): string {
    const group = (label: string, list: GitFileChange[]) =>
      list.length > 0
        ? `${label}\n${list.map((f) => `- ${f.path}`).join('\n')}\n`
        : '';

    const added = files.filter((f) => f.status === 'added');
    const deleted = files.filter((f) => f.status === 'deleted');
    const modified = files.filter((f) => f.status === 'modified' || f.status === 'renamed');

    const summary = `${tNow('pr.aiLocalSummary')} **${base}...${head}** (${files.length} ${tNow('pr.aiFilesCount')}):\n\n`;
    return (
      summary +
      group(tNow('pr.aiGroupAdded'), added) +
      group(tNow('pr.aiGroupModified'), modified) +
      group(tNow('pr.aiGroupDeleted'), deleted)
    ).trim();
  }

  /**
   * 收集文件的真实 diff 文本切片
   */
  private async collectDiffSnippets(
    repoPath: string,
    targetFiles: GitFileChange[]
  ): Promise<Array<{ path: string; status: string; diffText: string; addedSymbols: string[] }>> {
    const results: Array<{ path: string; status: string; diffText: string; addedSymbols: string[] }> = [];

    for (const file of targetFiles) {
      try {
        const isUntracked = file.status === 'untracked';
        const isStaged = file.staged;
        const diffLines = await gitService.getFileDiff(repoPath, file.path, isStaged, isUntracked);

        const addedLines: string[] = [];
        const addedSymbols: string[] = [];

        if (Array.isArray(diffLines)) {
          for (const line of diffLines) {
            const content = line.content || '';
            if (line.type === 'add' || content.startsWith('+')) {
              const clean = content.replace(/^\+/, '').trim();
              if (clean) {
                addedLines.push(clean);
                // 提取函数、类、组件定义名
                const match = clean.match(/(?:export\s+)?(?:const|function|class|interface|type)\s+([A-Za-z0-9_$]+)/);
                if (match && match[1] && !addedSymbols.includes(match[1])) {
                  addedSymbols.push(match[1]);
                }
              }
            }
          }
        }

        const diffSummary = addedLines.slice(0, 20).join('\n');
        results.push({
          path: file.path,
          status: file.status,
          diffText: diffSummary,
          addedSymbols,
        });
      } catch (e) {
        // 读取单个 diff 出错不阻断
        results.push({
          path: file.path,
          status: file.status,
          diffText: '',
          addedSymbols: [],
        });
      }
    }

    return results;
  }

  /**
   * 使用配置的 API 协议生成提交说明。
   */
  private async callLlmApi(
    files: GitFileChange[],
    diffSnippets: Array<{ path: string; status: string; diffText: string; addedSymbols: string[] }>,
    aiConfig: AiApiConfig
  ): Promise<string> {

    const fileListText = files
      .map((f) => `- [${f.status}] ${f.path}`)
      .slice(0, 15)
      .join('\n');

    const diffsText = diffSnippets
      .filter((s) => s.diffText.length > 0)
      .map((s) => `--- File: ${s.path} ---\n${s.diffText.slice(0, 600)}`)
      .join('\n\n');

    const systemPrompt = `你是一个资深的 Git 工程师与技术架构师。
请根据提供的文件变更列表与代码 Diff 片段，按照 Conventional Commits 规范生成高质量的 Git Commit Message。
格式规范：
<type>(<scope>): <简明摘要描述(中文或英文)>

[可选的变动细节要点列举]

要求：
1. type 必须是 feat, fix, docs, style, refactor, perf, test, chore 之一；
2. scope 提取主要改动的模块名；
3. 第一行标题简短明了；
4. 若有重要变更，空一行后使用无序列表列出 1~3 条核心要点；
5. 直接输出提交信息本身，严禁包含任何 Markdown 解释、问候语或代码块包裹符号（如 \`\`\`）。`;

    const userPrompt = `变更文件列表 (${files.length} 个文件):\n${fileListText}\n\n代码变更摘录:\n${diffsText || '(无代码增量摘录)'}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      let content = await requestAiText(aiConfig, [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ], { signal: controller.signal, temperature: 0.2 });

      // 过滤包裹的 ``` 或 ```markdown
      content = content.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
      return content;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * 本地规则分析引擎
   */
  private generateLocalSemanticCommit(
    files: GitFileChange[],
    diffSnippets: Array<{ path: string; status: string; diffText: string; addedSymbols: string[] }>
  ): string {
    const paths = files.map((f) => f.path.replace(/\\/g, '/').toLowerCase());

    // 1. 计算 Type 与 Scope
    let type = 'chore';
    let scope = 'core';

    const hasNewFiles = files.some((f) => f.status === 'untracked' || f.status === 'added');
    const isDocOnly = paths.every((p) => p.endsWith('.md') || p.includes('doc') || p.includes('readme'));
    const isStyleOnly = paths.every((p) => p.endsWith('.css') || p.endsWith('.scss') || p.includes('theme'));
    const isTestOnly = paths.every((p) => p.includes('test') || p.includes('spec'));
    const hasBugFix = paths.some((p) => p.includes('fix') || p.includes('bug')) ||
      diffSnippets.some((s) => /fix|error|bug|resolve|catch/i.test(s.diffText));

    if (isDocOnly) {
      type = 'docs';
      scope = 'docs';
    } else if (isStyleOnly) {
      type = 'style';
      scope = 'ui';
    } else if (isTestOnly) {
      type = 'test';
      scope = 'test';
    } else if (hasBugFix) {
      type = 'fix';
    } else if (hasNewFiles) {
      type = 'feat';
    } else {
      type = 'feat';
    }

    // 提取主要 scope
    if (paths.some((p) => p.includes('pr') || p.includes('pullrequest'))) {
      scope = 'pr';
    } else if (paths.some((p) => p.includes('dialog') || p.includes('modal') || p.includes('setting'))) {
      scope = 'settings';
    } else if (paths.some((p) => p.includes('git') || p.includes('repo'))) {
      scope = 'git';
    } else if (paths.some((p) => p.includes('layout') || p.includes('sidebar') || p.includes('pane'))) {
      scope = 'layout';
    } else if (paths.some((p) => p.includes('store') || p.includes('state'))) {
      scope = 'store';
    } else if (paths.some((p) => p.includes('service') || p.includes('api'))) {
      scope = 'service';
    } else {
      const parts = paths[0].split('/');
      scope = parts.length > 2 ? parts[1] : 'workspace';
    }

    // 提取高价值的符号名称
    const keySymbols = diffSnippets.flatMap((s) => s.addedSymbols).filter(Boolean);
    const mainSymbol = keySymbols.length > 0 ? keySymbols[0] : '';

    // 生成提交标题
    const fileBasenames = files
      .slice(0, 3)
      .map((f) => f.path.split(/[\\/]/).pop() || f.path);

    let summary = '';
    if (mainSymbol) {
      summary = `实现与完善 ${mainSymbol} 相关逻辑`;
    } else if (type === 'docs') {
      summary = `更新文档与说明文件`;
    } else if (type === 'style') {
      summary = `优化界面布局与样式表现`;
    } else if (type === 'fix') {
      summary = `修复 ${fileBasenames[0]} 中的异常与逻辑问题`;
    } else {
      summary = `更新 ${fileBasenames.join(', ')}${files.length > 3 ? ` 及另外 ${files.length - 3} 个文件` : ''}`;
    }

    const titleLine = `${type}(${scope}): ${summary}`;

    // 生成详细要点
    const detailPoints: string[] = [];
    for (const file of files.slice(0, 5)) {
      const baseName = file.path.split(/[\\/]/).pop();
      const statusLabel =
        file.status === 'added' || file.status === 'untracked'
          ? '新增'
          : file.status === 'deleted'
          ? '移除'
          : '修改';
      detailPoints.push(`- ${statusLabel} ${baseName}`);
    }

    if (files.length > 5) {
      detailPoints.push(`- 及其余 ${files.length - 5} 处文件改动`);
    }

    return `${titleLine}\n\n${detailPoints.join('\n')}`;
  }
}

export const aiCommitService = new AiCommitService();
