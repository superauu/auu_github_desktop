import { buildHunkPatch, groupDiffIntoHunks, type ParsedDiffLine } from './PorcelainParser';
import { executeGitTransaction } from './GitExecutor';
import { gitService } from './GitService';
import { tNow } from '@/i18n';

/** Rebuild a partial hunk against the index, preserving unselected old/new lines as context. */
export function buildSelectedLinesPatch(filePath: string, lines: ParsedDiffLine[], selected: Set<number>, unstage = false): string {
  const bodies: string[][] = [];
  let header: string[] = [];
  for (const hunk of groupDiffIntoHunks(lines)) {
    if (!hunk.some(line => selected.has(lines.indexOf(line)) && (line.type === 'add' || line.type === 'delete'))) continue;
    const match = hunk[0].content.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/);
    if (!match) throw new Error(tNow('flow.lineUnsupported'));
    const body: ParsedDiffLine[] = [];
    let keptPrevious = false;
    for (const line of hunk.slice(1)) {
      if (line.content.startsWith('\\ No newline')) { if (keptPrevious) body.push(line); continue; }
      const picked = selected.has(lines.indexOf(line));
      if ((unstage ? line.type === 'delete' : line.type === 'add') && !picked) { keptPrevious = false; continue; }
      body.push(!picked && (unstage ? line.type === 'add' : line.type === 'delete') ? { ...line, type: 'context', content: ` ${line.content.slice(1)}`, ...(line.patchContent ? { patchContent: ` ${line.patchContent.slice(1)}` } : {}) } : line);
      keptPrevious = true;
    }
    const oldCount = body.filter(line => line.type === 'delete' || (line.type === 'context' && !line.content.startsWith('\\'))).length;
    const newCount = body.filter(line => line.type === 'add' || (line.type === 'context' && !line.content.startsWith('\\'))).length;
    const start = Number(match[unstage ? 2 : 1]);
    const partial = [{ ...hunk[0], content: `@@ -${oldCount ? Math.max(1, start) : Math.max(0, start - 1)},${oldCount} +${newCount ? Math.max(1, start) : Math.max(0, start - 1)},${newCount} @@${match[3]}` }, ...body];
    const patch = buildHunkPatch(filePath, partial, unstage ? 'unstage' : 'stage').replace(/\n$/, '').split('\n');
    const first = patch.findIndex(line => line.startsWith('@@'));
    if (!header.length) header = patch.slice(0, first);
    bodies.push(patch.slice(first));
  }
  return bodies.length ? [...header, ...bodies.flat(), ''].join('\n') : '';
}

export async function stageSelectedLines(repoPath: string, filePath: string, expected: ParsedDiffLine[], selected: Set<number>, unstage = false): Promise<void> {
  return executeGitTransaction(repoPath, async git => {
    const status = await gitService.getStatus(repoPath);
    const file = (unstage ? status.staged : status.unstaged).find(file => file.path === filePath);
    if (file?.status !== 'modified') throw new Error(tNow('flow.lineUnsupported'));
    const actual = await gitService.getFileDiff(repoPath, filePath, unstage);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(tNow('safety.stale'));
    const patch = buildSelectedLinesPatch(filePath, expected, selected, unstage);
    if (!patch) throw new Error(tNow('flow.selectLines'));
    await git(['apply', '--cached', '--whitespace=nowarn', ...(unstage ? ['--reverse'] : []), '-'], patch);
  });
}
