import { tNow } from '@/i18n';
export interface CommitGroup { id?: string; title: string; files: string[] }
function parseJson(raw: string): any {
  return JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
}
export function parseCommitGroups(raw: string, paths: string[]): CommitGroup[] {
  const result = parseJson(raw);
  if (!Array.isArray(result.groups) || !result.groups.length || result.groups.length > 12) throw new Error(tNow('flow.invalidAiResult'));
  const seen = new Set<string>();
  for (const group of result.groups) {
    if (typeof group.title !== 'string' || !group.title.trim() || group.title.length > 120 || /[\r\n]/.test(group.title) || !Array.isArray(group.files) || !group.files.length) throw new Error(tNow('flow.invalidAiResult'));
    for (const file of group.files) { if (typeof file !== 'string' || !paths.includes(file) || seen.has(file)) throw new Error(tNow('flow.invalidAiResult')); seen.add(file); }
  }
  if (seen.size !== paths.length) throw new Error(tNow('flow.invalidAiResult'));
  return result.groups;
}
export function parseConflictSuggestion(raw: string): { explanation: string; resolution: string } {
  const result = parseJson(raw);
  if (typeof result.explanation !== 'string' || typeof result.resolution !== 'string' || result.resolution.length > 30000 || /^(?:<{7}|={7}|>{7}|\|{7})/m.test(result.resolution)) throw new Error(tNow('flow.invalidAiResult'));
  return result;
}
export function diagnoseGitError(message: string): string {
  const key = /non-fast-forward|fetch first|rejected.*push/i.test(message) ? 'pushRejected'
    : /authentication|permission denied|403|401|could not read Username/i.test(message) ? 'auth'
    : /would be overwritten|local changes|untracked.*overwritten/i.test(message) ? 'dirty'
    : /conflict|unmerged/i.test(message) ? 'conflict'
    : /could not resolve host|unable to access|timed out|network/i.test(message) ? 'network'
    : /index\.lock|another git process/i.test(message) ? 'locked' : 'unknown';
  return tNow(`flow.diagnosis.${key}`);
}
