import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const MAX_FILE_BYTES = 8 * 1024 * 1024;
let writes: Promise<unknown> = Promise.resolve();
export function withFileWrite<T>(operation: () => Promise<T>): Promise<T> {
  const next = writes.catch(() => {}).then(operation);
  writes = next;
  return next;
}

export async function readText(file: string): Promise<string> {
  const handle = await fs.open(file, 'r');
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new Error('Expected a regular file');
    if (info.size > MAX_FILE_BYTES) throw new Error('File exceeds 8 MiB');
    const chunks: Buffer[] = [];
    let size = 0;
    while (true) {
      const buffer = Buffer.alloc(Math.min(64 * 1024, MAX_FILE_BYTES + 1 - size));
      const { bytesRead } = await handle.read(buffer);
      if (!bytesRead) break;
      size += bytesRead;
      if (size > MAX_FILE_BYTES) throw new Error('File exceeds 8 MiB');
      chunks.push(buffer.subarray(0, bytesRead));
    }
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(Buffer.concat(chunks));
  } finally { await handle.close(); }
}

async function snapshot(file: string): Promise<string | null> {
  try { return await readText(file); }
  catch (error: any) { if (error.code === 'ENOENT') return null; throw error; }
}

// Caller serializes writes. Recheck immediately before replacement to catch edits during staging.
export async function atomicWrite(file: string, content: string, expected?: string): Promise<void> {
  if (Buffer.byteLength(content) > MAX_FILE_BYTES) throw new Error('File exceeds 8 MiB');
  const before = await snapshot(file);
  if (expected !== undefined && (before ?? '') !== expected) throw new Error('File changed on disk; reload before saving');
  const temporary = path.join(path.dirname(file), `.auugit-${randomUUID()}.tmp`);
  const handle = await fs.open(temporary, 'wx');
  try {
    await handle.writeFile(content, 'utf8');
    const info = await fs.stat(file).catch((error) => { if (error.code === 'ENOENT') return null; throw error; });
    if (info) await handle.chmod(info.mode);
    await handle.sync();
    await handle.close();
    if (await snapshot(file) !== before) throw new Error('File changed on disk; reload before saving');
    await fs.rename(temporary, file);
  } finally {
    await handle.close().catch(() => {});
    await fs.unlink(temporary).catch((error) => { if (error.code !== 'ENOENT') throw error; });
  }
}
