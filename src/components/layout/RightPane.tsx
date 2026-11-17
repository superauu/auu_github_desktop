import { ErrorNotice } from '@/components/ui/ErrorNotice';
import { useShallow } from 'zustand/react/shallow';
import { confirmAction } from '@/stores/confirmStore';
import { useWorkspaceLayout } from '@/hooks/useWorkspaceLayout';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Clock, CheckCircle2, Copy, FileCode, GitCommit, Layers, List, Network, StickyNote, Tag as TagIcon, X } from 'lucide-react';
import { useRepoStore } from '@/stores/repoStore';
import { useCollaborationStore } from '@/stores/collaborationStore';
import { checkStatus, type CiCheck } from '@/services/collaboration/checkStatus';
import { gitService } from '@/services/git/GitService';
import type { ParsedDiffLine } from '@/services/git/PorcelainParser';
import type { CommitDistance, GitFileChange } from '@/services/git/types';
import { useI18n } from '@/i18n';
import { toast } from '@/stores/toastStore';
import { Button } from '@/components/ui/button';
import { FilePath } from '@/components/ui/FilePath';
import { Identicon } from '@/components/ui/Identicon';
import { Input } from '@/components/ui/input';
import { ModalSurface } from '@/components/ui/ModalSurface';
import { CommitComposer, useComposerDraft } from './CommitComposer';
import { CommitDiffDialog } from './CommitDiffDialog';
import { useSettingsStore } from '@/stores/settingsStore';
import { AiExplanationButton } from '@/features/git/AiExplanationButton';

interface RightPaneProps {
  overlay: boolean;
  open: boolean;
  onClose: () => void;
  onOpenAiSettings: () => void;
}
const EMPTY_CHECKS: CiCheck[] = [];

export const RightPane: React.FC<RightPaneProps> = ({ overlay, open, onClose, onOpenAiSettings }) => {
  const { currentRepo, activeTab, selectedCommit, isRightPaneCollapsed, errorMessage } = useRepoStore(useShallow(state => ({ currentRepo: state.currentRepo, activeTab: state.activeTab, selectedCommit: state.selectedCommit, isRightPaneCollapsed: state.isRightPaneCollapsed, errorMessage: state.errorMessage })));
  const { panels } = useWorkspaceLayout();
  const { t } = useI18n();
  const draft = useComposerDraft(currentRepo?.path, currentRepo?.currentBranch);
  const [files, setFiles] = useState<GitFileChange[]>([]);
  const commitHash = selectedCommit?.hash;
  const rawChecks = useCollaborationStore(state => commitHash ? state.commitChecks[commitHash] : undefined);
  const checks = useMemo(() => rawChecks?.map(check => ({ id: check.id, name: check.name, status: checkStatus(check), webUrl: check.html_url, createdAt: check.started_at })) ?? EMPTY_CHECKS, [rawChecks]);
  const checksError = useCollaborationStore(state => commitHash ? state.commitCheckErrors[commitHash] : undefined);
  const integrationRevision = useCollaborationStore(state => `${state.providerId}:${state.server}:${state.activeProfileId}:${state.currentOwner}:${state.currentRepoName}:${state.isAuthenticated}`);
  const [loading, setLoading] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [tree, setTree] = useState(false);
  const [ascending, setAscending] = useState(true);
  const [fileFilter, setFileFilter] = useState('');
  const [preview, setPreview] = useState<GitFileChange | null>(null);
  const [lines, setLines] = useState<ParsedDiffLine[]>([]);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [distance, setDistance] = useState<CommitDistance | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [noteEditing, setNoteEditing] = useState(false);
  const [noteBusy, setNoteBusy] = useState(false);
  const request = useRef(0);
  const invalidatePreview = useCallback(() => { request.current++; }, []);
  const repoPath = currentRepo?.path;
  const fetchChecks = useCollaborationStore(state => state.fetchCommitChecks);
  useEffect(() => {
    let cancelled = false;
    invalidatePreview();
    setFiles([]); setPreview(null); setFilesError(null); setLoading(false); setFileFilter('');
    if (activeTab === 'history' && repoPath && commitHash) {
      setLoading(true);
      void gitService.getCommitFiles(repoPath, commitHash)
        .then(result => { if (!cancelled) setFiles(result); })
        .catch((error: Error) => { if (!cancelled) setFilesError(error.message); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }
    return () => { cancelled = true; invalidatePreview(); };
  }, [repoPath, commitHash, activeTab, reload, invalidatePreview]);
  useEffect(() => {
    if (activeTab === 'history' && repoPath && commitHash) {
      // CI Store 隔离上下文并持有错误；轮询刷新也会直接更新面板。
      void fetchChecks(commitHash).catch(() => {});
    }
  }, [repoPath, commitHash, activeTab, fetchChecks, integrationRevision, reload]);
  useEffect(() => {
    let cancelled = false;
    setDistance(null);
    // 距 tag 距离是展示性辅助信息：查询失败静默保持 null，不影响详情面板。
    if (activeTab === 'history' && repoPath && commitHash) {
      void gitService.getCommitDistance(repoPath, commitHash)
        .then(result => { if (!cancelled) setDistance(result); })
        .catch(() => {});
    }
    return () => { cancelled = true; };
  }, [repoPath, commitHash, activeTab]);
  useEffect(() => {
    let cancelled = false;
    setNote(null);
    setNoteEditing(false);
    // 提交备注是辅助信息：读取失败静默为无备注。
    if (activeTab === 'history' && repoPath && commitHash) {
      void gitService.getCommitNote(repoPath, commitHash)
        .then(value => { if (!cancelled) setNote(value); })
        .catch(() => {});
    }
    return () => { cancelled = true; };
  }, [repoPath, commitHash, activeTab]);

  // 提交备注保存：空串语义为删除；成功后本地状态同步，失败给出可读提示。
  const saveNote = async (value: string) => {
    if (!repoPath || !commitHash) return;
    setNoteBusy(true);
    try {
      await gitService.setCommitNote(repoPath, commitHash, value);
      if (useRepoStore.getState().currentRepo?.path !== repoPath || useRepoStore.getState().selectedCommit?.hash !== commitHash) return;
      const trimmed = value.trim();
      setNote(trimmed ? trimmed : null);
      setNoteDraft('');
      setNoteEditing(false);
      toast.success(t('rightPane.noteSaved'));
    } catch (error: any) {
      toast.error(t('rightPane.operationFailed'), error?.message);
    } finally {
      setNoteBusy(false);
    }
  };

  const inspect = async (file: GitFileChange) => {
    if (!currentRepo || !selectedCommit) return;
    const id = ++request.current;
    setPreview(file); setLines([]); setDiffError(null); setDiffLoading(true);
    try {
      const result = await gitService.getCommitFileDiff(currentRepo.path, selectedCommit.hash, file.path, useSettingsStore.getState().diffIgnoreWhitespace);
      if (id === request.current) setLines(result);
    } catch (error: any) { if (id === request.current) setDiffError(error?.message || t('rightPane.operationFailed')); }
    finally { if (id === request.current) setDiffLoading(false); }
  };
  const sortedFiles = useMemo(() => [...files].sort((a, b) => (ascending ? 1 : -1) * a.path.localeCompare(b.path)), [files, ascending]);
  // 过滤框：AI 提交动辄几十个文件，按路径子串过滤（不区分大小写），树/平铺两种模式都生效
  const filteredFiles = useMemo(() => {
    const q = fileFilter.trim().toLowerCase();
    return q ? sortedFiles.filter(file => file.path.toLowerCase().includes(q)) : sortedFiles;
  }, [sortedFiles, fileFilter]);
  const groups = useMemo(() => {
    const result: Record<string, GitFileChange[]> = {};
    filteredFiles.forEach(file => { const directory = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : '/'; (result[directory] ||= []).push(file); });
    return result;
  }, [filteredFiles]);
  const fileButton = (file: GitFileChange) => <button key={file.path} onClick={() => void inspect(file)} title={`${file.path} · ${t('changes.viewDiff')}`} className="w-full flex items-center gap-2 rounded-md p-2 text-left hover:bg-accent focus-visible:bg-accent">
    <FileCode className="h-4 w-4 shrink-0 text-muted-foreground" /><FilePath path={file.path} />
    <span className={`text-[12px] shrink-0 ${file.status === 'added' ? 'text-git-added' : file.status === 'deleted' ? 'text-git-deleted' : 'text-muted-foreground'}`}>{t(`fileStatus.${file.status}`)}</span>
  </button>;

  if (!currentRepo || !['history', 'changes'].includes(activeTab) || (overlay ? !open : isRightPaneCollapsed)) return null;
  const heading = t(activeTab === 'history' ? 'rightPane.commitDetails' : 'rightPane.inspector');
  const content = <aside style={{ width: overlay ? undefined : panels.right }} className={overlay ? 'glass-surface glass-inspector w-full max-w-md h-full text-foreground flex flex-col shadow-2xl' : 'glass-surface glass-inspector h-full flex flex-col text-foreground shrink-0 overflow-hidden'}>
    <header className="h-12 px-4 flex items-center justify-between border-b border-border shrink-0">
      <h2 className="ui-panel-title flex items-center gap-2">{activeTab === 'history' ? <GitCommit className="h-4 w-4 text-muted-foreground" /> : <Layers className="h-4 w-4 text-muted-foreground" />}{heading}</h2>
      {overlay && <Button variant="ghost" size="icon" aria-label={t('common.close')} onClick={onClose}><X className="h-4 w-4" /></Button>}
    </header>
    <div className={activeTab === 'changes' ? 'flex flex-col flex-1 min-h-0 overflow-hidden text-[13px]' : 'flex-1 min-h-0 overflow-y-auto p-3 text-[13px]'}>
      {errorMessage && <div role="alert" className="inspector-error relative m-3 mb-0 max-h-36 shrink-0 overflow-y-auto rounded-lg border border-destructive/30 p-3">
        <button type="button" aria-label={t('ui.dismissError')} onClick={() => useRepoStore.getState().setError(null)} className="absolute right-2 top-2 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
        <div className="pr-6"><ErrorNotice error={errorMessage} compact /></div>
        <div className="mt-2"><AiExplanationButton repoPath={currentRepo.path} scope={{ kind: 'error', message: errorMessage }} onOpenSettings={onOpenAiSettings} /></div>
      </div>}
      <div hidden={activeTab !== 'changes'} className="min-h-0 flex-1"><CommitComposer draftState={draft} onOpenAiSettings={onOpenAiSettings} /></div>
      {activeTab === 'history' && (selectedCommit ? <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <button className="font-mono text-primary min-h-8 flex items-center gap-2" title={t('rightPane.copyHashTitle')} onClick={async () => { try { await navigator.clipboard.writeText(selectedCommit.hash); toast.success(t('rightPane.copyHash')); } catch { toast.error(t('rightPane.operationFailed')); } }}>{selectedCommit.shortHash}<Copy className="h-3.5 w-3.5" /></button>
          <Button variant="outline" size="xs" onClick={async () => { if ((draft.title.trim() || draft.body.trim()) && !await confirmAction({ title: t('composer.replaceDraft'), description: t('composer.replaceDraftDesc'), danger: false })) return; if (useRepoStore.getState().currentRepo?.path !== currentRepo.path) return; draft.setTitle(selectedCommit.subject); draft.setBody(selectedCommit.body || ''); draft.setOrigin(null); useRepoStore.getState().setActiveTab('changes'); }}>{t('composer.copyMessage')}</Button>
        </div>
        <div className="select-text space-y-3"><h3 className="commit-detail-message text-[15px] leading-relaxed wrap-break-word">{selectedCommit.subject}</h3>
          {selectedCommit.body && <details><summary className="text-muted-foreground cursor-pointer min-h-7">{t('composer.commitBody')}</summary><p className="mt-2 whitespace-pre-wrap leading-relaxed wrap-break-word">{selectedCommit.body}</p></details>}
          <div className="flex items-center gap-2.5">
            <Identicon seed={selectedCommit.author.email || selectedCommit.author.name} size={30} />
            <div className="min-w-0"><p className="truncate" title={selectedCommit.author.email}>{selectedCommit.author.name}</p><p className="text-[12px] text-muted-foreground" title={selectedCommit.author.date}>{selectedCommit.author.relativeDate}</p></div>
          </div>
          {selectedCommit.parents.length > 0 && <p className="text-[12px] text-muted-foreground">{t('rightPane.parentLabel')} <span className="font-mono">{selectedCommit.parents.map(hash => hash.slice(0, 7)).join(', ')}</span></p>}
          {distance && <button type="button" data-tag-distance className="inline-flex w-fit items-center gap-1.5 rounded-full border border-git-tag/30 bg-git-tag/10 px-2 py-0.5 text-[12px] text-git-tag hover:bg-git-tag/20" title={distance.distance > 0 ? t('rightPane.tagDistanceTitle').replace('{tag}', distance.tag).replace('{n}', String(distance.distance)) : t('rightPane.tagExactlyTitle').replace('{tag}', distance.tag)} onClick={() => void useRepoStore.getState().selectAndLocateBranch(`refs/tags/${distance.tag}`)}>
            <TagIcon className="h-3 w-3 shrink-0" />
            <span className="font-mono">{distance.tag}</span>
            {distance.distance > 0 && <span className="tabular-nums">+{distance.distance}</span>}
          </button>}
        </div>
        <AiExplanationButton repoPath={currentRepo.path} scope={{ kind: 'commit', hash: selectedCommit.hash }} onOpenSettings={onOpenAiSettings} />
        <section className="border-t border-border pt-3 space-y-2">
          <div className="flex items-center justify-between gap-2"><h3 className="font-medium">{t('composer.changedFiles')} ({files.length})</h3><div className="flex gap-1">
            <Button variant="ghost" size="icon" aria-label={t('rightPane.toggleSort')} onClick={() => setAscending(!ascending)}>{ascending ? '↑' : '↓'}</Button>
            <Button variant="ghost" size="icon" aria-label={t(tree ? 'rightPane.pathView' : 'rightPane.treeView')} aria-pressed={tree} onClick={() => setTree(!tree)}>{tree ? <List className="h-4 w-4" /> : <Network className="h-4 w-4" />}</Button>
          </div></div>
          {loading ? <p role="status" className="text-muted-foreground">{t('common.loading')}</p> : filesError ? <div role="alert"><ErrorNotice error={filesError} /><Button variant="outline" onClick={() => setReload(value => value + 1)}>{t('composer.retry')}</Button></div> : <>
            <Input value={fileFilter} onChange={e => setFileFilter(e.target.value)} aria-label={t('rightPane.filterFiles')} placeholder={t('rightPane.filterFiles')} className="h-7 text-[12px] bg-secondary/30" />
            {fileFilter.trim() && <p className="text-[12px] text-muted-foreground tabular-nums">{filteredFiles.length} / {files.length}</p>}
            {tree
              ? Object.entries(groups).map(([directory, group]) => <details key={directory} open><summary className="cursor-pointer text-[12px] text-muted-foreground py-2 break-all">{directory} ({group.length})</summary>{group.map(fileButton)}</details>)
              : filteredFiles.map(fileButton)}
            {!loading && filteredFiles.length === 0 && files.length > 0 && <p className="text-[12px] text-muted-foreground">{t('rightPane.noFileMatch')}</p>}
          </>}
        </section>
        <section className="border-t border-border pt-3 space-y-2"><h3 className="text-[12px] text-muted-foreground">{t('rightPane.ciChecks')}</h3>
          {checksError ? <div role="alert"><ErrorNotice error={checksError} /><Button variant="outline" size="xs" onClick={() => setReload(value => value + 1)}>{t('composer.retry')}</Button></div> : !checks.length ? <p className="text-[12px] text-muted-foreground">{t('rightPane.noChecks')}</p> : checks.map(check => {
            const Icon = check.status === 'success' ? CheckCircle2 : check.status === 'failed' ? AlertCircle : Clock;
            const color = check.status === 'success' ? 'text-git-added' : check.status === 'failed' ? 'text-destructive' : 'text-muted-foreground';
            return <div key={check.id} className="flex items-start gap-2 py-1"><Icon className={`h-4 w-4 shrink-0 ${color}`} /><span className="min-w-0 wrap-break-word">{check.name} · {t(`ci.status.${check.status}`)}</span></div>;
          })}
        </section>
        <section className="border-t border-border pt-3 space-y-2">
          <div className="flex items-center justify-between gap-2"><h3 className="text-[12px] text-muted-foreground">{t('rightPane.noteTitle')}</h3>
            {note !== null && !noteEditing && <div className="flex gap-1">
              <Button variant="ghost" size="icon-xs" aria-label={t('rightPane.noteEdit')} title={t('rightPane.noteEdit')} onClick={() => { setNoteDraft(note); setNoteEditing(true); }}><StickyNote className="h-3.5 w-3.5" /></Button>
              <Button variant="ghost" size="icon-xs" aria-label={t('rightPane.noteDelete')} title={t('rightPane.noteDelete')} onClick={async () => {
                if (!await confirmAction({ title: t('rightPane.noteDelete'), description: t('rightPane.noteDeleteConfirm'), danger: true })) return;
                await saveNote('');
              }}><X className="h-3.5 w-3.5" /></Button>
            </div>}
          </div>
          {noteEditing ? <>
            <textarea aria-label={t('rightPane.noteTitle')} value={noteDraft} disabled={noteBusy}
              onChange={event => setNoteDraft(event.target.value)}
              className="w-full min-h-20 rounded-md border border-input bg-background px-3 py-2 text-xs font-mono select-text" />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="xs" disabled={noteBusy} onClick={() => { setNoteEditing(false); setNoteDraft(''); }}>{t('common.cancel')}</Button>
              <Button size="xs" disabled={noteBusy} onClick={() => void saveNote(noteDraft)}>{t('rightPane.noteSave')}</Button>
            </div>
          </> : note ? (
            <p className="select-text whitespace-pre-wrap wrap-break-word rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-[12px] leading-relaxed text-foreground/90">{note}</p>
          ) : (
            <Button variant="outline" size="xs" onClick={() => { setNoteDraft(''); setNoteEditing(true); }}>{t('rightPane.noteAdd')}</Button>
          )}
        </section>
      </div> : <p className="text-muted-foreground">{t('composer.selectCommit')}</p>)}
    </div>
    {preview && selectedCommit && <CommitDiffDialog image={{ repoPath: currentRepo.path, before: selectedCommit.parents[0] || 'EMPTY', after: selectedCommit.hash, beforePath: preview.oldPath }} path={preview.path} hash={selectedCommit.shortHash} lines={lines} error={diffError} loading={diffLoading} onReload={() => void inspect(preview)} onClose={() => { request.current++; setPreview(null); }} />}
  </aside>;
  return overlay ? <ModalSurface label={heading} onDismiss={onClose} className="fixed inset-0 z-40 bg-black/35 flex justify-end">{content}</ModalSurface> : content;
};
