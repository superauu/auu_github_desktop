export interface PluginDeclaration { id: string; kind: 'hosting' | 'error'; module: string; authView?: string; authExport?: string; nativeFeature?: string }
export function pluginCatalog(): PluginDeclaration[];
export function composePlugins(profile?: string): { data: string; ui: string; nativeFeatures: string[] };
export function checkPluginComposition(write?: boolean): void;
