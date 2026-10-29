/**
 * 一条命令完成版本号升级：改齐全部版本号位置并复跑发版校验。
 *
 * 用法：node scripts/bump-version.mjs <新版本> [--require-notes]
 *   例：node scripts/bump-version.mjs 0.6.4
 *
 * 覆盖位置（与 check-release.mjs 校验的清单一致）：
 *   package.json / package-lock.json（顶层 + 根包两处）/ src-tauri/tauri.conf.json /
 *   src-tauri/Cargo.toml / src-tauri/Cargo.lock（auugit 条目）。
 *   纯文本锚定替换并逐处断言命中次数，保持既有格式与 diff 最小化。
 *
 * 发版说明：releases/v<新版本>.md 需在打 tag 前建好——--require-notes 让本命令
 * 直接硬校验；默认只提醒（CI 的 tag 构建会经 GITHUB_REF 硬校验兜底）。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkRelease } from './check-release.mjs';

export const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;

/** 逐文件替换规则：每个文件声明锚定模式与期望命中次数，全部命中才写盘。 */
export function buildBumpEdits(root, from, to) {
  const escapedFrom = from.replace(/\./g, '\\.');
  return [
    {
      file: 'package.json',
      apply: (text) => replaceN(text, `"version": "${from}"`, `"version": "${to}"`, 1, 1),
      patternHint: `"version": "${escapedFrom}" ×1`,
    },
    {
      file: 'package-lock.json',
      // 恰好两处：顶层 version 与 packages[""].version。
      apply: (text) => replaceN(text, `"version": "${from}"`, `"version": "${to}"`, 2, 2),
      patternHint: `"version": "${escapedFrom}" ×2`,
    },
    {
      file: 'src-tauri/tauri.conf.json',
      apply: (text) => replaceN(text, `"version": "${from}"`, `"version": "${to}"`, 1, 1),
      patternHint: `"version": "${escapedFrom}" ×1`,
    },
    {
      file: 'src-tauri/Cargo.toml',
      apply: (text) => replaceN(text, `version = "${from}"`, `version = "${to}"`, 1, 1),
      patternHint: `version = "${escapedFrom}" ×1`,
    },
    {
      file: 'src-tauri/Cargo.lock',
      apply: (text) => {
        const updated = text.replace(new RegExp(`name = "auugit"(\\r?\\n)version = "${escapedFrom}"`), `name = "auugit"$1version = "${to}"`);
        if (updated === text) throw new Error(`src-tauri/Cargo.lock: auugit 版本条目未命中（version = "${from}"）`);
        return updated;
      },
      patternHint: 'auugit 条目 version ×1',
    },
  ].map((edit) => ({ ...edit, path: path.join(root, edit.file) }));
}

function replaceN(text, from, to, minCount, maxCount) {
  const count = text.split(from).length - 1;
  if (count < minCount || count > maxCount) {
    throw new Error(`锚定串命中 ${count} 处（期望 ${minCount}..${maxCount}）：${JSON.stringify(from)}`);
  }
  return text.replaceAll(from, to);
}

/** 执行升级：返回改动的文件清单。任一锚定未命中即整体失败，不落半套改动。 */
export function bumpVersion(root, to, { requireNotes = false } = {}) {
  if (!SEMVER_PATTERN.test(to)) throw new Error(`Version must be x.y.z, got: ${to}`);
  const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const from = packageJson.version;
  if (from === to) throw new Error(`Already at version ${to}`);
  // 写盘前先过发版说明前置检查，避免版本号已改而校验失败留下半套改动。
  if (requireNotes) {
    let notes = null;
    try { notes = readFileSync(path.join(root, `releases/v${to}.md`), 'utf8'); } catch { /* 缺失 */ }
    if (!notes?.trim()) throw new Error(`Missing release notes: create releases/v${to}.md before bumping (--require-notes)`);
  }
  const edits = buildBumpEdits(root, from, to);
  const contents = edits.map((edit) => ({ edit, text: readFileSync(edit.path, 'utf8') }));
  const updated = contents.map(({ edit, text }) => ({ edit, text: edit.apply(text) }));
  for (const { edit, text } of updated) writeFileSync(edit.path, text);
  // 复用 CI 同一份校验逻辑闭环：任何一处漏改/错改在这里立即失败。
  checkRelease(root, { requireNotes });
  return updated.map(({ edit }) => edit.file);
}

async function main() {
  const args = process.argv.slice(2).filter((arg) => arg !== '--require-notes');
  const requireNotes = process.argv.includes('--require-notes');
  const [to] = args;
  if (!to) {
    console.error('Usage: node scripts/bump-version.mjs <x.y.z> [--require-notes]');
    process.exitCode = 1;
    return;
  }
  const files = bumpVersion(process.cwd(), to, { requireNotes });
  console.log(`Version bumped to ${to}:\n  ${files.join('\n  ')}`);
  if (!requireNotes) {
    console.log(`提醒：打 tag 前建好 releases/v${to}.md（CI tag 构建会硬校验其存在且非空）。`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try { await main(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
