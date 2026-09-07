import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';

function gitApiPlugin(): Plugin {
  return {
    name: 'git-api-plugin',
    configureServer(server) {
      // 1. Git Command Execution Endpoint
      server.middlewares.use('/api/git', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Method Not Allowed' }));
          return;
        }

        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });

        req.on('end', () => {
          try {
            const { args, cwd } = JSON.parse(body || '{}');
            if (!Array.isArray(args)) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'Invalid args: must be array' }));
              return;
            }

            const workingDir = cwd || process.cwd();
            const child = spawn('git', args, {
              cwd: workingDir,
              windowsHide: true,
            });

            let stdout = '';
            let stderr = '';

            child.stdout.on('data', (data) => {
              stdout += data.toString('utf-8');
            });

            child.stderr.on('data', (data) => {
              stderr += data.toString('utf-8');
            });

            child.on('error', (err) => {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message, exitCode: -1, stdout: '', stderr: err.message }));
            });

            child.on('close', (code) => {
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                exitCode: code ?? 0,
                stdout,
                stderr,
              }));
            });
          } catch (e: any) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: e.message }));
          }
        });
      });

      // 2. Native Folder Dialog Endpoint (Windows PowerShell FolderBrowserDialog)
      server.middlewares.use('/api/dialog/pick-folder', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Method Not Allowed' }));
          return;
        }

        if (process.platform === 'win32') {
          const psScript = `
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = '请选择 Git 仓库目录'
$dialog.ShowNewFolderButton = $true
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    [Console]::WriteLine($dialog.SelectedPath)
}
`.trim();

          const child = spawn('powershell.exe', ['-NoProfile', '-STA', '-Command', psScript]);
          let stdout = '';
          child.stdout.on('data', (d) => {
            stdout += d.toString('utf-8');
          });

          child.on('close', () => {
            const selectedPath = stdout.trim();
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ path: selectedPath || null }));
          });

          child.on('error', (err) => {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err.message, path: null }));
          });
        } else {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ path: null }));
        }
      });

      // 3. Path Validation Endpoint (Checks directory existence & .git repository)
      server.middlewares.use('/api/fs/validate-path', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Method Not Allowed' }));
          return;
        }

        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });

        req.on('end', () => {
          try {
            const { path: checkPath } = JSON.parse(body || '{}');
            if (!checkPath) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Path is required' }));
              return;
            }

            const normalized = path.resolve(checkPath.trim());
            const exists = fs.existsSync(normalized);
            if (!exists) {
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ exists: false, isDirectory: false, isGitRepo: false }));
              return;
            }

            const stat = fs.statSync(normalized);
            const isDirectory = stat.isDirectory();
            if (!isDirectory) {
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ exists: true, isDirectory: false, isGitRepo: false }));
              return;
            }

            const gitDir = path.join(normalized, '.git');
            const isGitRepo = fs.existsSync(gitDir);

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              exists: true,
              isDirectory: true,
              isGitRepo,
              name: path.basename(normalized),
              fullPath: normalized,
            }));
          } catch (err: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err.message }));
          }
        });
      });

      // 4. In-App Directory Listing Endpoint (for browsing drives & folders)
      server.middlewares.use('/api/fs/list-dirs', (req, res) => {
        try {
          const url = new URL(req.url || '', 'http://localhost');
          const reqPath = url.searchParams.get('path');

          if (!reqPath) {
            // Windows drive letters
            const drives: { name: string; path: string; hasGit: boolean }[] = [];
            ['C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'Z'].forEach((letter) => {
              const drivePath = `${letter}:\\`;
              if (fs.existsSync(drivePath)) {
                let hasGit = false;
                try {
                  hasGit = fs.existsSync(path.join(drivePath, '.git'));
                } catch {}
                drives.push({
                  name: `${letter}: 盘`,
                  path: drivePath,
                  hasGit,
                });
              }
            });
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ currentPath: '', parentPath: null, directories: drives }));
            return;
          }

          const targetDir = path.resolve(reqPath);
          if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: '目录不存在' }));
            return;
          }

          const entries = fs.readdirSync(targetDir, { withFileTypes: true });
          const directories = entries
            .filter((e) => e.isDirectory() && !e.name.startsWith('$') && e.name !== 'System Volume Information')
            .map((e) => {
              const full = path.join(targetDir, e.name);
              let hasGit = false;
              try {
                hasGit = fs.existsSync(path.join(full, '.git'));
              } catch {}
              return {
                name: e.name,
                path: full,
                hasGit,
              };
            })
            .sort((a, b) => {
              if (a.hasGit && !b.hasGit) return -1;
              if (!a.hasGit && b.hasGit) return 1;
              return a.name.localeCompare(b.name);
            });

          const parent = path.dirname(targetDir);
          const parentPath = parent !== targetDir ? parent : null;

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            currentPath: targetDir,
            parentPath,
            hasGit: fs.existsSync(path.join(targetDir, '.git')),
            directories,
          }));
        } catch (err: any) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err.message }));
        }
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), gitApiPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // prevent vite from obscuring rust errors
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: false,
    host: 'localhost',
  },
});

