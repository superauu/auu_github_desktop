import type { GitFileChange } from '@/services/git/types';
import type { WorkingFileReviewState } from './useWorkingReviewFileList';

export type WorkingReviewFilter = 'all' | 'pending' | 'issues' | 'approved';
export function filterWorkingReviewFiles(files: readonly GitFileChange[], query: string, filter: WorkingReviewFilter, stateFor: (file: GitFileChange) => WorkingFileReviewState) {
  const search = query.trim().replace(/\\/g, '/').toLowerCase();
  return files.filter(file => {
    if (search && ![file.path, file.oldPath ?? ''].some(path => path.replace(/\\/g, '/').toLowerCase().includes(search))) return false;
    const state = stateFor(file);
    return filter === 'all' || (filter === 'pending' ? state.kind !== 'approved' : filter === 'issues' ? state.unresolved > 0 : state.kind === 'approved');
  });
}
