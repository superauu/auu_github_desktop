import { useSettingsStore } from '@/stores/settingsStore';
import { tNow } from '@/i18n';
import { getGitCommand, GitQueueCancelledError, isReadOnlyGitCommand, serializeGitWrite, updateGitWriteCommand } from './GitQueue';
import { useToastStore } from '@/stores/toastStore';
import { authorizeGitBinary } from '@/services/fs/RepositoryAccess';

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

export async function executeGit(args: string[], cwd: string, stdin?: string): Promise<GitCommandResult> {
  if (isReadOnlyGitCommand(args)) return executeGitNow(args, cwd, stdin);
  const started = Date.now();
  const command = getGitCommand(args);
  try {
    const result = await serializeGitWrite(cwd, () => executeGitNow(args, cwd, stdin), command);
    recordGitOperation(command, cwd, started);
    return result;
  } catch (error) {
    recordGitOperation(command, cwd, started, error, command === 'fetch' ? async () => { await executeGit(args, cwd, stdin); } : undefined);
    throw error;
  }
}

/** Keep preflight, recovery refs and the operation in one application write queue. */
export async function executeGitTransaction<T>(cwd: string, run: (git: (args: string[], stdin?: string) => Promise<GitCommandResult>) => Promise<T>): Promise<T> {
  const started = Date.now();
  let command = 'transaction';
  try {
    const result = await serializeGitWrite(cwd, () => run((args, stdin) => {
      if (!isReadOnlyGitCommand(args)) command = getGitCommand(args);
      updateGitWriteCommand(cwd, getGitCommand(args));
      return executeGitNow(args, cwd, stdin);
    }));
    recordGitOperation(command, cwd, started);
    return result;
  } catch (error) { recordGitOperation(command, cwd, started, error); throw error; }
}

function recordGitOperation(command: string, repoPath: string, started: number, error?: unknown, retry?: () => Promise<void>) {
  const cancelled = error instanceof GitQueueCancelledError;
  useToastStore.getState().record({ type: error ? cancelled ? 'info' : 'error' : 'success', repoPath,
    elapsedMs: Date.now() - started, title: `Git · ${command}`,
    description: error ? error instanceof Error ? error.message : String(error) : tNow('operationLog.completed'),
    action: retry && !cancelled ? { label: tNow('operationLog.retryFetch'), onClick: retry } : undefined });
}

async function executeGitNow(args: string[], cwd: string, stdin?: string): Promise<GitCommandResult> {
  const customPath = useSettingsStore.getState().gitCliPath?.trim() || 'git';

  // Check if running inside Tauri 2 desktop window
  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

  if (isTauri) {
    try {
      await authorizeGitBinary(customPath);
      const { invoke } = await import('@tauri-apps/api/core');
      // 关闭 quotepath，避免中文等非 ASCII 路径被转义成八进制无法显示和操作
      const result = await invoke<GitCommandResult>('execute_git', {
        args: ['-c', 'core.quotepath=false', ...args],
        cwd,
        gitBinary: customPath,
        stdin,
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
        'X-AuuGit-Request': '1',
      },
      body: JSON.stringify({
        args: ['-c', 'core.quotepath=false', ...args],
        cwd,
        gitBinary: customPath,
        stdin,
      }),
    });

    const rawText = await res.text();
    // 防御 SPA HTML 路由 fallback 导致的 JSON 解析崩溃
    if (rawText.trim().startsWith('<') || rawText.includes('<!DOCTYPE') || rawText.includes('<!doctype')) {
      throw new Error(tNow('err.noBackendProxy'));
    }

    if (!res.ok) {
      try {
        const error = JSON.parse(rawText);
        if (error.errorCode === 'REPOSITORY_DIRECTORY_UNAVAILABLE') {
          throw new GitExecutionError(`git ${args.join(' ')}`, -1, '', tNow('remote.directoryUnavailable').replace('{path}', cwd));
        }
      } catch (error) { if (error instanceof GitExecutionError) throw error; }
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
