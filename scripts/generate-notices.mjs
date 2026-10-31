#!/usr/bin/env node
/**
 * 生成第三方组件许可清单（THIRD-PARTY-NOTICES）。
 *
 * 数据来源：
 * - npm 依赖：遍历 node_modules（含嵌套/作用域包），从各包 package.json 取
 *   name/version/license/repository，并现场提取 LICENSE/COPYING/NOTICE 文本。
 * - Cargo 依赖：`cargo metadata --locked` 取许可字段；许可文本从
 *   ~/.cargo/registry/src/<index>/<name>-<version>/ 提取（需已完成一次构建解压）。
 *
 * 用法：node scripts/generate-notices.mjs [--out <文件>]
 * 纯函数部分导出供 tests/notices.test.mjs 直测。
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(scriptDir, '..');

const hashText = text => crypto.createHash('sha256').update(text).digest('hex');

/** package.json 的 license 字段三种历史形态归一成一个表达式字符串。 */
export function normalizeLicenseField(value) {
  if (typeof value === 'string') return value.trim() || 'Unknown';
  if (Array.isArray(value)) {
    const parts = value.map(item => normalizeLicenseField(typeof item === 'string' ? item : item?.type)).filter(part => part !== 'Unknown');
    return parts.length ? [...new Set(parts)].join(' OR ') : 'Unknown';
  }
  if (value && typeof value === 'object' && typeof value.type === 'string') return value.type.trim() || 'Unknown';
  return 'Unknown';
}

/** repository 字段归一成可点击的 https URL；无法识别时回退 homepage。 */
export function repoUrlOf(pkg) {
  const candidates = [];
  const repo = pkg?.repository;
  if (typeof repo === 'string') candidates.push(repo);
  else if (repo && typeof repo.url === 'string') candidates.push(repo.url);
  if (typeof pkg?.homepage === 'string') candidates.push(pkg.homepage);
  const url = candidates[0] ?? '';
  const cleaned = url.replace(/^git\+/, '').replace(/\.git(#.*)?$/, '$1').replace(/^git:\/\//, 'https://').replace(/^ssh:\/\/git@/, 'https://');
  return /^https?:\/\//.test(cleaned) ? cleaned : (/^[\w.-]+\/[\w.-]+$/.test(cleaned) ? `https://github.com/${cleaned}` : url || '');
}

const isLicenseFileName = name => /^(?:licen[cs]e|copying|notice|copyright)(?:[._-].*)?$/i.test(name);

async function harvestTexts(dir) {
  const texts = [];
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return texts; }
  for (const entry of entries) {
    if (!entry.isFile() || !isLicenseFileName(entry.name)) continue;
    try {
      const text = await fs.readFile(path.join(dir, entry.name), 'utf8');
      if (text.trim()) texts.push({ hash: hashText(text), text, file: entry.name });
    } catch { /* 不可读文件跳过 */ }
  }
  return texts;
}

/** 递归遍历 node_modules（根级、@scope 子目录、包内嵌套 node_modules）。 */
export async function collectNpmPackages(rootDir, modulesDirName = 'node_modules') {
  const packages = [];
  async function walkModules(modulesDir) {
    let entries;
    try { entries = await fs.readdir(modulesDir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const dir = path.join(modulesDir, entry.name);
      if (entry.name.startsWith('@') && entry.isDirectory()) {
        await walkModules(dir);
        continue;
      }
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      let manifest;
      try { manifest = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8')); } catch { continue; }
      packages.push({
        name: manifest.name ?? entry.name,
        version: manifest.version ?? '?',
        license: normalizeLicenseField(manifest.license),
        url: repoUrlOf(manifest),
        texts: await harvestTexts(dir),
      });
      await walkModules(path.join(dir, modulesDirName));
    }
  }
  await walkModules(path.join(rootDir, modulesDirName));
  return packages.sort((a, b) => a.name.localeCompare(b.name));
}

function cargoRegistrySrcRoot() {
  const cargoHome = process.env.CARGO_HOME || path.join(os.homedir(), '.cargo');
  return path.join(cargoHome, 'registry', 'src');
}

async function harvestCargoTexts(registrySrc, name, version) {
  if (!registrySrc) return [];
  let registries;
  try { registries = (await fs.readdir(registrySrc, { withFileTypes: true })).filter(entry => entry.isDirectory() && entry.name.startsWith('index.crates.io-')); } catch { return []; }
  for (const registry of registries) {
    const pkgDir = path.join(registrySrc, registry.name, `${name}-${version}`);
    const texts = await harvestTexts(pkgDir);
    if (texts.length) return texts;
  }
  return [];
}

/** cargo metadata 拉全量依赖清单；未安装 cargo / 非 Tauri 环境抛错由调用方决定是否跳过。 */
export async function collectCargoPackages(srcTauriRoot) {
  const result = spawnSync('cargo', ['metadata', '--format-version', '1', '--locked'], { cwd: srcTauriRoot, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
  if (result.status !== 0 || !result.stdout) throw new Error(result.stderr || 'cargo metadata failed');
  const parsed = JSON.parse(result.stdout);
  const registrySrc = cargoRegistrySrcRoot();
  const packages = [];
  for (const pkg of parsed.packages) {
    if (pkg.name === 'auugit') continue; // 根包本身，不在第三方清单里
    packages.push({
      name: pkg.name,
      version: pkg.version,
      license: normalizeLicenseField(pkg.license),
      url: repoUrlOf({ repository: pkg.repository, homepage: pkg.homepage }),
      texts: await harvestCargoTexts(registrySrc, pkg.name, pkg.version),
    });
  }
  return packages.sort((a, b) => a.name.localeCompare(b.name));
}

/** 按（文本内容哈希 × 许可表达式）归并；返回 [ { key, license, text, file, users } ]。 */
export function dedupeTexts(packages) {
  const byHash = new Map();
  for (const pkg of packages) {
    for (const text of pkg.texts) {
      const key = `${text.hash.slice(0, 12)}`;
      const entry = byHash.get(key) ?? { key, license: pkg.license, text: text.text, file: text.file, users: [] };
      const user = `${pkg.name}@${pkg.version}`;
      if (!entry.users.includes(user)) entry.users.push(user);
      byHash.set(key, entry);
    }
  }
  return [...byHash.values()].sort((a, b) => a.license.localeCompare(b.license) || a.key.localeCompare(b.key));
}

const mdEscape = value => String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

function packageTable(packages) {
  const rows = packages.map(pkg => `| [${mdEscape(pkg.name)}](${pkg.url || '#'}) | ${mdEscape(pkg.version)} | ${mdEscape(pkg.license)} |`);
  return ['| Package | Version | License |', '| --- | --- | --- |', ...rows].join('\n');
}

export function renderMarkdown({ npm, cargo, generatedAt }) {
  // 渲染契约：无论输入顺序如何，两份清单始终按包名排序。
  const byName = (a, b) => a.name.localeCompare(b.name);
  npm = [...npm].sort(byName);
  cargo = [...cargo].sort(byName);
  const texts = dedupeTexts([...npm, ...cargo]);
  const missing = [...npm, ...cargo].filter(pkg => !pkg.texts.length);
  const lines = [
    '# THIRD-PARTY-NOTICES / 第三方组件许可清单',
    '',
    `Generated by \`scripts/generate-notices.mjs\` at ${generatedAt} from node_modules and \`cargo metadata --locked\`. Do not edit by hand.`,
    '',
    '## npm dependencies',
    '',
    `Total: ${npm.length}`,
    '',
    packageTable(npm),
    '',
    '## Cargo dependencies',
    '',
    `Total: ${cargo.length}`,
    '',
    packageTable(cargo),
    '',
    '## Bundled license texts',
    '',
    `Deduplicated license texts shipped with these packages: ${texts.length}`,
    '',
  ];
  for (const entry of texts) {
    lines.push(`### ${entry.license} (text ${entry.key})`, '');
    lines.push(`<details><summary>Used by ${entry.users.length} package(s): ${mdEscape(entry.users.join(', '))}</summary>`, '');
    lines.push('```text', entry.text.trimEnd(), '```', '');
    lines.push('</details>', '');
  }
  if (missing.length) {
    lines.push('## Licenses without a bundled text', '');
    lines.push('No LICENSE/COPYING file was found locally for the following packages; refer to the linked upstream repository:', '');
    for (const pkg of missing) lines.push(`- ${mdEscape(pkg.name)}@${mdEscape(pkg.version)} (${mdEscape(pkg.license)}) — ${pkg.url || 'no URL'}`);
    lines.push('');
  }
  return lines.join('\n');
}

async function main() {
  const outIndex = process.argv.indexOf('--out');
  const out = outIndex >= 0 ? path.resolve(process.argv[outIndex + 1]) : path.join(projectRoot, 'THIRD-PARTY-NOTICES.md');
  const generatedAt = new Date().toISOString();
  const npm = await collectNpmPackages(projectRoot);
  const cargo = await collectCargoPackages(path.join(projectRoot, 'src-tauri'));
  const markdown = renderMarkdown({ npm, cargo, generatedAt });
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, markdown, 'utf8');
  const texts = dedupeTexts([...npm, ...cargo]);
  console.log(`THIRD-PARTY-NOTICES written to ${out}: npm ${npm.length}, cargo ${cargo.length}, license texts ${texts.length}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
