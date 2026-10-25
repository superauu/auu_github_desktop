import { useEffect, useState } from 'react';
import { X, Plus, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ModalSurface } from '@/components/ui/ModalSurface';
import { useI18n } from '@/i18n';
import { commitSplitService, type CommitSplitPlan } from '@/services/git/CommitSplitService';
import { parseCommitGroups, type CommitGroup } from '@/services/ai/GitAssistantValidation';
import { useRepoStore } from '@/stores/repoStore';
import { useWorkspaceSessionStore, draftKey } from '@/stores/workspaceSessionStore';
import { confirmAction } from '@/stores/confirmStore';
import { toast } from '@/stores/toastStore';
import { AiTaskDialog } from './AiTaskDialog';

// 分组在移动/合并/重命名间保持稳定 key，避免输入状态错绑到错误分组
let splitGroupSeq = 0;
const withSplitGroupIds = (groups: CommitGroup[]) => groups.map(group => ({ ...group, id: group.id ?? `split-g${++splitGroupSeq}` }));

export function CommitSplitDialog({ repoPath, onClose }: { repoPath: string; onClose: () => void }) {
  const { t } = useI18n();
  const [plan, setPlan] = useState<CommitSplitPlan | null>(null);
  const [groups, setGroups] = useState<CommitGroup[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ai, setAi] = useState(false);
  useEffect(() => {
    let active = true; setBusy(true);
    commitSplitService.plan(repoPath).then(value => { if (active) { setPlan(value); setGroups(withSplitGroupIds(value.groups)); } }).catch(error => { if (active) setError(error.message); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [repoPath]);
  const stage = async (group: CommitGroup) => {
    if (!plan || !group.files.length) return;
    const key = draftKey(repoPath, plan.branch);
    const draft = useWorkspaceSessionStore.getState().drafts[key];
    if ((draft?.title || draft?.body) && !await confirmAction({ title: t('composer.replaceDraft'), description: t('composer.replaceDraftDesc'), danger: false })) return;
    setBusy(true); setError('');
    try {
      await commitSplitService.stageGroup(repoPath, plan, group.files);
      useWorkspaceSessionStore.getState().updateDraft(key, { title: group.title, body: '' });
      if (useRepoStore.getState().currentRepo?.path === repoPath) { await useRepoStore.getState().refreshStatus(); useRepoStore.setState({ isRightPaneCollapsed: false }); }
      toast.success(t('flow.groupStaged')); onClose();
    } catch (error: any) { setError(error.message); } finally { setBusy(false); }
  };
  return <ModalSurface label={t('flow.splitCommits')} onDismiss={onClose} dismissible={!busy} className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4"><div className="w-full max-w-3xl max-h-[88dvh] flex flex-col gap-4 bg-card border border-border rounded-xl shadow-2xl p-5">
    <header className="flex items-center justify-between"><h2 className="font-semibold">{t('flow.splitCommits')}</h2><Button variant="ghost" size="icon" disabled={busy} aria-label={t('common.close')} onClick={onClose}><X className="w-4 h-4" /></Button></header>
    <p className="text-sm text-muted-foreground">{t('flow.splitHint')}</p>
    <div className="flex gap-2"><Button variant="outline" disabled={busy || !plan?.files.length} onClick={() => setAi(true)}><Sparkles className="w-4 h-4" />{t('flow.aiGroups')}</Button><Button variant="ghost" disabled={busy || groups.length >= 12 || !plan} onClick={() => setGroups(previous => [...previous, { id: `split-g${++splitGroupSeq}`, title: `chore: ${t('flow.updateGroup')}`, files: [] }])}><Plus className="w-4 h-4" />{t('flow.addGroup')}</Button></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}{busy && <p role="status">{t('common.loading')}</p>}
    <div className="min-h-0 overflow-y-auto space-y-3">{groups.map((group, groupIndex) => <section key={group.id ?? groupIndex} className="border border-border rounded-lg p-3 space-y-3"><label className="block"><span className="text-xs text-muted-foreground">{t('flow.commitTitle')} {groupIndex + 1}</span><input disabled={busy} value={group.title} onChange={e => setGroups(previous => previous.map((value, i) => i === groupIndex ? { ...value, title: e.target.value } : value))} className="w-full p-2 mt-1 rounded border border-input bg-background text-sm" /></label>{group.files.map(path => <label key={path} className="flex gap-3 justify-between items-center text-xs"><code className="break-all">{path}</code><select disabled={busy} value={groupIndex} aria-label={path} onChange={e => { const destination = Number(e.target.value); setGroups(previous => previous.map((value, index) => ({ ...value, files: index === destination ? [...value.files, path] : value.files.filter(file => file !== path) }))); }} className="bg-background border border-input rounded p-1 max-w-48">{groups.map((value, index) => <option key={value.id ?? index} value={index}>{index + 1}. {value.title}</option>)}</select></label>)}<Button disabled={busy || !group.files.length || !group.title.trim()} size="sm" onClick={() => void stage(group)}>{t('flow.stageGroup')} ({group.files.length})</Button></section>)}</div>
    <footer className="flex justify-end"><Button variant="outline" disabled={busy} onClick={onClose}>{t('common.close')}</Button></footer>
    {ai && plan && <AiTaskDialog title={t('flow.aiGroups')} task="group" context={plan.context} onClose={() => setAi(false)}>{raw => { try { const proposed = parseCommitGroups(raw, plan.files.map(file => file.path)); return <div className="space-y-3"><pre className="text-xs whitespace-pre-wrap">{proposed.map((group, index) => `${index + 1}. ${group.title}\n${group.files.join('\n')}`).join('\n\n')}</pre><Button onClick={() => { setGroups(withSplitGroupIds(proposed)); setAi(false); }}>{t('flow.useGroups')}</Button></div>; } catch (error: any) { return <p role="alert" className="text-destructive">{error.message}</p>; } }}</AiTaskDialog>}
  </div></ModalSurface>;
}
