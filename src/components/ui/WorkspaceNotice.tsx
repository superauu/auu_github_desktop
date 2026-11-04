import type { ReactNode } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

/** 面板内的状态提示带：小字号、靠近内容，不改变工作区的分栏位置。 */
export function WorkspaceLoading({ children }: { children: ReactNode }) {
  return <div role="status" aria-live="polite" className="workspace-notice text-muted-foreground">
    <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 motion-safe:animate-spin" aria-hidden="true" />
    <span>{children}</span>
  </div>;
}

export function WorkspaceError({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return <div role="alert" className="workspace-notice workspace-error border-b border-destructive/20 bg-destructive/5">
    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden="true" />
    <div className="min-w-0 flex-1 break-words text-foreground">{children}</div>
    {actions && <div className="workspace-notice-actions">{actions}</div>}
  </div>;
}
