import { BranchOperationPicker } from './BranchOperationPicker';
export function MergeBranchModal({ open, onOpenChange, targetBranch }: { open: boolean; onOpenChange: (open: boolean) => void; targetBranch?: string }) {
  return <BranchOperationPicker open={open} onOpenChange={onOpenChange} initialBranch={targetBranch} mode="merge" />;
}
