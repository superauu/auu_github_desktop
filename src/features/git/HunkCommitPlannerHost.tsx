import { lazy, Suspense, useEffect } from 'react';
import { useRepoStore } from '@/stores/repoStore';
import { useHunkPlanDialogStore } from '@/stores/hunkPlanDialogStore';

const Planner = lazy(() => import('./HunkCommitPlannerDialog').then(module => ({ default: module.HunkCommitPlannerDialog })));
export function HunkCommitPlannerHost() {
  const { context, close } = useHunkPlanDialogStore();
  const path = useRepoStore(state => state.currentRepo?.path);
  const branch = useRepoStore(state => state.status?.currentBranch || state.currentRepo?.currentBranch);
  const active = context?.path === path && context?.branch === branch;
  useEffect(() => { if (context && !active) close(); }, [context, active, close]);
  if (!context || !active) return null;
  return <Suspense fallback={null}><Planner key={`${context.path}:${context.branch}`} repoPath={context.path} branch={context.branch} onClose={close} /></Suspense>;
}
