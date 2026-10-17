import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import type { IncomingMessage, ServerResponse } from 'node:http';

const MAX_BODY = 8 * 1024 * 1024;
const json = (res: ServerResponse, status: number, data: unknown) => {
  if (res.writableEnded || res.destroyed) return;
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
};
async function body(req: IncomingMessage): Promise<Record<string, any>> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error('Request too large');
    chunks.push(Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}
async function repoFile(repoPath: string, filePath: string): Promise<string> {
  if (typeof repoPath !== 'string' || typeof filePath !== 'string' || !filePath ||
      path.isAbsolute(filePath) || filePath.split(/[/\\]/).some((part) => part === '..' || part === '.git')) {
    throw new Error('Invalid repository file path');
  }
  const root = await fs.realpath(repoPath);
  const candidate = path.resolve(root, filePath);
  let ancestor = candidate;
  let resolved: string;
  while (true) {
    try { resolved = path.resolve(await fs.realpath(ancestor), path.relative(ancestor, candidate)); break; }
    catch (error: any) {
      if (error.code !== 'ENOENT' || path.dirname(ancestor) === ancestor) throw error;
      ancestor = path.dirname(ancestor);
    }
  }
  const relative = path.relative(root, resolved);
  if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) throw new Error('Path outside repository');
  return resolved;
}
export function gitApiPlugin(): Plugin {
  let ignoreWrites: Promise<unknown> = Promise.resolve();
  return {
    name: 'git-api-plugin',
    configureServer(server) {
      server.middlewares.use('/api', async (req, res) => {
        // A custom header prevents simple cross-site requests. Reject preflights and foreign origins.
        const host = req.headers.host || '';
        const origin = req.headers.origin;
        if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host) ||
            (origin && origin !== `http://${host}`) || req.headers['x-auugit-request'] !== '1' ||
            (req.method !== 'GET' && req.headers['content-type']?.split(';')[0] !== 'application/json')) {
          json(res, 403, { error: 'Forbidden API request' }); return;
        }
        const url = new URL(req.url || '/', 'http://localhost');
        try {
          if (url.pathname === '/fs/list-dirs' && req.method === 'GET') {
            const requested = url.searchParams.get('path');
            if (!requested && process.platform === 'win32') {
              const directories = (await Promise.all('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(async (letter) => {
                const drive = `${letter}:/`;
                try { await fs.access(drive); return { name: `${letter}:`, path: drive, hasGit: false }; } catch { return null; }
              }))).filter(Boolean);
              json(res, 200, { currentPath: '', parentPath: null, hasGit: false, directories }); return;
            }
            const root = await fs.realpath(requested || process.cwd());
            const entries = await fs.readdir(root, { withFileTypes: true });
            const hasGit = async (folder: string) => fs.access(path.join(folder, '.git')).then(() => true, () => false);
            const directories = await Promise.all(entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith('.')).map(async (entry) => {
              const full = path.join(root, entry.name);
              return { name: entry.name, path: full, hasGit: await hasGit(full) };
            }));
            directories.sort((a, b) => Number(b.hasGit) - Number(a.hasGit) || a.name.localeCompare(b.name));
            json(res, 200, { currentPath: root, parentPath: path.dirname(root) === root ? null : path.dirname(root), hasGit: await hasGit(root), directories }); return;
          }
          if (req.method !== 'POST') { json(res, 405, { error: 'Method not allowed' }); return; }
          const data = await body(req);
          if (url.pathname === '/fs/ignore-file') {
            if (typeof data.gitBinary !== 'string' || !/^git(?:\.exe)?$/i.test(path.basename(data.gitBinary))) throw new Error('Invalid Git executable');
            const operation = ignoreWrites.catch(() => {}).then(async () => {
              let resolved: string;
              if (data.scope === 'shared') resolved = await repoFile(data.repoPath, '.gitignore');
              else if (data.scope === 'local') {
                resolved = await new Promise<string>((resolve, reject) => {
                  const child = spawn(data.gitBinary || 'git', ['rev-parse', '--path-format=absolute', '--git-path', 'info/exclude'], { cwd: data.repoPath, windowsHide: true });
                  let output = '', error = '';
                  child.stdout.on('data', chunk => { output += chunk; });
                  child.stderr.on('data', chunk => { error += chunk; });
                  child.on('error', reject);
                  child.on('close', code => code === 0 ? resolve(output.replace(/[\r\n]+$/, '')) : reject(new Error(error)));
                });
              } else throw new Error('Invalid ignore scope');
              let actual = '', exists = true;
              try { actual = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(await fs.readFile(resolved)); }
              catch (error: any) { if (error.code !== 'ENOENT') throw error; exists = false; }
              if (data.remove === true) {
                if (data.expectedContent !== actual) throw new Error('Ignore rules changed on disk; reload before saving');
                if (exists) await fs.unlink(resolved);
                return { content: '', exists: false };
              }
              if (data.content !== undefined) {
                if (typeof data.content !== 'string' || data.expectedContent !== actual) throw new Error('Ignore rules changed on disk; reload before saving');
                await fs.mkdir(path.dirname(resolved), { recursive: true });
                await fs.writeFile(resolved, data.content, 'utf8');
                actual = data.content;
                exists = true;
              }
              return { content: actual, exists };
            });
            ignoreWrites = operation;
            json(res, 200, await operation); return;
          }
          if (url.pathname === '/git') {
            const { args, cwd = process.cwd(), gitBinary = 'git', stdin } = data;
            if (!Array.isArray(args) || !args.every((arg) => typeof arg === 'string') ||
                typeof gitBinary !== 'string' || !/^git(?:\.exe)?$/i.test(path.basename(gitBinary)) ||
                (stdin !== undefined && typeof stdin !== 'string')) throw new Error('Invalid Git command');
            const child = spawn(gitBinary, ['-c', 'core.quotepath=false', ...args], {
              cwd, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' },
            });
            let stdout = '', stderr = '', size = 0, finished = false;
            const finish = (status: number, value: unknown) => {
              if (finished) return;
              finished = true; clearTimeout(timer); json(res, status, value);
            };
            const timer = setTimeout(() => { child.kill(); finish(504, { error: 'Git command timed out' }); }, 15 * 60_000);
            child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
            const collect = (stream: 'stdout' | 'stderr', chunk: string) => {
              size += Buffer.byteLength(chunk);
              if (size > 32 * 1024 * 1024) { child.kill(); finish(413, { error: 'Git output too large' }); return; }
              if (stream === 'stdout') stdout += chunk.toString('utf8'); else stderr += chunk.toString('utf8');
            };
            child.stdout.on('data', (chunk) => collect('stdout', chunk));
            child.stderr.on('data', (chunk) => collect('stderr', chunk));
            child.stdin.on('error', () => {});
            child.on('error', (error) => finish(500, { exitCode: -1, stdout, stderr: error.message }));
            child.on('close', (code) => finish(200, { exitCode: code ?? -1, stdout, stderr }));
            res.on('close', () => { if (!finished) { child.kill(); clearTimeout(timer); } });
            child.stdin.end(stdin || ''); return;
          }
          if (url.pathname === '/fs/read-file' || url.pathname === '/fs/write-file') {
            const resolved = await repoFile(data.repoPath, data.filePath);
            if (url.pathname === '/fs/read-file') {
              const bytes = await fs.readFile(resolved).catch((error) => {
                if (data.allowMissing === true && error.code === 'ENOENT') return Buffer.alloc(0);
                throw error;
              });
              const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
              json(res, 200, { content });
            } else {
              if (typeof data.content !== 'string') throw new Error('Invalid file content');
              if (data.expectedContent !== undefined && await fs.readFile(resolved, 'utf8') !== data.expectedContent) {
                json(res, 409, { error: 'File changed on disk; reload before saving' }); return;
              }
              await fs.writeFile(resolved, data.content, 'utf8'); json(res, 200, { success: true });
            }
            return;
          }
          if (url.pathname === '/fs/exists') {
            json(res, 200, { exists: await fs.access(path.resolve(data.cwd || process.cwd(), data.path)).then(() => true, () => false) }); return;
          }
          if (url.pathname === '/fs/validate-path') {
            const normalized = path.resolve(data.path);
            const stat = await fs.stat(normalized).catch(() => null);
            json(res, 200, { exists: !!stat, isDirectory: !!stat?.isDirectory(),
              isGitRepo: !!stat?.isDirectory() && await fs.access(path.join(normalized, '.git')).then(() => true, () => false),
              fullPath: normalized, name: path.basename(normalized) }); return;
          }
          if (url.pathname === '/dialog/pick-folder') {
            if (process.platform !== 'win32') { json(res, 200, { path: null }); return; }
            const script = `Add-Type -AssemblyName System.Windows.Forms
$d = New-Object System.Windows.Forms.FolderBrowserDialog
if ($d.ShowDialog() -eq 'OK') { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; [Console]::WriteLine($d.SelectedPath) }`;
            const child = spawn('powershell.exe', ['-NoProfile', '-STA', '-Command', script], { windowsHide: true });
            let output = '', finished = false;
            const finish = (status: number, value: unknown) => { if (!finished) { finished = true; json(res, status, value); } };
            child.stdout.on('data', (chunk) => { output += chunk.toString('utf8'); });
            child.on('error', (error) => finish(500, { error: error.message }));
            child.on('close', () => finish(200, { path: output.trim() || null })); return;
          }
          if (url.pathname === '/github/device-code' || url.pathname === '/github/device-token') {
            const token = url.pathname.endsWith('device-token');
            const response = await fetch(token ? 'https://github.com/login/oauth/access_token' : 'https://github.com/login/device/code', {
              method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
              body: JSON.stringify(token ? { client_id: data.client_id, device_code: data.device_code, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' } : { client_id: data.client_id, scope: data.scope }),
              signal: AbortSignal.timeout(20_000),
            });
            json(res, response.status, await response.json()); return;
          }
          json(res, 404, { error: 'Unknown API endpoint' });
        } catch (error: any) { json(res, 400, { error: error.message }); }
      });
    },
  };
}
export default defineConfig({
  plugins: [react(), gitApiPlugin()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.replace(/\\/g, '/').includes('/node_modules/')) return 'vendor';
        },
      },
    },
  },
  clearScreen: false,
  server: { port: 5173, strictPort: true, host: 'localhost' },
});
