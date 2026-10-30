import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { validateGitArguments } from './git-policy.ts';

const oid = (value: string) => /^(?:[a-f\d]{40}|[a-f\d]{64})$/i.test(value);
export function validateTempIndexArguments(args: string[], tree: unknown): asserts tree is string {
  if (typeof tree !== 'string' || (tree !== 'empty' && !oid(tree))) throw new Error('Invalid temporary index tree');
  const { index } = validateGitArguments(args), rest = args.slice(index);
  const exact = (...values: string[]) => JSON.stringify(rest) === JSON.stringify(values);
  if (exact('write-tree') || exact('apply', '--cached', '--whitespace=nowarn', '-') || rest.length === 3 && rest[0] === 'commit' && rest[1] === '-m'
    || rest.length === 5 && rest[0] === 'restore' && rest[1] === '--staged' && rest[2].startsWith('--source=') && oid(rest[2].slice(9)) && rest[3] === '--pathspec-from-file=-' && rest[4] === '--pathspec-file-nul') return;
  throw new Error('Unsupported temporary index command');
}

export async function runWithTempIndex(binary: string, args: string[], cwd: string, stdin: string | undefined, tree: string, signal: AbortSignal) {
  validateTempIndexArguments(args, tree);
  const base = await fs.realpath(os.tmpdir()), directory = await fs.mkdtemp(path.join(base, 'auugit-index-'));
  const cleanupAllowed = path.dirname(directory) === base && path.basename(directory).startsWith('auugit-index-');
  const index = path.join(directory, 'index');
  const run = (args: string[], input = '') => new Promise<{ exitCode: number; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(binary, args, { cwd, windowsHide: true, signal,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never', GIT_ALLOW_PROTOCOL: 'https:http:ssh', GIT_INDEX_FILE: index },
    });
    let stdout = '', stderr = '', size = 0, failure: Error | undefined;
    const timer = setTimeout(() => { failure = new Error('Git command timed out'); child.kill(); }, 15 * 60_000);
    for (const [stream, name] of [[child.stdout, 'stdout'], [child.stderr, 'stderr']] as const) {
      stream.setEncoding('utf8');
      stream.on('data', (chunk: string) => {
        size += Buffer.byteLength(chunk);
        if (size > 32 * 1024 * 1024) { failure = new Error('Git output too large'); child.kill(); return; }
        if (name === 'stdout') stdout += chunk; else stderr += chunk;
      });
    }
    child.stdin.on('error', () => {});
    child.on('error', error => { failure = error; });
    child.on('close', code => { clearTimeout(timer); if (failure) reject(failure); else resolve({ exitCode: code ?? -1, stdout, stderr }); });
    child.stdin.end(input);
  });
  try {
    const initialized = await run(['read-tree', tree === 'empty' ? '--empty' : tree]);
    if (initialized.exitCode) throw new Error(initialized.stderr || 'Unable to initialize temporary index');
    const result = await run(args, stdin);
    if (result.exitCode) return result;
    const snapshot = await run(['write-tree']);
    if (snapshot.exitCode) throw new Error(snapshot.stderr || 'Unable to snapshot temporary index');
    return { ...result, indexTree: snapshot.stdout.trim() };
  } finally {
    if (cleanupAllowed) await fs.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
  }
}
