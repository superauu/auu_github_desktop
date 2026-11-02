// Generated from plugins.config.json by scripts/plugin-composition.mjs.
import type { ComponentType } from 'react';
type AuthView = () => Promise<{ default: ComponentType<{ open: boolean; onOpenChange(open: boolean): void }> }>;
const authViews: Record<string, AuthView> = { "github": () => import('./github/AuthDialog').then(module => ({ default: module.GitHubAuthDialog })) };
export const getPluginAuthView = (id: string): AuthView | undefined => authViews[id];
