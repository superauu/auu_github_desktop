/**
 * i18n 词典完整性防线：
 * 1. zh 与 en 键集合必须完全相等（双向差集为空）——防止一边加键漏另一边；
 * 2. 每个键的 {placeholder} 集合必须一致——防止翻译丢参数导致运行时插值出 undefined；
 * 3. 扫描 src 目录全部 .ts/.tsx 源码中字面量调用的 t('key') / tNow('key')，
 *    断言每个被使用的键在 zh 与 en 中都存在——防止 t() 回退显示键名本身。
 *
 * 说明：只匹配完整字符串字面量参数（'...' / "..."），不分析动态键拼接
 * （如 t('ignore.mode.' + value)，由 t() 的回退机制与人工 review 兜底）。
 * 源码先经 esbuild transform 剥离注释，避免把注释里的示例调用当作用点。
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build, transform } from 'esbuild';

const root = process.cwd();
const PLACEHOLDER = /\{([A-Za-z0-9_]+)\}/g;
// 完整字面量参数：t('key') / t("key") / t('key', ...) / tNow('key')，排除 t('a.' + x) 拼接
const LITERAL_CALL = /\b(?:t|tNow)\(\s*(['"])((?:\\.|(?!\1).)*)\1\s*(?:,|\))/g;

let tmp;
let zh;
let en;
let usedKeys; // Map<key, firstSourceFile>

const placeholdersOf = (value) =>
  [...String(value).matchAll(PLACEHOLDER)].map((m) => m[1]).sort();

async function collectSourceFiles(dir, acc = []) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await collectSourceFiles(full, acc);
    else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) acc.push(full);
  }
  return acc;
}

before(async () => {
  // 打包进系统临时目录（不污染仓库根目录），模拟其他测试的 esbuild bundle 方式加载 src/i18n
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'auugit-i18n-integrity-'));
  const bundle = path.join(tmp, 'i18n.cjs');
  await build({
    stdin: {
      contents: `export { zh } from './src/i18n/zh'; export { en } from './src/i18n/en';`,
      resolveDir: root,
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: bundle,
    alias: { '@': path.join(root, 'src') },
    logLevel: 'silent',
  });
  const dicts = createRequire(import.meta.url)(bundle);
  zh = dicts.zh;
  en = dicts.en;

  usedKeys = new Map();
  const files = await collectSourceFiles(path.join(root, 'src'));
  for (const file of files) {
    const rel = path.relative(root, file).split(path.sep).join('/');
    const loader = file.endsWith('.tsx') ? 'tsx' : 'ts';
    // transform 会剥离全部注释，注释中的 t('...') 示例不会被当作使用点
    const { code } = await transform(await fs.readFile(file, 'utf8'), { loader });
    for (const match of code.matchAll(LITERAL_CALL)) {
      if (!usedKeys.has(match[2])) usedKeys.set(match[2], rel);
    }
  }
  // 防御：扫描本身失效（文件未被收集 / 正则失配）时宁可失败也不静默通过
  assert.ok(files.length > 100, `expected to scan the src tree, only found ${files.length} .ts/.tsx files`);
  assert.ok(usedKeys.size > 500, `expected to extract translation keys from src, only got ${usedKeys.size}`);
});

after(async () => {
  if (tmp) await fs.rm(tmp, { recursive: true, force: true });
});

test('zh and en dictionaries contain exactly the same key set', () => {
  const zhKeys = Object.keys(zh);
  const enKeys = Object.keys(en);
  assert.ok(zhKeys.length > 1000, `zh dictionary unexpectedly small: ${zhKeys.length} keys`);
  const missingInEn = zhKeys.filter((key) => !(key in en));
  const missingInZh = enKeys.filter((key) => !(key in zh));
  assert.deepEqual(
    missingInEn,
    [],
    `keys present in zh but missing in en (${missingInEn.length}):\n  ${missingInEn.slice(0, 20).join('\n  ')}`,
  );
  assert.deepEqual(
    missingInZh,
    [],
    `keys present in en but missing in zh (${missingInZh.length}):\n  ${missingInZh.slice(0, 20).join('\n  ')}`,
  );
});

test('every key uses the same {placeholder} tokens in zh and en', () => {
  const mismatches = [];
  for (const key of Object.keys(zh)) {
    if (!(key in en)) continue; // 键集合相等由上一条用例负责
    const zhPh = placeholdersOf(zh[key]);
    const enPh = placeholdersOf(en[key]);
    if (zhPh.join(',') !== enPh.join(',')) {
      mismatches.push(`${key}: zh{${zhPh.join(', ')}} vs en{${enPh.join(', ')}}`);
    }
  }
  assert.deepEqual(
    mismatches,
    [],
    `placeholder mismatch between zh and en (${mismatches.length}):\n  ${mismatches.slice(0, 20).join('\n  ')}`,
  );
});

test('every literal t()/tNow() key used in src exists in both zh and en', () => {
  const missing = [...usedKeys.keys()].filter((key) => !(key in zh) || !(key in en));
  const detail = missing
    .map((key) => `${JSON.stringify(key)} (used in ${usedKeys.get(key)})`)
    .join('\n  ');
  assert.deepEqual(
    missing,
    [],
    `${missing.length} translation key(s) used in src but missing from dictionaries — t() would render the raw key:\n  ${detail}`,
  );
});
