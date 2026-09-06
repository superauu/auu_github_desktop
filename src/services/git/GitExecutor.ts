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
    super(`Git 执行失败 (退出码 ${exitCode}): ${stderr || stdout || '未知错误'}`);
    this.name = 'GitExecutionError';
    this.exitCode = exitCode;
    this.stdout = stdout;
    this.stderr = stderr;
    this.command = command;
  }
}

export async function executeGit(args: string[], cwd: string): Promise<GitCommandResult> {
  // Check if running inside Tauri 2 desktop window
  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

  if (isTauri) {
    try {
      const { Command } = await import('@tauri-apps/plugin-shell');
      const cmd = Command.create('git', args, { cwd });
      const output = await cmd.execute();
      if (output.code !== 0) {
        throw new GitExecutionError(
          `git ${args.join(' ')}`,
          output.code ?? 1,
          output.stdout,
          output.stderr
        );
      }
      return {
        exitCode: output.code ?? 0,
        stdout: output.stdout,
        stderr: output.stderr,
      };
    } catch (err: any) {
      if (err instanceof GitExecutionError) throw err;
      console.warn('Tauri Git Shell 调用降级为 HTTP 中间件:', err);
    }
  }

  // Fallback to local dev server /api/git endpoint
  try {
    const res = await fetch('/api/git', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ args, cwd }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text}`);
    }

    const data: GitCommandResult = await res.json();
    if (data.exitCode !== 0) {
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
    throw new GitExecutionError(`git ${args.join(' ')}`, -1, '', err.message || '网络连接或执行异常');
  }
}
