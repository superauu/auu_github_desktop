import { BranchOperationPicker } from './BranchOperationPicker';
export function RebaseBranchModal({ open, onOpenChange, upstreamBranch }: { open: boolean; onOpenChange: (open: boolean) => void; upstreamBranch?: string }) {
  return <BranchOperationPicker open={open} onOpenChange={onOpenChange} initialBranch={upstreamBranch} mode="rebase" />;
}
