export function workflowStatus(status: string, conclusion: string | null) {
  if (status === 'in_progress') return { key: 'actions.building', variant: 'warning' } as const;
  if (status !== 'completed') return { key: status === 'waiting' || status === 'action_required' ? 'ui.actions.waiting' : 'ui.actions.queued', variant: 'secondary' } as const;
  switch (conclusion) {
    case 'success': return { key: 'actions.passed', variant: 'success' } as const;
    case 'failure': case 'timed_out': case 'startup_failure': return { key: conclusion === 'timed_out' ? 'ui.actions.timedOut' : 'actions.failed', variant: 'destructive' } as const;
    case 'cancelled': return { key: 'ui.actions.cancelled', variant: 'secondary' } as const;
    case 'skipped': return { key: 'ui.actions.skipped', variant: 'secondary' } as const;
    case 'neutral': return { key: 'ui.actions.neutral', variant: 'secondary' } as const;
    case 'action_required': return { key: 'ui.actions.waiting', variant: 'warning' } as const;
    default: return { key: 'ui.actions.unknown', variant: 'secondary' } as const;
  }
}
