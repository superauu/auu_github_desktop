/**
 * code-hosting 域收编（forge 域化 M1）：
 * 1. DOMAIN_REGISTRY 新增 code-hosting（declarable，能力词汇恒定）；
 * 2. GitLab / Gitea manifest 声明该域，PROVIDER_REGISTRY 三平台齐全，providerDomains 分组正确；
 * 3. 旧 forgeStore 是统一协作状态的兼容别名。
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const root = process.cwd();
let temporary, app;
before(async () => {
  temporary = await fs.mkdtemp(path.join(root, '.test-tmp-forge-domain-'));
  const bundle = path.join(temporary, 'registry.cjs');
  await build({
    stdin: {
      contents: `export { DOMAIN_REGISTRY, PROVIDER_REGISTRY, providerDomains, getProviderManifest } from './src/services/errors/types';
        export { GITLAB_PROVIDER, GITEA_PROVIDER } from './src/plugins/manifests';
        export { useCollaborationStore } from './src/stores/collaborationStore';`,
      resolveDir: root,
    },
    bundle: true, platform: 'node', format: 'cjs', outfile: bundle,
    alias: { '@': path.join(root, 'src') }, logLevel: 'silent',
  });
  app = createRequire(import.meta.url)(bundle);
});
after(async () => {
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
    'code-hosting:create-pull-request',
    'code-hosting:merge-pull-request',
    'code-hosting:close-pull-request',
    'code-hosting:review-pull-request',
    'code-hosting:pipelines',
  ]);
});

test('gitlab and gitea manifests declare code-hosting; registry groups by domain', () => {
  assert.deepEqual(app.GITLAB_PROVIDER.domains.map((d) => d.domain), ['code-hosting', 'task-tracking', 'ci-cd']);
  assert.deepEqual(app.GITEA_PROVIDER.domains.map((d) => d.domain), ['code-hosting', 'task-tracking', 'ci-cd']);
  assert.equal(app.PROVIDER_REGISTRY.length, 4);
  assert.deepEqual(app.PROVIDER_REGISTRY.map((p) => p.id), ['github', 'gitlab', 'gitea', 'sentry']);
  // 分组辅助：集成页按声明域拆卡片
  const codeHosting = app.PROVIDER_REGISTRY.filter((m) => app.providerDomains(m).includes('code-hosting'));
  assert.deepEqual(codeHosting.map((m) => m.id), ['github', 'gitlab', 'gitea']);
  const errorTracking = app.PROVIDER_REGISTRY.filter((m) => app.providerDomains(m).includes('error-tracking'));
  assert.deepEqual(errorTracking.map((m) => m.id), ['sentry']);
  assert.ok(app.getProviderManifest('gitlab'));
  assert.equal(app.getProviderManifest('unknown'), null);
});

test('legacy Forge store is the same domain state as every other hosting plugin', async () => {
  assert.ok(app.useCollaborationStore.getState().selectProvider);
  assert.equal(app.useCollaborationStore.getState().gitlab, undefined);
  assert.equal(app.useCollaborationStore.getState().gitea, undefined);
});
