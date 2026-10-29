import { ErrorNotice } from '@/components/ui/ErrorNotice';
import { useShallow } from 'zustand/react/shallow';
import { confirmAction } from '@/stores/confirmStore';
import { useWorkspaceLayout } from '@/hooks/useWorkspaceLayout';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Clock, CheckCircle2, Copy, FileCode, GitCommit, Layers, List, Network, X } from 'lucide-react';
import { useRepoStore } from '@/stores/repoStore';
import { useGitHubStore } from '@/stores/githubStore';
import { gitService } from '@/services/git/GitService';
import type { ParsedDiffLine } from '@/services/git/PorcelainParser';
import type { GitFileChange } from '@/services/git/types';
import type { GitHubCheckRun } from '@/services/github/types';
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

export const RightPane: React.FC<RightPaneProps> = ({ overlay, open, onClose, onOpenAiSettings }) => {
  const { currentRepo, activeTab, selectedCommit, isRightPaneCollapsed, errorMessage } = useRepoStore(useShallow(state => ({ currentRepo: state.currentRepo, activeTab: state.activeTab, selectedCommit: state.selectedCommit, isRightPaneCollapsed: state.isRightPaneCollapsed, errorMessage: state.errorMessage })));
  const { panels } = useWorkspaceLayout();
  const { t } = useI18n();
  const draft = useComposerDraft(currentRepo?.path, currentRepo?.currentBranch);
  const [files, setFiles] = useState<GitFileChange[]>([]);
  const [checks, setChecks] = useState<GitHubCheckRun[]>([]);
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
  const request = useRef(0);
  const fetchChecks = useGitHubStore(state => state.fetchCommitChecks);
  useEffect(() => {
    let cancelled = false;
    request.current++;
    setFiles([]); setChecks([]); setPreview(null); setFilesError(null); setLoading(false); setFileFilter('');
    if (activeTab === 'history' && currentRepo && selectedCommit) {
      setLoading(true);
      void gitService.getCommitFiles(currentRepo.path, selectedCommit.hash)
        .then(result => { if (!cancelled) setFiles(result); })
        .catch((error: Error) => { if (!cancelled) setFilesError(error.message); })
        .finally(() => { if (!cancelled) setLoading(false); });
      void fetchChecks(selectedCommit.hash).then(result => { if (!cancelled) setChecks(result); }).catch(() => {});
    }
    return () => { cancelled = true; request.current++; };
  }, [currentRepo?.path, selectedCommit?.hash, activeTab, fetchChecks, reload]);

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
        <section className="border-t border-border pt-3 space-y-2"><h3 className="text-[12px] text-muted-foreground">{t('rightPane.githubChecks')}</h3>
          {!checks.length ? <p className="text-[12px] text-muted-foreground">{t('rightPane.noChecks')}</p> : checks.map(check => {
            const Icon = check.conclusion === 'success' ? CheckCircle2 : check.status === 'completed' ? AlertCircle : Clock;
            const color = check.conclusion === 'success' ? 'text-git-added' : ['failure', 'timed_out', 'action_required'].includes(check.conclusion || '') ? 'text-destructive' : 'text-muted-foreground';
            return <div key={check.id} className="flex items-start gap-2 py-1"><Icon className={`h-4 w-4 shrink-0 ${color}`} /><span className="min-w-0 wrap-break-word">{check.name} · {check.conclusion || check.status}</span></div>;
          })}
        </section>
      </div> : <p className="text-muted-foreground">{t('composer.selectCommit')}</p>)}
    </div>
    {preview && selectedCommit && <CommitDiffDialog image={{ repoPath: currentRepo.path, before: selectedCommit.parents[0] || 'EMPTY', after: selectedCommit.hash, beforePath: preview.oldPath }} path={preview.path} hash={selectedCommit.shortHash} lines={lines} error={diffError} loading={diffLoading} onReload={() => void inspect(preview)} onClose={() => { request.current++; setPreview(null); }} />}
  </aside>;
  return overlay ? <ModalSurface label={heading} onDismiss={onClose} className="fixed inset-0 z-40 bg-black/35 flex justify-end">{content}</ModalSurface> : content;
};
