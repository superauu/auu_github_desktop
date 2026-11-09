import { JENKINS_PROVIDER } from '../manifests';
import { JenkinsClient } from './client';
import type { CiPlugin } from '@/services/integrations/plugin';

export const jenkinsPlugin: CiPlugin = {
  manifest: JENKINS_PROVIDER,
  createClient: ({ server, username, token, jobPaths }) => new JenkinsClient(server, username, token, jobPaths),
};
