import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function validateReleaseVersions({ appVersions, tauri, api, cli, runtime, runtimeWry, tag }) {
  const appVersion = appVersions['package.json'];
  for (const [source, version] of Object.entries(appVersions)) {
    if (!version || version !== appVersion) throw new Error(`App version mismatch: ${source}=${version}, package.json=${appVersion}`);
  }
  if (tag && tag !== `v${appVersion}`) throw new Error(`Release tag ${tag} does not match app version ${appVersion}`);
  const minor = (version) => {
    if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) throw new Error(`Missing or unsupported Tauri version: ${version}`);
    return version.split('.').slice(0, 2).join('.');
  };
  for (const [name, version] of Object.entries({ api, cli, runtime, runtimeWry })) {
    if (minor(version) !== minor(tauri)) throw new Error(`Tauri version mismatch: ${name}=${version}, tauri=${tauri}; align major/minor versions`);
  }
}

function checkRelease(root) {
  const json = (name) => JSON.parse(readFileSync(path.join(root, name), 'utf8'));
  const pkg = json('package.json');
  const lock = json('package-lock.json');
  const cargoLock = readFileSync(path.join(root, 'src-tauri/Cargo.lock'), 'utf8');
  const crateVersion = (name) => cargoLock.split('[[package]]')
    .find((block) => block.match(/^name = "([^"]+)"/m)?.[1] === name)
    ?.match(/^version = "([^"]+)"/m)?.[1];
  const api = json('node_modules/@tauri-apps/api/package.json').version;
  const cli = json('node_modules/@tauri-apps/cli/package.json').version;
  for (const [name, version] of Object.entries({ api, cli })) {
    const locked = lock.packages[`node_modules/@tauri-apps/${name}`]?.version;
    if (version !== locked) throw new Error(`Installed @tauri-apps/${name}=${version} differs from lockfile=${locked}; run npm ci`);
  }
  validateReleaseVersions({
    appVersions: {
      'package.json': pkg.version,
      'package-lock.json': lock.version,
      'package-lock.json root package': lock.packages['']?.version,
      'tauri.conf.json': json('src-tauri/tauri.conf.json').version,
      'Cargo.toml': readFileSync(path.join(root, 'src-tauri/Cargo.toml'), 'utf8').match(/^version = "([^"]+)"/m)?.[1],
      'Cargo.lock': crateVersion('auugit'),
    },
    tauri: crateVersion('tauri'), api, cli,
    runtime: crateVersion('tauri-runtime'),
    runtimeWry: crateVersion('tauri-runtime-wry'),
    tag: process.env.GITHUB_REF?.startsWith('refs/tags/') ? process.env.GITHUB_REF.slice('refs/tags/'.length) : undefined,
  });
  console.log(`Release versions verified: AuuGit ${pkg.version}, Tauri ${crateVersion('tauri')}, API ${api}, CLI ${cli}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { checkRelease(process.cwd()); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
