/**
 * code-hosting 域收编（forge 域化 M1）：
 * 1. DOMAIN_REGISTRY 新增 code-hosting（declarable，能力词汇恒定）；
 * 2. GitLab / Gitea manifest 声明该域，PROVIDER_REGISTRY 三平台齐全，providerDomains 分组正确；
 * 3. 集成页驱动的 forgeStore.connect：验证 + 写 keyring（dev 内存）+ 持久化账号，断开联动清理。
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const root = process.cwd();
let temporary, app, previousFetch;
before(async () => {
  temporary = await fs.mkdtemp(path.join(root, '.test-tmp-forge-domain-'));
  const bundle = path.join(temporary, 'registry.cjs');
  await build({
    stdin: {
      contents: `export { DOMAIN_REGISTRY, GITLAB_PROVIDER, GITEA_PROVIDER, PROVIDER_REGISTRY, providerDomains, getProviderManifest } from './src/services/errors/types';
        export { useForgeStore } from './src/stores/forgeStore';`,
      resolveDir: root,
    },
    bundle: true, platform: 'node', format: 'cjs', outfile: bundle,
    alias: { '@': path.join(root, 'src') }, logLevel: 'silent',
  });
  app = createRequire(import.meta.url)(bundle);
});
after(async () => {
  if (previousFetch) globalThis.fetch = previousFetch;
  if (temporary && path.dirname(temporary) === root && path.basename(temporary).startsWith('.test-tmp-forge-domain-')) {
    await fs.rm(temporary, { recursive: true, force: true });
  }
});

test('code-hosting domain is declarable with a fixed capability vocabulary', () => {
  const registry = app.DOMAIN_REGISTRY;
  assert.equal(registry['code-hosting'].declarable, true);
  assert.deepEqual([...registry['code-hosting'].capabilities], [
    'code-hosting:list-pull-requests',
    'code-hosting:pull-request-detail',
    'code-hosting:pipelines',
  ]);
});

test('gitlab and gitea manifests declare code-hosting; registry groups by domain', () => {
  assert.deepEqual(app.GITLAB_PROVIDER.domains.map((d) => d.domain), ['code-hosting']);
  assert.deepEqual(app.GITEA_PROVIDER.domains.map((d) => d.domain), ['code-hosting']);
  assert.equal(app.PROVIDER_REGISTRY.length, 3);
  assert.deepEqual(app.PROVIDER_REGISTRY.map((p) => p.id), ['sentry', 'gitlab', 'gitea']);
  // 分组辅助：集成页按声明域拆卡片
  const codeHosting = app.PROVIDER_REGISTRY.filter((m) => app.providerDomains(m).includes('code-hosting'));
  assert.deepEqual(codeHosting.map((m) => m.id), ['gitlab', 'gitea']);
  const errorTracking = app.PROVIDER_REGISTRY.filter((m) => app.providerDomains(m).includes('error-tracking'));
  assert.deepEqual(errorTracking.map((m) => m.id), ['sentry']);
  assert.ok(app.getProviderManifest('gitlab'));
  assert.equal(app.getProviderManifest('unknown'), null);
});

test('forge connect verifies, persists the account and clears on disconnect', async () => {
  // localStorage mock（forgeStore persist 目标）；node 无 Tauri → token 走内存槽。
  const saved = new Map();
  globalThis.localStorage = {
    getItem: (key) => saved.get(key) ?? null,
    setItem: (key, value) => saved.set(key, String(value)),
    removeItem: (key) => saved.delete(key),
  };
  previousFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === '/api/v4/user') {
      return { ok: true, status: 200, headers: { forEach: () => {} }, json: async () => ({ username: 'alice', name: 'Alice' }), text: async () => JSON.stringify({ username: 'alice', name: 'Alice' }) };
    }
    throw new Error(`unexpected fetch ${url.pathname}`);
  };
  try {
    const store = app.useForgeStore;
    store.setState({ gitlab: null, gitea: null });
    const user = await store.getState().connect('gitlab', 'https://gitlab.example.com/', 'pat-token');
    assert.equal(user.login, 'alice');
    const account = store.getState().gitlab;
    assert.equal(account.server, 'https://gitlab.example.com'); // 尾斜杠已规范化
    assert.equal(account.user.login, 'alice');
    assert.ok(saved.get('auu_git_forge_accounts')?.includes('gitlab.example.com'));

    await store.getState().disconnect('gitlab');
    assert.equal(store.getState().gitlab, null);
    assert.equal(saved.get('auu_git_forge_accounts'), JSON.stringify({ gitlab: null, gitea: null }));
  } finally {
    delete globalThis.localStorage;
  }
});
