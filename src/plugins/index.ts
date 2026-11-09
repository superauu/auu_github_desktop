// Generated from plugins.config.json by scripts/plugin-composition.mjs.
import { githubPlugin } from './github';
import { gitlabPlugin } from './gitlab';
import { giteaPlugin } from './gitea';
import { sentryPlugin } from './sentry';
import { linearPlugin } from './linear';
import { jenkinsPlugin } from './jenkins';
import type { HostingPlugin, AuxPlugin, CiPlugin } from '@/services/integrations/plugin';
export const HOSTING_PLUGINS: readonly HostingPlugin[] = [githubPlugin, gitlabPlugin, giteaPlugin];
export const ERROR_PLUGINS = [sentryPlugin];
export const TASK_PLUGINS: readonly AuxPlugin[] = [linearPlugin];
export const CI_PLUGINS: readonly CiPlugin[] = [jenkinsPlugin];
