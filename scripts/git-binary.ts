import fs from 'node:fs';
import path from 'node:path';

/** Trust server configuration and its PATH, never a browser-supplied executable path. */
export function createGitBinaryResolver(configured = process.env.AUUGIT_GIT_BINARY) {
  const name = process.platform === 'win32' ? 'git.exe' : 'git';
  const system = (process.env.PATH || '').split(path.delimiter).filter(directory => path.isAbsolute(directory))
    .map(directory => path.join(directory, name)).find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  const canonical = (value: string) => fs.realpathSync(value);
  const fallback = configured ? canonical(configured) : system ? canonical(system) : undefined;
  const trusted = new Set([fallback, system && canonical(system)].filter((value): value is string => !!value));
  return (value: unknown = 'git'): string => {
    if (typeof value !== 'string') throw new Error('Invalid Git executable');
    if (/^(git|git\.exe)$/i.test(value)) {
      if (!fallback) throw new Error('Git was not found on the server PATH');
      return fallback;
    }
    if (!path.isAbsolute(value)) throw new Error('Expected an approved absolute Git executable path');
    let resolved: string;
    try { resolved = canonical(value); } catch { throw new Error('Git executable is not approved by the development server'); }
    if (!trusted.has(resolved)) throw new Error('Configure AUUGIT_GIT_BINARY on the development server to approve a custom Git executable');
    return resolved;
  };
}
