import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { spawn } from 'child_process';

function gitApiPlugin(): Plugin {
  return {
    name: 'git-api-plugin',
    configureServer(server) {
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

