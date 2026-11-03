export type PluginKind = 'hosting' | 'error' | 'task' | 'ci';
export interface PluginDeclaration { id: string; kind: PluginKind; module: string; authView?: string; authExport?: string; nativeFeature?: string }
export function pluginCatalog(root?: string): PluginDeclaration[];
export function composePlugins(profile?: string, root?: string): { data: string; ui: string; nativeFeatures: string[] };
export function checkPluginComposition(write?: boolean, root?: string): void;
