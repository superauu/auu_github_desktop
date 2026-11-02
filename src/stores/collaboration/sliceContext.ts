import type { StoreApi } from 'zustand';
import type { CollaborationState } from '../collaborationStore';
export interface CollaborationSliceContext {
  get(): CollaborationState;
  set: StoreApi<CollaborationState>['setState'];
  ticket(channel: string): () => boolean;
  generation(): number;
}
