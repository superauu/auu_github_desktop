import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { version } from './package.json';
import { atomicWrite, readText, withFileWrite } from './scripts/dev-file-io';
import { directoryScope } from './scripts/dev-directory-scope';
import { validateGitArguments } from './scripts/git-policy';
import { AI_REQUEST_TIMEOUT_MS } from './src/services/ai/aiLimits';

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
      path.isAbsolute(filePath) || filePath.split(/[/\\]/).some((part) => part === '..' || part.toLowerCase() === '.git')) {
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
  if (relative.split(path.sep).some(part => part.toLowerCase() === '.git')) throw new Error('Invalid repository file path');
  return resolved;
}
export function gitApiPlugin(): Plugin {
  const allowedPath = directoryScope();
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
            const root = await allowedPath(requested || process.cwd());
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
          // Scope filesystem requests before dispatch; resolve links and nonexistent descendants.
          if (data.repoPath !== undefined) data.repoPath = await allowedPath(data.repoPath);
          if (url.pathname === '/git') {
            if (!Array.isArray(data.args) || !data.args.every((value: unknown) => typeof value === 'string')) throw new Error('Invalid Git command');
            const { command, index } = validateGitArguments(data.args);
            data.cwd = await allowedPath(data.cwd || process.cwd());
            if (command === 'clone') {
              const separator = data.args.indexOf('--');
              if (separator < 0 || data.args.length !== separator + 3) throw new Error('Clone requires an explicit destination');
              await allowedPath(data.args[data.args.length - 1]);
            }
            if (command === 'worktree' && data.args[index + 1] === 'add') {
              await allowedPath(data.args[data.args.indexOf('--') + 1]);
            }
          }
          if (url.pathname === '/fs/exists') {
            if (data.paths !== undefined) {
              if (!Array.isArray(data.paths) || data.paths.length > 4 || data.paths.some((value: unknown) => typeof value !== 'string')) throw new Error('Invalid operation paths');
              data.paths = await Promise.all(data.paths.map((value: string) => allowedPath(path.resolve(data.cwd || process.cwd(), value))));
            } else data.path = await allowedPath(path.resolve(data.cwd || process.cwd(), data.path));
          }
          if (url.pathname === '/fs/validate-path') data.path = await allowedPath(data.path);
          if (url.pathname === '/ai/completion') {
            // Local development relay: same origin only, no credential persistence or redirects.
            const target = new URL(data.url);
            if (target.username || target.password || (target.protocol !== 'https:' && !(target.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)))) {
              json(res, 400, { error: 'AI endpoint must use HTTPS or local HTTP' }); return;
            }
            const payload = JSON.parse(data.body);
            const headers: Record<string, string> = { 'Content-Type': 'application/json', 'User-Agent': `AuuGit/${version}` };
            if (typeof data.authorization === 'string' && data.authorization) headers.Authorization = data.authorization;
            for (const [name, value] of Object.entries(data.extraHeaders || {})) {
              if (!['x-api-key', 'anthropic-version', 'x-opencode-session'].includes(name) || typeof value !== 'string') {
                json(res, 400, { error: 'Unsupported AI request header' }); return;
              }
              headers[name] = value;
            }
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);
            const disconnected = () => { if (!res.writableEnded) controller.abort(); };
            res.on('close', disconnected);
            try {
              const upstream = await fetch(target, { method: 'POST', headers, body: JSON.stringify(payload), redirect: 'manual', signal: controller.signal });
              if (upstream.status >= 300 && upstream.status < 400) {
                controller.abort(); json(res, 502, { error: 'AI endpoint redirected. Enter the final API URL; credentials were not forwarded.' }); return;
              }
              const reader = upstream.body?.getReader();
              const chunks: Uint8Array[] = []; let length = 0;
              if (reader) while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                length += value.byteLength;
                if (length > 32 * 1024 * 1024) { controller.abort(); throw new Error('AI response exceeds 32 MiB'); }
                chunks.push(value);
              }
              if (!res.destroyed && !res.writableEnded) {
                res.statusCode = upstream.status;
                res.setHeader('Content-Type', upstream.headers.get('content-type') || 'text/plain; charset=utf-8');
                res.setHeader('Cache-Control', 'no-store');
                res.end(Buffer.concat(chunks));
              }
            } finally { clearTimeout(timer); res.off('close', disconnected); }
            return;
          }
          if (url.pathname === '/fs/ignore-file') {
            if (typeof data.gitBinary !== 'string' || !/^git(?:\.exe)?$/i.test(path.basename(data.gitBinary))) throw new Error('Invalid Git executable');
            const operation = withFileWrite(async () => {
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
              try { actual = await readText(resolved); }
              catch (error: any) { if (error.code !== 'ENOENT') throw error; exists = false; }
              if (data.remove === true) {
                if (data.expectedContent !== actual) throw new Error('Ignore rules changed on disk; reload before saving');
                if (exists) await fs.unlink(resolved);
                return { content: '', exists: false };
              }
              if (data.content !== undefined) {
                if (typeof data.content !== 'string' || data.expectedContent !== actual) throw new Error('Ignore rules changed on disk; reload before saving');
                await fs.mkdir(path.dirname(resolved), { recursive: true });
                await atomicWrite(resolved, data.content, data.expectedContent);
                actual = data.content;
                exists = true;
              }
              return { content: actual, exists };
            });
            json(res, 200, await operation); return;
          }
          if (url.pathname === '/git') {
            const { args, cwd = process.cwd(), gitBinary = 'git', stdin } = data;
            if (!Array.isArray(args) || !args.every((arg) => typeof arg === 'string') ||
                typeof gitBinary !== 'string' || !/^git(?:\.exe)?$/i.test(path.basename(gitBinary)) ||
                (stdin !== undefined && typeof stdin !== 'string')) throw new Error('Invalid Git command');
            if (typeof cwd !== 'string') throw new Error('Invalid Git working directory');
            const directory = await fs.stat(cwd).catch((error) => {
              if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null;
              throw error;
            });
            if (!directory?.isDirectory()) {
              json(res, 400, { exitCode: -1, stdout: '', stderr: `Repository directory is unavailable: ${cwd}`, errorCode: 'REPOSITORY_DIRECTORY_UNAVAILABLE' });
              return;
            }
            const child = spawn(gitBinary, ['-c', 'core.quotepath=false', ...args], {
              cwd, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never', GIT_ALLOW_PROTOCOL: 'https:http:ssh:git:file' },
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
          if (url.pathname === '/git-image') {
            if (typeof data.revision !== 'string' || !/^(WORKTREE|INDEX|[0-9a-f]{40,64})$/.test(data.revision)) throw new Error('Invalid image revision');
            const resolved = await repoFile(data.repoPath, data.filePath);
            let bytes: Buffer | null;
            if (data.revision === 'WORKTREE') {
              const stat = await fs.stat(resolved).catch((error) => { if (error.code === 'ENOENT') return null; throw error; });
              if (stat && stat.size > 8 * 1024 * 1024) throw new Error('Image exceeds 8 MiB');
              bytes = stat ? await fs.readFile(resolved) : null;
            } else {
              const binary = data.gitBinary || 'git';
              if (!/^git(?:\.exe)?$/i.test(path.basename(binary))) throw new Error('Invalid Git executable');
              const spec = `${data.revision === 'INDEX' ? '' : data.revision}:${data.filePath.replace(/\\/g, '/')}`;
              bytes = await new Promise<Buffer | null>((resolve, reject) => {
                const child = spawn(binary, ['cat-file', 'blob', spec], { cwd: data.repoPath, windowsHide: true });
                const chunks: Buffer[] = []; let size = 0;
                const timer = setTimeout(() => { child.kill(); reject(new Error('Image read timed out')); }, 15000);
                child.stdout.on('data', chunk => { size += chunk.length; if (size > 8 * 1024 * 1024) { child.kill(); reject(new Error('Image exceeds 8 MiB')); } else chunks.push(chunk); });
                child.stderr.resume(); child.on('error', error => { clearTimeout(timer); reject(error); });
                child.on('close', code => { clearTimeout(timer); resolve(code === 0 ? Buffer.concat(chunks) : null); });
              });
            }
            if (!bytes) { json(res, 200, { dataUrl: null }); return; }
            if (bytes.length > 8 * 1024 * 1024) throw new Error('Image exceeds 8 MiB');
            const mime = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'image/png'
              : bytes[0] === 255 && bytes[1] === 216 ? 'image/jpeg' : bytes.subarray(0, 3).toString() === 'GIF' ? 'image/gif'
              : bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP' ? 'image/webp' : bytes.subarray(0, 2).toString() === 'BM' ? 'image/bmp' : null;
            if (!mime) throw new Error('Unsupported raster image');
            json(res, 200, { dataUrl: `data:${mime};base64,${bytes.toString('base64')}` }); return;
          }
          if (url.pathname === '/fs/read-file' || url.pathname === '/fs/write-file') {
            const resolved = await repoFile(data.repoPath, data.filePath);
            if (url.pathname === '/fs/read-file') {
              const content = await readText(resolved).catch((error) => {
                if (data.allowMissing === true && error.code === 'ENOENT') return '';
                throw error;
              });
              json(res, 200, { content });
            } else {
              if (typeof data.content !== 'string') throw new Error('Invalid file content');
              await withFileWrite(() => atomicWrite(resolved, data.content, data.expectedContent));
              json(res, 200, { success: true });
            }
            return;
          }
          if (url.pathname === '/fs/exists') {
            if (data.paths) {
              json(res, 200, { exists: await Promise.all(data.paths.map((value: string) => fs.access(value).then(() => true, () => false))) }); return;
            }
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
            child.on('close', () => {
              const selected = output.trim();
              if (!selected) { finish(200, { path: null }); return; }
              void allowedPath(selected).then(selected => finish(200, { path: selected }), error => finish(403, { error: error.message }));
            }); return;
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
        } catch (error: any) { json(res, /changed on disk/.test(error.message) ? 409 : 400, { error: error.message }); }
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
          const normalized = id.replace(/\\/g, '/');
          if (normalized.includes('/node_modules/yaml/')) return 'workflow-yaml';
          if (normalized.includes('/node_modules/')) return 'vendor';
        },
      },
    },
  },
  clearScreen: false,
  server: { port: 5173, strictPort: true, host: 'localhost' },
});
