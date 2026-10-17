import ignore from 'ignore';
import { executeGit, GitExecutionError } from './GitExecutor';
import { gitService } from './GitService';
import { serializeGitWrite } from './GitQueue';
import { useSettingsStore } from '@/stores/settingsStore';

export type IgnoreScope = 'shared' | 'local';
export type IgnoreMode = 'file' | 'typeHere' | 'typeTree' | 'typeAll' | 'directory' | 'custom';
export interface IgnoreSnapshot { scope: IgnoreScope; content: string; exists?: boolean }
export interface IgnorePreview { untracked: string[]; tracked: string[]; selectedNotIgnored: string[] }

// Anchor concrete paths and escape wildmatch metacharacters, including trailing spaces.
export function escapeIgnorePath(path: string): string {
  if (!path || /[\r\n\0]/.test(path) || path.startsWith('/') || /^[a-z]:/i.test(path) || path.split('/').some(p => p === '..' || p === '.git')) {
    throw new Error('Invalid repository file path');
  }
  return path.replace(/[\\*?\[\]#! ]/g, '\\$&');
}

export function fileExtension(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const archive = name.match(/\.tar\.(?:gz|bz2|xz|zst)$/i);
  if (archive) return archive[0];
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot) : '';
}

export function buildIgnoreRules(paths: string[], mode: IgnoreMode, custom = ''): string[] {
  if (mode === 'custom') {
    if (custom.includes('\0')) throw new Error('Ignore rules cannot contain NUL characters');
    return custom.split(/\r?\n/).filter(Boolean);
  }
  return [...new Set(paths.flatMap(path => {
    const escaped = escapeIgnorePath(path);
    const slash = escaped.lastIndexOf('/');
    const directory = slash < 0 ? '' : escaped.slice(0, slash + 1);
    const extension = fileExtension(path);
    if (mode === 'file') return ['/' + escaped];
    if (mode === 'directory') return directory ? ['/' + directory] : [];
    if (!extension) return [];
    const suffix = '*' + escapeIgnorePath(extension);
    if (mode === 'typeAll') return [suffix];
    return ['/' + directory + (mode === 'typeTree' ? '**/' : '') + suffix];
  }))];
}

export function appendIgnoreRules(content: string, rules: string[]): string {
  const existing = content.replace(/^\uFEFF/, '').split(/\r?\n/);
  const additions: string[] = [];
  for (const rule of rules) {
    const last = existing.lastIndexOf(rule);
    // Repeating a rule after an intervening exception is meaningful in Git.
    if (last >= 0 && !existing.slice(last + 1).some(line => line && !line.startsWith('#') && line.startsWith('!') !== rule.startsWith('!'))) continue;
    additions.push(rule); existing.push(rule);
  }
  if (!additions.length) return content;
  const newline = content.includes('\r\n') ? '\r\n' : '\n';
  const separator = content && !content.endsWith('\n') ? newline : '';
  return content + separator + additions.join(newline) + newline;
}

async function ignoreFile(repoPath: string, scope: IgnoreScope, content?: string, expectedContent?: string, remove = false): Promise<{ content: string; exists: boolean }> {
  const args = { repoPath, scope, content, expectedContent, remove, gitBinary: useSettingsStore.getState().gitCliPath?.trim() || 'git' };
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke('ignore_file', args);
  }
  const response = await fetch('/api/fs/ignore-file', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-AuuGit-Request': '1' }, body: JSON.stringify(args),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to update ignore rules');
  return data;
}

export async function readIgnoreFile(repoPath: string, scope: IgnoreScope): Promise<IgnoreSnapshot> {
  return { scope, ...await ignoreFile(repoPath, scope) };
}

export async function saveIgnoreFile(repoPath: string, snapshot: IgnoreSnapshot, content: string): Promise<void> {
  await serializeGitWrite(repoPath, () => ignoreFile(repoPath, snapshot.scope, content, snapshot.content));
}

export async function previewIgnore(repoPath: string, scope: IgnoreScope, content: string, selected: string[] = []): Promise<IgnorePreview> {
  const [untrackedResult, trackedResult, other, ignoreCase] = await Promise.all([
    executeGit(['ls-files', '--others', '--exclude-standard', '-z'], repoPath),
    executeGit(['ls-files', '--cached', '-z'], repoPath),
    readIgnoreFile(repoPath, scope === 'shared' ? 'local' : 'shared'),
    executeGit(['config', '--bool', '--get', 'core.ignorecase'], repoPath).then(result => result.stdout.trim() === 'true').catch(error => {
      if (error instanceof GitExecutionError && error.exitCode === 1) return false;
      throw error;
    }),
  ]);
  const untracked = untrackedResult.stdout.split('\0').filter(Boolean);
  const tracked = [...new Set(trackedResult.stdout.split('\0').filter(Boolean))];
  const all = [...new Set([...untracked, ...tracked, ...selected])];
  const shared = scope === 'shared' ? content : other.content;
  const local = scope === 'local' ? content : other.content;
  const root = ignore({ ignorecase: ignoreCase }).add(local.replace(/^\uFEFF/, '')).add(shared.replace(/^\uFEFF/, ''));
  const directories = new Set<string>();
  all.forEach(path => {
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) directories.add(parts.slice(0, i).join('/'));
  });
  const nested = new Map<string, ReturnType<typeof ignore>>();
  // Limit parallel file reads for repositories with many directories.
  const pending = [...directories];
  await Promise.all(Array.from({ length: Math.min(8, pending.length) }, async () => {
    while (pending.length) {
      const directory = pending.pop()!;
      nested.set(directory, ignore({ ignorecase: ignoreCase }).add(await gitService.readWorkingFile(repoPath, directory + '/.gitignore', true)));
    }
  }));
  const matches = (path: string) => {
    const parts = path.split('/');
    for (let depth = 1; depth <= parts.length; depth++) {
      const candidate = parts.slice(0, depth).join('/') + (depth < parts.length ? '/' : '');
      let ignored = root.test(candidate).ignored;
      for (let ancestor = 1; ancestor < depth; ancestor++) {
        const rules = nested.get(parts.slice(0, ancestor).join('/'));
        const result = rules?.test(parts.slice(ancestor, depth).join('/') + (depth < parts.length ? '/' : ''));
        if (result?.ignored) ignored = true;
        else if (result?.unignored) ignored = false;
      }
      if (ignored) return true; // Git cannot reinclude a file inside an excluded directory.
    }
    return false;
  };
  return { untracked: untracked.filter(matches), tracked: tracked.filter(matches), selectedNotIgnored: selected.filter(path => !matches(path)) };
}

export async function checkIgnore(repoPath: string, paths: string[]): Promise<string> {
  if (!paths.length) return '';
  paths.forEach(escapeIgnorePath);
  try { return (await executeGit(['check-ignore', '-v', '--no-index', '-z', '--stdin'], repoPath, paths.join('\0') + '\0')).stdout; }
  catch (error) {
    if (error instanceof GitExecutionError && error.exitCode === 1) return '';
    throw error;
  }
}

// Preserve later appended rules. Other edits require manual review rather than guessing.
export async function undoIgnore(repoPath: string, before: IgnoreSnapshot, after: string): Promise<void> {
  await serializeGitWrite(repoPath, async () => {
    const current = await ignoreFile(repoPath, before.scope);
    if (current.content === after) {
      await ignoreFile(repoPath, before.scope, before.content, after, before.exists === false);
    } else if (after.startsWith(before.content) && current.content.startsWith(after)) {
      const rest = current.content.slice(after.length);
      const separator = before.content && !before.content.endsWith('\n') && rest && !rest.startsWith('\n') ? (after.includes('\r\n') ? '\r\n' : '\n') : '';
      await ignoreFile(repoPath, before.scope, before.content + separator + rest, current.content);
    } else throw new Error('Ignore rules changed on disk; reload before undoing');
  });
}
