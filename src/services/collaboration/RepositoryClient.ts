import type { CollaborationRepoDetails } from './types';
export interface RepositoryClient {
  getRepository(owner: string, repo: string): Promise<CollaborationRepoDetails>;
  getRepositoryDefaultBranch(owner: string, repo: string): Promise<string>;
}
