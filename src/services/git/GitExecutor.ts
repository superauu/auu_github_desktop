import { useSettingsStore } from '@/stores/settingsStore';
import { tNow } from '@/i18n';

export interface GitCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export class GitExecutionError extends Error {
  exitCode: number;
  stdout: string;
  stderr: string;
  command: string;

  constructor(command: string, exitCode: number, stdout: string, stderr: string) {
    super(
      tNow('err.gitFailed')
        .replace('{c}', String(exitCode))
        .replace('{m}', stderr || stdout || tNow('err.unknownGit'))
    );
    this.name = 'GitExecutionError';
    this.exitCode = exitCode;
    this.stdout = stdout;
    this.stderr = stderr;
    this.command = command;
  }
}

export async function executeGit(args: string[], cwd: string): Promise<GitCommandResult> {
  const customPath = useSettingsStore.getState().gitCliPath?.trim() || 'git';

  // Check if running inside Tauri 2 desktop window
  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

  if (isTauri) {
    try {
      // 优先通过 Tauri 2 核心 invoke 调用 Rust 原生 execute_git 命令（安全、静默、无权限限制）
      const { invoke } = await import('@tauri-apps/api/core');
      // 关闭 quotepath，避免中文等非 ASCII 路径被转义成八进制无法显示和操作
      const result = await invoke<GitCommandResult>('execute_git', {
        args: ['-c', 'core.quotepath=false', ...args],
        cwd,
        gitBinary: customPath,
      });

      const isDiff = args.includes('diff');
      if (result.exitCode !== 0 && (!isDiff || result.exitCode !== 1)) {
        throw new GitExecutionError(
          `git ${args.join(' ')}`,
          result.exitCode,
          result.stdout,
          result.stderr
        );
      }
      return result;
    } catch (err: any) {
      if (err instanceof GitExecutionError) throw err;
      // 若 invoke 抛出系统错误（如系统中未安装 Git）
      throw new GitExecutionError(`git ${args.join(' ')}`, -1, '', err?.message || String(err));
    }
  }

  // Fallback to local Vite dev server /api/git endpoint (纯浏览器开发模式专用)
  try {
    const res = await fetch('/api/git', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        args: ['-c', 'core.quotepath=false', ...args],
        cwd,
        gitBinary: customPath,
      }),
    });

    const rawText = await res.text();
    // 防御 SPA HTML 路由 fallback 导致的 JSON 解析崩溃
    if (rawText.trim().startsWith('<') || rawText.includes('<!DOCTYPE') || rawText.includes('<!doctype')) {
      throw new Error(tNow('err.noBackendProxy'));
    }

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${rawText}`);
    }

    const data: GitCommandResult = JSON.parse(rawText);
    const isDiff = args.includes('diff');
    if (data.exitCode !== 0 && (!isDiff || data.exitCode !== 1)) {
      throw new GitExecutionError(
        `git ${args.join(' ')}`,
        data.exitCode,
        data.stdout,
        data.stderr
      );
    }

    return data;
  } catch (err: any) {
    if (err instanceof GitExecutionError) throw err;
    throw new GitExecutionError(`git ${args.join(' ')}`, -1, '', err.message || tNow('err.networkExec'));
  }
}
