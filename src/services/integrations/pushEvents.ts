export interface PushedCommitEvent {
  repoPath: string;
  destinationUrls: string[];
  sha: string;
  isCurrent(): boolean;
}
type Observer = (event: PushedCommitEvent) => void;
const observers = new Set<Observer>();
export function onPushedCommit(observer: Observer): () => void {
  observers.add(observer);
  return () => { observers.delete(observer); };
}
export function emitPushedCommit(event: PushedCommitEvent): void {
  for (const observer of observers) {
    try { observer(event); } catch { /* 集成观察不改变已完成推送的结果。 */ }
  }
}
