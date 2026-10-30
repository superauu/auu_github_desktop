/**
 * 把 macOS/Linux 更新器产物合并进 Windows 作业生成的 latest.json。
 *
 * 背景：三平台并行构建，Windows 作业先上传只含 windows-x86_64 的 latest.json；
 * attach-to-release 作业在 release 出现后下载它、把 darwin-aarch64 / darwin-x86_64 /
 * linux-x86_64 的签名与下载 URL 合并进去，再 --clobber 覆盖上传。任何平台缺失
 * 签名时只跳过该平台（manifest 其余部分保持有效），绝不阻塞发布。
 *
 * 用法：node scripts/merge-latest-manifest.mjs --manifest latest.json --artifacts artifacts --tag v0.6.3 --repo owner/name
 * 默认原地覆写 --manifest；用 --output 写到别的文件。
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    if (!key.startsWith('--')) throw new Error(`Unexpected argument: ${key}`);
    args[key.slice(2)] = argv[i + 1];
  }
  for (const required of ['manifest', 'artifacts', 'tag', 'repo']) {
    if (!args[required]) throw new Error(`Missing required --${required}`);
  }
  return args;
}

/** 从签名文件的基础名识别更新器目标平台；不认识的形态返回 null（Windows 安装器等）。 */
export function platformOf(artifactName) {
  if (artifactName.endsWith('.app.tar.gz')) {
    // Tauri 的 macOS 归档名用 aarch64 / x64（不是 x86_64），两者都接受以防上游改名。
    if (artifactName.includes('aarch64')) return 'darwin-aarch64';
    if (/(^|[^a-z])x64([^a-z]|$)/.test(artifactName) || artifactName.includes('x86_64')) return 'darwin-x86_64';
    return null;
  }
  if (artifactName.endsWith('.AppImage')) return 'linux-x86_64';
  return null;
}

/**
 * 读入单平台 manifest 与产物目录，返回 { manifest, added, skipped }。
 * tag/repo 用于拼下载 URL；既有平台条目（如 windows-x86_64）原样保留，
 * 同名平台重复合并幂等（后值覆盖）。
 */
export async function mergeLatestManifest({ manifestPath, artifactsDir, tag, repo }) {
  if (!/^v/.test(tag)) throw new Error(`Tag must look like v0.6.3, got: ${tag}`);
  const parsed = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || !parsed.version || typeof parsed.platforms !== 'object' || parsed.platforms === null) {
    throw new Error('Manifest does not look like a Tauri updater latest.json (version/platforms missing)');
  }
  const baseUrl = `https://github.com/${repo}/releases/download/${tag}`;
  const merged = { ...parsed, platforms: { ...parsed.platforms } };
  const added = [];
  const skipped = [];
  // 排序保证合并输出跨平台（CI/本地）逐字节一致，重跑幂等。
  const entries = (await readdir(artifactsDir)).sort();
  for (const entry of entries) {
    if (!entry.endsWith('.sig')) continue;
    const artifact = entry.slice(0, -'.sig'.length);
    const platform = platformOf(artifact);
    if (!platform) continue;
    const signature = (await readFile(path.join(artifactsDir, entry), 'utf8')).trim();
    if (!signature) {
      skipped.push(`${platform} (${entry}: empty signature)`);
      continue;
    }
    merged.platforms[platform] = { signature, url: `${baseUrl}/${artifact}` };
    added.push(platform);
  }
  // 平台键稳定排序：manifest 既有键在前，新合并键按加入顺序在后，重跑幂等。
  const ordered = {};
  for (const key of Object.keys(parsed.platforms)) ordered[key] = merged.platforms[key];
  for (const key of Object.keys(merged.platforms)) if (!(key in ordered)) ordered[key] = merged.platforms[key];
  merged.platforms = ordered;
  return { manifest: merged, added, skipped };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { manifest, added, skipped } = await mergeLatestManifest({
    manifestPath: args.manifest,
    artifactsDir: args.artifacts,
    tag: args.tag,
    repo: args.repo,
  });
  // 无 BOM UTF-8、两空格缩进 + 尾换行（与 build-windows.yml 的生成约定一致）。
  const output = args.output ?? args.manifest;
  await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  if (added.length) console.log(`Merged platforms: ${added.join(', ')}`);
  else console.log('No platform artifacts merged (manifest unchanged in platforms it already had)');
  for (const item of skipped) console.log(`Skipped: ${item}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await main();
}
