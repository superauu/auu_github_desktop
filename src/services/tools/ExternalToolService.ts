/**
 * 外部 diff/merge 工具集成（F4）——前端服务层。
 *
 * 安全边界（与后端 external_tools.rs 对应）：
 * - 工具配置只存后端拥有的文件（app 数据目录 external-tools.json），本层只做
 *   IPC 镜像读写，绝不把程序路径/参数交给前端持久化。
 * - launch 只传 toolId + mode + repoPath + filePath：后端自查配置、自拼 argv、
 *   不经 shell 直接 spawn。前端校验只是表单层的快速失败，真正的准入判定在 Rust。
 * - 服务层异常消息按项目约定保持英文。
 */
import { normalizeInvokeError } from '@/services/git/invokeError';

export type ExternalToolMode = 'diff' | 'merge';

export interface ExternalToolConfig {
  id: string;
  name: string;
  program: string;
  args: string;
  mode: ExternalToolMode;
}

export interface ExternalToolDraft {
  id?: string;
  name: string;
  program: string;
  args: string;
  mode: ExternalToolMode;
}

/** 与后端 valid_identifier 一致：[a-zA-Z0-9_-]{1,32}。 */
export const TOOL_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

/** git difftool/mergetool 惯例占位符（后端 PLACEHOLDERS）。 */
export const TOOL_PLACEHOLDERS = ['$LOCAL', '$REMOTE', '$BASE', '$MERGED'] as const;

export const isDesktopRuntime = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** 不经 shell：引号/分号/控制字符只会按字面进入目标工具的 argv，配置期直接拒绝。 */
function containsForbiddenCharacters(value: string): boolean {
  if (/["';]/.test(value)) return true;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * 表单校验（客户端快速失败）。返回错误消息（英文，服务层约定），null 表示通过。
 * 注意：program 是否真实存在、模板与模式的占位符匹配度最终由后端裁决，
 * 这里只拦截明显无效的输入，避免一次必然失败的 IPC 往返。
 */
export function validateExternalToolDraft(draft: ExternalToolDraft): string | null {
  if (!draft.name.trim()) return 'Tool name is required';
  if (!TOOL_IDENTIFIER_PATTERN.test(draft.name.trim())) {
    return 'Tool name must be 1-32 characters of letters, digits, "_" or "-"';
  }
  if (draft.mode !== 'diff' && draft.mode !== 'merge') return 'Tool type must be diff or merge';
  if (!draft.program.trim()) return 'Program path is required';
  if (!draft.args.trim()) return 'Arguments template is required';
  if (containsForbiddenCharacters(draft.args)) {
    return 'Arguments template cannot contain quotes, semicolons or control characters';
  }
  for (const placeholder of TOOL_PLACEHOLDERS) {
    const present = draft.args.includes(placeholder);
    if (draft.mode === 'diff' && (placeholder === '$BASE' || placeholder === '$MERGED') && present) {
      return `Diff template cannot use ${placeholder}`;
    }
  }
  if (draft.mode === 'diff' && (!draft.args.includes('$LOCAL') || !draft.args.includes('$REMOTE'))) {
    return 'Diff template must contain $LOCAL and $REMOTE';
  }
  if (draft.mode === 'merge' && !draft.args.includes('$MERGED')) {
    return 'Merge template must contain $MERGED';
  }
  return null;
}

/** 新工具 id：去连字符的 UUID 恰为 32 个十六进制字符，满足后端 identifier 约束。 */
export function newExternalToolId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID().replace(/-/g, '');
  }
  return `tool-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function requireDesktop(): void {
  if (!isDesktopRuntime()) {
    throw new Error('External tools are only available in the desktop app');
  }
}

async function invokeCommand<T>(command: string, args?: Record<string, unknown>, fallback = 'External tool command failed'): Promise<T> {
  requireDesktop();
  const { invoke } = await import('@tauri-apps/api/core');
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw normalizeInvokeError(error, fallback);
  }
}

export const externalToolService = {
  /** 读取后端配置镜像（排序后的完整列表）。 */
  list(): Promise<ExternalToolConfig[]> {
    return invokeCommand<ExternalToolConfig[]>('get_external_tools', undefined, 'Unable to load external tools');
  },

  /** 新增或按 id 覆盖保存，返回后端排序后的完整列表。 */
  save(tool: ExternalToolConfig): Promise<ExternalToolConfig[]> {
    const error = validateExternalToolDraft(tool);
    if (error) return Promise.reject(new Error(error));
    return invokeCommand<ExternalToolConfig[]>('set_external_tool', { tool }, 'Unable to save external tool');
  },

  /** 按 id 删除，返回后端排序后的完整列表。 */
  remove(toolId: string): Promise<ExternalToolConfig[]> {
    return invokeCommand<ExternalToolConfig[]>('remove_external_tool', { toolId }, 'Unable to remove external tool');
  },

  /**
   * 用已登记的外部工具打开文件。mode 决定后端语义：
   * diff = working 文件 vs HEAD 版本；merge = index 三阶段（ours/base/theirs + working）。
   */
  launch(toolId: string, mode: ExternalToolMode, repoPath: string, filePath: string): Promise<void> {
    return invokeCommand<void>('launch_external_tool', { toolId, mode, repoPath, filePath }, 'Unable to launch external tool');
  },
};
