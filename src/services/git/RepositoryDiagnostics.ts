import { executeGit } from './GitExecutor';
import { normalizeInvokeError } from './invokeError';
import { tNow } from '@/i18n';
import { useSettingsStore } from '@/stores/settingsStore';
import type { GitStatusResult, HealthIssue, RepoHealthDiagnosis, RepoOperationState } from './types';

// Path probing is locale independent, unlike localized `git status` prose.
const OPERATION_PATHS = ['rebase-merge', 'rebase-apply', 'CHERRY_PICK_HEAD', 'MERGE_HEAD'] as const;

/**
 * Detects an in-progress repository operation (merge/rebase/cherry-pick) by
 * probing Git's operation marker files — never by matching localized status
 * output. Returns the same operation taxonomy as GitService.getRepoOperationState.
 */
export async function probeRepoOperation(repoPath: string): Promise<RepoOperationState['type']> {
    let states: boolean[];
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      const { invoke } = await import('@tauri-apps/api/core');
      try {
        states = await invoke<boolean[]>('paths_exist', { repoPath, gitBinary: useSettingsStore.getState().gitCliPath?.trim() || 'git' });
      } catch (error) {
        throw normalizeInvokeError(error, 'Unable to read repository operation state');
      }
    } else {
      const resolved = (await executeGit(['rev-parse', '--path-format=absolute', ...OPERATION_PATHS.flatMap(name => ['--git-path', name])], repoPath)).stdout.trimEnd().split(/\r?\n/);
      if (resolved.length !== OPERATION_PATHS.length || resolved.some(path => !path)) throw new Error('Unable to resolve Git operation paths');
      const res = await fetch('/api/fs/exists', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-AuuGit-Request': '1' },
        body: JSON.stringify({ paths: resolved, cwd: repoPath }),
      });
      if (!res.ok) throw new Error('Unable to read repository operation state');
      states = (await res.json()).exists;
    }
    if (!Array.isArray(states) || states.length !== OPERATION_PATHS.length || states.some(value => typeof value !== 'boolean')) throw new Error('Invalid repository operation state');
    const rebasing = states[0] || states[1], cherryPicking = states[2], merging = states[3];
    return rebasing ? 'rebase' : cherryPicking ? 'cherry-pick' : merging ? 'merge' : 'none';
}

export async function diagnoseRepository(repoPath: string, getStatus: (repoPath: string) => Promise<GitStatusResult>): Promise<RepoHealthDiagnosis> {
    const issues: HealthIssue[] = [];
    let score = 100;

    // 1. Check working tree conflicts
    try {
      const statusRes = await executeGit(['status', '--porcelain'], repoPath);
      const conflictLines = statusRes.stdout
        .split(/\r?\n/)
        .filter((l) => /^(UU|AA|DD|DU|UD|AU|UA)/.test(l.trim()));

      if (conflictLines.length > 0) {
        score -= 40;
        issues.push({
          type: 'conflict',
          level: 'error',
          title: tNow('diag.issue.conflictTitle').replace('{n}', String(conflictLines.length)),
          description: tNow('diag.issue.conflictDesc').replace(
            '{files}',
            `${conflictLines.map((l) => l.slice(3)).slice(0, 3).join(', ')}${conflictLines.length > 3 ? '…' : ''}`
          ),
          actionHint: tNow('diag.issue.conflictHint'),
        });
      }
    } catch {
      // ignore
    }

    // 2. Check in-progress operations (Merge, Rebase, Cherry-pick) by probing
    // Git's marker files — matching status prose breaks in localized Git installs.
    try {
      const operation = await probeRepoOperation(repoPath);
      if (operation === 'rebase') {
        score -= 30;
        issues.push({
          type: 'in_progress',
          level: 'error',
          title: tNow('diag.issue.rebaseTitle'),
          description: tNow('diag.issue.rebaseDesc'),
          actionHint: tNow('diag.issue.rebaseHint'),
        });
      } else if (operation === 'merge') {
        score -= 30;
        issues.push({
          type: 'in_progress',
          level: 'error',
          title: tNow('diag.issue.mergeTitle'),
          description: tNow('diag.issue.mergeDesc'),
          actionHint: tNow('diag.issue.mergeHint'),
        });
      }
    } catch {
      // ignore
    }

    // 3. Check detached HEAD
    try {
      const status = await getStatus(repoPath);
      if (!status.currentBranch || status.currentBranch === 'HEAD' || status.currentBranch.includes('detached')) {
        score -= 15;
        issues.push({
          type: 'detached',
          level: 'warning',
          title: tNow('diag.issue.detachedTitle'),
          description: tNow('diag.issue.detachedDesc'),
          actionHint: tNow('diag.issue.detachedHint'),
        });
      }

      // 4. Check Ahead / Behind
      if (status.behind > 0) {
        score -= 10;
        issues.push({
          type: 'behind',
          level: 'warning',
          title: tNow('diag.issue.behindTitle').replace('{n}', String(status.behind)),
          description: tNow('diag.issue.behindDesc'),
          actionHint: tNow('diag.issue.behindHint'),
        });
      }

      if (status.ahead > 0) {
        score -= 5;
        issues.push({
          type: 'unpushed',
          level: 'info',
          title: tNow('diag.issue.unpushedTitle').replace('{n}', String(status.ahead)),
          description: tNow('diag.issue.unpushedDesc'),
          actionHint: tNow('diag.issue.unpushedHint'),
        });
      }
    } catch {
      // ignore
    }

    // 5. Check branches without remote upstream
    try {
      const branchRes = await executeGit(['branch', '-vv'], repoPath);
      const unpushedBranches = branchRes.stdout
        .split(/\r?\n/)
        .filter((l) => l.trim() && !l.includes('[origin/') && !l.includes('->'));

      if (unpushedBranches.length > 2) {
        issues.push({
          type: 'clean',
          level: 'info',
          title: tNow('diag.issue.localOnlyTitle').replace('{n}', String(unpushedBranches.length)),
          description: tNow('diag.issue.localOnlyDesc'),
        });
      }
    } catch {
      // ignore
    }

    score = Math.max(0, Math.min(100, score));
    const status: 'healthy' | 'warning' | 'danger' =
      score >= 85 ? 'healthy' : score >= 60 ? 'warning' : 'danger';

    if (issues.length === 0) {
      issues.push({
        type: 'clean',
        level: 'success',
        title: tNow('diag.issue.cleanTitle'),
        description: tNow('diag.issue.cleanDesc'),
      });
    }

    const summary =
      status === 'healthy'
        ? tNow('diag.summary.healthy')
        : status === 'warning'
        ? tNow('diag.summary.warning')
        : tNow('diag.summary.danger');

    return {
      score,
      status,
      issues,
      summary,
    };
}
