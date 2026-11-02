import type { CollaborationUser } from './types';
export interface AuthenticationClient {
  setToken(token: string | null): void;
  verifyToken(token: string): Promise<CollaborationUser>;
}
