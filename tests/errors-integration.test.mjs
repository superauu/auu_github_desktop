/**
 * Errors 集成 M1 基础测试（PRD docs/errors-integration-prd.md §12 M1 验收）：
 * 1. 语义归一表驱动：Sentry/Rollbar/Bugsnag 的 severity/status 映射、大小写与未知值回落；
 * 2. shouldShowDomain：存在性只看启用连接的域快照，与健康态无关（§4.4）；
 * 3. 域注册表治理：预留域不可声明、Sentry 能力全覆盖、capability 命名空间；
 * 4. repoKey：https/scp/ssh 同键、.git 剥离、host 大小写归一、路径回退（§5.3）；
 * 5. errorsStore：非敏感配置持久化、健康态不落盘、删除连接清凭证（§6.2/§6.4）。
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const root = process.cwd();
let tmp, app;

before(async () => {
  tmp = await fs.mkdtemp(path.join(root, '.test-tmp-errors-'));
  const outfile = path.join(tmp, 'errors.cjs');
  await build({
    stdin: {
      contents: [
        `export { useErrorsStore } from './src/stores/errorsStore';`,
        `export { normalizeSeverity, normalizeStatus } from './src/services/errors/normalize';`,
        `export { shouldShowDomain, DOMAIN_REGISTRY, getProviderManifest, providerSupports } from './src/services/errors/types';`,
        `export { normalizeRemoteUrl, computeRepoKey } from './src/services/errors/repoIdentity';`,
        `export { storeIntegrationToken, getIntegrationToken } from './src/services/errors/credentials';`,
      ].join(''),
      resolveDir: root,
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile,
    alias: { '@': path.join(root, 'src') },
    logLevel: 'silent',
  });
  app = createRequire(import.meta.url)(outfile);
});
after(async () => {
  delete globalThis.localStorage;
  if (tmp && path.dirname(tmp) === root && path.basename(tmp).startsWith('.test-tmp-errors-')) {
    await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
  }
});

test('语义归一：severity 四档与 status 三态按表映射，未知值回落不抛错', () => {
  // Sentry：fatal→critical，debug→info；大小写与首尾空白不敏感
  assert.equal(app.normalizeSeverity('sentry', 'fatal'), 'critical');
  assert.equal(app.normalizeSeverity('sentry', 'debug'), 'info');
  assert.equal(app.normalizeSeverity('sentry', ' Fatal '), 'critical');
  assert.equal(app.normalizeSeverity('bugsnag', 'error'), 'error');
  // 未知平台/未知原始值 → 回落 error
  assert.equal(app.normalizeSeverity('unknown', 'fatal'), 'error');
  assert.equal(app.normalizeSeverity('sentry', null), 'error');

  // Sentry：reprocessing 归一为 unresolved（原始语义由 rawStatus 保留）
  assert.equal(app.normalizeStatus('sentry', 'reprocessing'), 'unresolved');
  assert.equal(app.normalizeStatus('sentry', 'resolved'), 'resolved');
  // Rollbar：active→unresolved，muted→ignored
  assert.equal(app.normalizeStatus('rollbar', 'muted'), 'ignored');
  assert.equal(app.normalizeStatus('rollbar', 'ACTIVE'), 'unresolved');
  // 未知原始值 → 回落 unresolved
  assert.equal(app.normalizeStatus('sentry', 'weird'), 'unresolved');
});

test('shouldShowDomain：存在性只看启用连接的域快照，与健康态无关', () => {
  assert.equal(app.shouldShowDomain('error-tracking', [{ enabled: true, domains: ['error-tracking'] }]), true);
  // 未启用 / 域不匹配 / 空列表
  assert.equal(app.shouldShowDomain('error-tracking', [{ enabled: false, domains: ['error-tracking'] }]), false);
  assert.equal(app.shouldShowDomain('error-tracking', [{ enabled: true, domains: ['task-tracking'] }]), false);
  assert.equal(app.shouldShowDomain('error-tracking', []), false);
  // 多条连接任一命中即显示；健康态不在函数输入里（由页内降级处理，§7.3）
  assert.equal(
    app.shouldShowDomain('error-tracking', [
      { enabled: true, domains: [] },
      { enabled: false, domains: ['error-tracking'] },
      { enabled: true, domains: ['error-tracking'] },
    ]),
    true,
  );
});

test('域注册表治理：预留域不可声明，Sentry 能力全覆盖且命名空间正确', () => {
  const vocabulary = [
    'error-tracking:list-issues',
    'error-tracking:issue-detail',
    'error-tracking:latest-event',
    'error-tracking:stacktrace',
    'error-tracking:suspect-commits',
    'error-tracking:resolve',
    'error-tracking:resolve-in-release',
    'error-tracking:ignore',
  ];
  assert.deepEqual([...app.DOMAIN_REGISTRY['error-tracking'].capabilities], vocabulary);
  // 预留域：declarable=false、无词汇表（§4.1）
  for (const reserved of ['task-tracking', 'ci-cd', 'observability']) {
    assert.equal(app.DOMAIN_REGISTRY[reserved].declarable, false, reserved);
    assert.deepEqual([...app.DOMAIN_REGISTRY[reserved].capabilities], [], reserved);
  }
  // Sentry manifest：8 项能力全声明；未注册的 provider 返回 null
  const sentry = app.getProviderManifest('sentry');
  for (const capability of vocabulary) {
    assert.equal(app.providerSupports(sentry, capability), true, capability);
  }
  assert.equal(app.getProviderManifest('rollbar'), null);
  // capability 强制 `domain:action` 命名空间（§4.3）
  for (const contribution of sentry.domains) {
    for (const capability of contribution.capabilities) {
      assert.ok(capability.startsWith(`${contribution.domain}:`), capability);
    }
  }
});

test('repoKey：https/scp/ssh 同键、.git 剥离、host 大小写归一、路径回退', () => {
  assert.equal(app.normalizeRemoteUrl('https://github.com/Owner/Repo.git'), 'github.com/Owner/Repo');
  assert.equal(app.normalizeRemoteUrl('git@github.com:Owner/Repo.git'), 'github.com/Owner/Repo');
  assert.equal(app.normalizeRemoteUrl('ssh://git@github.com/Owner/Repo.git/'), 'github.com/Owner/Repo');
  // 同仓库不同形态必须同键（§5.3 移动目录/换协议后重关联的前提）
  assert.equal(app.normalizeRemoteUrl('https://GitHub.com/o/r'), app.normalizeRemoteUrl('git@github.com:o/r'));
  // 非 http(s)/ssh 协议、空值 → null（调用方回退路径）
  assert.equal(app.normalizeRemoteUrl('file:///E:/code/repo'), null);
  assert.equal(app.normalizeRemoteUrl(''), null);
  assert.equal(app.normalizeRemoteUrl(null), null);
  // 路径回退：统一正斜杠、去尾分隔符；remote 可解析时优先于路径
  assert.equal(app.computeRepoKey(null, 'E:\\code\\repo\\'), 'path:E:/code/repo');
  assert.equal(app.computeRepoKey('git@github.com:o/r.git', 'E:/elsewhere'), 'github.com/o/r');
});

test('errorsStore：非敏感配置持久化、健康态不落盘、删除连接清凭证', async () => {
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  };
  const store = app.useErrorsStore;
  store.setState({ connections: [], runtime: {}, restored: false });

  const created = store.getState().addConnection({ providerId: 'sentry', displayName: '公司 Sentry' });
  assert.ok(created.id.length >= 8);
  // 凭证按连接 id 存取（与 keyring 条目同名规则）
  await app.storeIntegrationToken(created.id, 'secret-token-value');
  store.getState().restoreConnections();
  assert.equal(store.getState().restored, true);

  store.getState().setConnectionDomains(created.id, ['error-tracking']);
  store.getState().setConnectionHealth(created.id, 'connected');

  const persisted = JSON.parse(storage.get('auu_git_error_connections'));
  assert.equal(persisted.length, 1);
  // domains 持久化为"上次验证快照"——重启后菜单立即可判（§4.4）
  assert.deepEqual(persisted[0].domains, ['error-tracking']);
  // 健康态只在内存 runtime；token 绝不落盘（§6.4）
  assert.equal(persisted[0].health, undefined);
  assert.ok(!JSON.stringify(persisted).includes('secret-token-value'));
  assert.equal(store.getState().getRuntime(created.id).health, 'connected');

  // shouldShowDomain 数据源：按域过滤
  assert.deepEqual(store.getState().domainConnections('error-tracking'), [{ enabled: true, domains: ['error-tracking'] }]);

  // 删除连接 → 连接与 keyring/dev 凭证一并清除
  assert.equal(await app.getIntegrationToken(created.id), 'secret-token-value');
  await store.getState().removeConnection(created.id);
  assert.deepEqual(store.getState().connections, []);
  assert.equal(await app.getIntegrationToken(created.id), null);
});
