// Generated from plugins.config.json by scripts/plugin-composition.mjs.
import { githubPlugin } from './github';
import { gitlabPlugin } from './gitlab';
import { giteaPlugin } from './gitea';
import { sentryPlugin } from './sentry';
import type { HostingPlugin } from '@/services/integrations/plugin';
export const HOSTING_PLUGINS: readonly HostingPlugin[] = [githubPlugin, gitlabPlugin, giteaPlugin];
export const ERROR_PLUGINS = [sentryPlugin];
