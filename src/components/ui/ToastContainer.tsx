import React from 'react';
import {
  CheckCircle2,
  AlertCircle,
  Info,
  X,
  Copy,
  Check,
} from 'lucide-react';
import { useToastStore, ToastItem } from '@/stores/toastStore';
import { cn } from '@/utils/cn';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-9 right-4 z-50 flex flex-col gap-2 pointer-events-none max-w-sm w-full select-none">
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
      ))}
    </div>
  );
};

const ToastCard: React.FC<{ toast: ToastItem; onClose: () => void }> = ({ toast, onClose }) => {
  const [copied, setCopied] = React.useState(false);

  const copyDetails = () => {
    const text = `${toast.title}\n${toast.description || ''}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={cn(
        "pointer-events-auto p-3 rounded-xl border shadow-xl backdrop-blur-xl flex items-start justify-between gap-3 text-xs animate-in slide-in-from-bottom-3 fade-in duration-200",
        toast.type === 'success' && "bg-card/90 border-emerald-500/30 text-foreground",
        toast.type === 'error' && "bg-card/95 border-rose-500/40 text-foreground",
        toast.type === 'info' && "bg-card/90 border-indigo-500/30 text-foreground"
      )}
    >
      <div className="flex items-start gap-2.5 min-w-0">
        <div className="shrink-0 pt-0.5">
          {toast.type === 'success' && (
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          )}
          {toast.type === 'error' && (
            <AlertCircle className="h-4 w-4 text-rose-400" />
          )}
          {toast.type === 'info' && (
            <Info className="h-4 w-4 text-indigo-400" />
          )}
        </div>

        <div className="space-y-0.5 min-w-0">
          <div className="font-semibold text-foreground text-xs leading-tight">
            {toast.title}
          </div>
          {toast.description && (
            <div className="text-[11px] text-muted-foreground leading-relaxed break-words">
              {toast.description}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0 ml-1">
        {toast.type === 'error' && (
          <button
            onClick={copyDetails}
            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
            title="复制错误详情"
          >
            {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
          </button>
        )}
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
};
