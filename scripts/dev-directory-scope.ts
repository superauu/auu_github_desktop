import fs from 'node:fs/promises';
import path from 'node:path';

export function directoryScope(configured = process.env.AUUGIT_DEV_ROOTS): (value: string) => Promise<string> {
  const roots = (configured ? configured.split(path.delimiter).filter(Boolean) : [process.cwd()]).map(value => path.resolve(value));
  const resolve = async (value: string): Promise<string> => {
    const absolute = path.resolve(value);
    let ancestor = absolute;
    while (true) {
      try { return path.resolve(await fs.realpath(ancestor), path.relative(ancestor, absolute)); }
      catch (error: any) {
        if (error.code !== 'ENOENT' || ancestor === path.dirname(ancestor)) throw error;
        ancestor = path.dirname(ancestor);
      }
    }
  };
  return async (value) => {
    if (typeof value !== 'string' || !value.trim()) throw new Error('Missing directory path');
    const resolved = await resolve(value);
    for (const root of roots) {
      const relative = path.relative(await resolve(root), resolved);
      if (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) return resolved;
    }
    throw new Error('Path outside allowed development directories (AUUGIT_DEV_ROOTS)');
  };
}
