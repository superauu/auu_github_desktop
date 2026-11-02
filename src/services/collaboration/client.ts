import type { AuthenticationClient } from './AuthenticationClient';
import type { RepositoryClient } from './RepositoryClient';
import type { TaskTrackingClient } from './TaskTrackingClient';
import type { CiCdClient } from './CiCdClient';
import type { CodeHostingClient } from './CodeHostingClient';
export type { AuthenticationClient } from './AuthenticationClient';
export type { RepositoryClient } from './RepositoryClient';
export type { TaskTrackingClient } from './TaskTrackingClient';
export type { CiCdClient } from './CiCdClient';
export type { CodeHostingClient } from './CodeHostingClient';
/** Complete first-party implementation contract; plugins may contribute individual domains. */
export interface CollaborationClient extends AuthenticationClient, RepositoryClient, TaskTrackingClient, CodeHostingClient, CiCdClient {}
export interface ProviderClient extends AuthenticationClient {
  repository?: Partial<RepositoryClient>;
  taskTracking?: Partial<TaskTrackingClient>;
  codeHosting?: Partial<CodeHostingClient>;
  ciCd?: Partial<CiCdClient>;
}
export function contributeAllDomains<T extends CollaborationClient>(client: T): T & ProviderClient {
  return Object.assign(client, { repository: client, taskTracking: client, codeHosting: client, ciCd: client });
}
export class ProviderApiError extends Error {
  constructor(public status: number, message: string) { super(message); this.name = 'ProviderApiError'; }
}
