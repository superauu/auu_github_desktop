import { executeGit } from './GitExecutor';
import { useSettingsStore } from '@/stores/settingsStore';

/** numstat 一行：二进制文件增删行为 null。路径为补丁内的原始路径表达（含重命名形态）。 */
export interface PatchNumstat {
  file: string;
  additions: number | null;
  deletions: number | null;
}

export interface PatchPreview {
  files: PatchNumstat[];
  totalAdditions: number;
  totalDeletions: number;
  binaryCount: number;
}

const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

async function invokeCommand<T>(command: string, args: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(command, args);
}

/** `git apply --numstat` 输出：`<add>\t<delete>\t<path>`，二进制行 add/delete 为 `-`。 */
export function parseNumstat(stdout: string): PatchPreview {
  const files: PatchNumstat[] = [];
  let totalAdditions = 0;
  let totalDeletions = 0;
  let binaryCount = 0;
  for (const rawLine of stdout.split(/\r?\n/)) {
    if (!rawLine.trim()) continue;
    const tabs = rawLine.split('\t');
    if (tabs.length < 3) continue;
    const additions = tabs[0] === '-' ? null : Number(tabs[0]);
    const deletions = tabs[1] === '-' ? null : Number(tabs[1]);
    const file = tabs.slice(2).join('\t');
    if (additions === null || deletions === null) binaryCount += 1;
    else {
      totalAdditions += additions;
      totalDeletions += deletions;
    }
    files.push({ file, additions, deletions });
  }
  return { files, totalAdditions, totalDeletions, binaryCount };
}

/**
 * 补丁导出/导入。导出走 format-patch --stdout（策略强制，绝不向磁盘写文件），
 * 落盘由用户经保存对话框显式确认；导入走 apply（改动进工作区，用户审查后自行提交），
 * 预览用 --numstat。补丁文本经 stdin 传递（与行级暂存的 apply 通道一致）。
 */
export const patchService = {
  /** 系统文件对话框选补丁文件；浏览器开发模式无对话框，返回 null。 */
  async pickPatchFile(): Promise<string | null> {
    if (!isTauri()) return null;
    return invokeCommand<string | null>('pick_patch_file', { language: useSettingsStore.getState().language });
  },

  /** 系统保存对话框确定落盘位置；浏览器开发模式返回 null。 */
  async pickPatchSavePath(defaultName: string): Promise<string | null> {
    if (!isTauri()) return null;
    return invokeCommand<string | null>('pick_patch_save_path', { language: useSettingsStore.getState().language, defaultName });
  },

  async readPatchFile(path: string): Promise<string> {
    return invokeCommand<string>('read_patch_file', { path });
  },

  async writePatchFile(path: string, content: string): Promise<void> {
    return invokeCommand<void>('write_patch_file', { path, content });
  },

  /** 导出单个提交为补丁文本（--stdout，不落盘）。 */
  async exportCommitPatch(repoPath: string, hash: string, count = 1): Promise<string> {
    const res = await executeGit(['format-patch', `-${count}`, '--stdout', hash], repoPath);
    return res.stdout;
  },

  /** 预览补丁影响（apply --numstat，stdin 传补丁，不改动任何文件）。 */
  async previewPatch(repoPath: string, patch: string): Promise<PatchPreview> {
    const res = await executeGit(['apply', '--numstat', '-'], repoPath, patch);
    return parseNumstat(res.stdout);
  },

  /** 应用补丁到工作区（不建提交，用户在变更页审查后自行提交）。 */
  async applyPatch(repoPath: string, patch: string): Promise<void> {
    await executeGit(['apply', '--whitespace=nowarn', '-'], repoPath, patch);
  },
};
