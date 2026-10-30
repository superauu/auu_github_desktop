import { useEffect, useEffectEvent, useState } from 'react';
import { ModalSurface } from '@/components/ui/ModalSurface';
import { Button } from '@/components/ui/button';
import { useRepoStore } from '@/stores/repoStore';
import { useI18n } from '@/i18n';
import { DragDropActionModal } from './DragDropActionModal';

export function BranchOperationPicker({ open, onOpenChange, initialBranch, mode }: { open: boolean; onOpenChange: (open: boolean) => void; initialBranch?: string; mode: 'merge' | 'rebase' }) {
  const { t } = useI18n();
  const branches = useRepoStore(state => state.branches);
  const repoPath = useRepoStore(state => state.currentRepo?.path);
  const current = branches.find(branch => branch.isCurrent);
  const candidates = branches.filter(branch => !branch.isCurrent);
  const [selection, setSelection] = useState('');
  const [preview, setPreview] = useState(false);
  // Candidate refs are an opening snapshot; background fetches preserve the user's selection.
  const initializeSelection = useEffectEvent(() => { setSelection(initialBranch || candidates[0]?.name || ''); setPreview(!!initialBranch); });
  useEffect(() => { if (open) initializeSelection(); }, [open, initialBranch, repoPath]);
  if (!open) return null;
  const source = candidates.find(branch => branch.name === selection);
  if (preview && source && current) return <DragDropActionModal open onOpenChange={onOpenChange} sourceBranch={source} targetBranch={current} initialAction={mode === 'merge' ? 'merge' : 'rebase-target'} fixedAction />;
  return <ModalSurface label={t(`${mode}.title`)} onDismiss={() => onOpenChange(false)} className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-xs">
    <div className="w-full max-w-lg rounded-xl border border-border bg-card p-5 space-y-4 shadow-2xl">
      <h2 className="font-semibold">{t(`${mode}.title`)}</h2>
      <p className="text-sm text-muted-foreground">{t('flow.currentBranch')}: <code>{current?.name || '—'}</code></p>
      <label className="block text-sm space-y-2"><span>{t(mode === 'merge' ? 'merge.pickSource' : 'rebase.pickUpstream')}</span><select className="w-full p-2 rounded border border-input bg-background" value={selection} onChange={e => setSelection(e.target.value)}><option value="" disabled>{t('merge.none')}</option>{candidates.map(branch => <option key={`${branch.isRemote}-${branch.name}`} value={branch.name}>{branch.name}</option>)}</select></label>
      {!current && <p role="alert" className="text-sm text-destructive">{t('flow.localHeadRequired')}</p>}
      <footer className="flex justify-end gap-2"><Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button><Button disabled={!source || !current} onClick={() => setPreview(true)}>{t('safety.preview')}</Button></footer>
    </div>
  </ModalSurface>;
}
