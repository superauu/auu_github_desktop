import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function pluginCatalog() {
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'plugins.config.json'), 'utf8')).plugins;
  const seen = new Set();
  for (const plugin of catalog) {
    if (!/^[a-z][a-z0-9-]*$/.test(plugin.id) || seen.has(plugin.id) || !['hosting', 'error'].includes(plugin.kind)
      || !/^\.\/[a-z][a-z0-9-]*$/.test(plugin.module)) throw new Error('Invalid or duplicate plugin declaration');
    seen.add(plugin.id);
    if (!fs.existsSync(path.join(root, 'src/plugins', plugin.module, 'index.ts'))) throw new Error(`Plugin module missing: ${plugin.id}`);
    if (plugin.authView && (!/^\.\/[a-z0-9-]+\/[A-Za-z]+$/.test(plugin.authView) || !/^[A-Za-z]+$/.test(plugin.authExport)
      || !fs.existsSync(path.join(root, 'src/plugins', `${plugin.authView}.tsx`)))) throw new Error(`Invalid auth view: ${plugin.id}`);
    if (plugin.nativeFeature && !/^plugin-[a-z0-9-]+$/.test(plugin.nativeFeature)) throw new Error('Invalid native feature');
  }
  return catalog;
}
export function composePlugins(profile) {
  const catalog = pluginCatalog();
  const ids = profile === undefined ? catalog.map(plugin => plugin.id) : profile === 'none' ? [] : profile.split(',').map(id => id.trim()).filter(Boolean);
  if (new Set(ids).size !== ids.length || ids.some(id => !catalog.some(plugin => plugin.id === id))) throw new Error(`Unknown or duplicate plugin profile: ${JSON.stringify(profile) ?? profile}`);
  const plugins = catalog.filter(plugin => ids.includes(plugin.id));
  const header = '// Generated from plugins.config.json by scripts/plugin-composition.mjs.\n';
  const symbol = plugin => `${plugin.id.replace(/-([a-z0-9])/g, (_, letter) => letter.toUpperCase())}Plugin`;
  const imports = plugins.map(plugin => `import { ${symbol(plugin)} } from '${plugin.module}';`).join('\n');
  const list = kind => plugins.filter(plugin => plugin.kind === kind).map(symbol).join(', ');
  const data = `${header}${imports}\nimport type { HostingPlugin } from '@/services/integrations/plugin';\nexport const HOSTING_PLUGINS: readonly HostingPlugin[] = [${list('hosting')}];\nexport const ERROR_PLUGINS = [${list('error')}];\n`;
  const authViews = plugins.filter(plugin => plugin.authView).map(plugin => `${JSON.stringify(plugin.id)}: () => import('${plugin.authView}').then(module => ({ default: module.${plugin.authExport} }))`).join(', ');
  const ui = `${header}import type { ComponentType } from 'react';\ntype AuthView = () => Promise<{ default: ComponentType<{ open: boolean; onOpenChange(open: boolean): void }> }>;\nconst authViews: Record<string, AuthView> = { ${authViews} };\nexport const getPluginAuthView = (id: string): AuthView | undefined => authViews[id];\n`;
  return { data, ui, nativeFeatures: plugins.flatMap(plugin => plugin.nativeFeature ? [plugin.nativeFeature] : []) };
}
export function checkPluginComposition(write = false) {
  const composition = composePlugins();
  for (const [file, content] of [['src/plugins/index.ts', composition.data], ['src/plugins/ui.ts', composition.ui]]) {
    const target = path.join(root, file);
    if (write) fs.writeFileSync(target, content);
    else if (fs.readFileSync(target, 'utf8').replaceAll('\r\n', '\n') !== content) throw new Error(`Plugin composition is stale: ${file}. Run npm run plugins:generate.`);
  }
  const cargoPath = path.join(root, 'src-tauri/Cargo.toml'), cargo = fs.readFileSync(cargoPath, 'utf8');
  const defaults = `default = ${JSON.stringify(composition.nativeFeatures)}`;
  const features = cargo.match(/\[features\]([\s\S]*?)(?=\n\[)/)?.[1];
  for (const feature of composition.nativeFeatures) if (!features?.includes(`${feature} =`)) throw new Error(`Native feature missing: ${feature}`);
  if (write) fs.writeFileSync(cargoPath, cargo.replace(/(\[features\][\s\S]*?)default = \[[^\]]*\]/, `$1${defaults}`));
  else if (!features?.includes(defaults)) throw new Error('Cargo default plugins differ from plugins.config.json');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    checkPluginComposition(process.argv.includes('--write'));
    process.stdout.write('Plugin composition is consistent.\n');
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
