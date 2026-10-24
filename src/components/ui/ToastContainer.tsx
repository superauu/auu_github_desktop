import React from 'react';
import { createPortal } from 'react-dom';
import {
  CheckCircle2,
  AlertCircle,
  Info,
  X,
  Copy,
  Check,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useI18n } from '@/i18n';
import { useToastStore, ToastItem } from '@/stores/toastStore';
import { cn } from '@/utils/cn';
import { ErrorNotice } from './ErrorNotice';

export const ToastContainer: React.FC = () => {
  // 只订阅 toasts 与 removeToast：history 记录变化不再触发容器重渲染
  const { toasts, removeToast } = useToastStore(useShallow(state => ({ toasts: state.toasts, removeToast: state.removeToast })));

  if (toasts.length === 0) return null;

  return createPortal(
    <div data-auugit-toast className="fixed bottom-9 right-4 z-[100] flex flex-col gap-2 pointer-events-none max-w-sm w-full select-none">
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
      ))}
    </div>, document.body
  );
};

const ToastCard: React.FC<{ toast: ToastItem; onClose: () => void }> = ({ toast, onClose }) => {
  const { t } = useI18n();
  const [copied, setCopied] = React.useState(false);
  const [actionBusy, setActionBusy] = React.useState(false);
  const [actionError, setActionError] = React.useState('');

  const copyDetails = () => {
    const text = `${toast.title}\n${toast.description || ''}`;
    void navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })
      .catch(() => setActionError(t('resilience.copyFailed')));
  };

  return (
    <div
      role={toast.type === 'error' ? 'alert' : 'status'}
      className={cn(
        "pointer-events-auto p-3 rounded-xl border shadow-xl backdrop-blur-xl flex items-start justify-between gap-3 text-xs animate-in slide-in-from-bottom-3 fade-in duration-200",
        toast.type === 'success' && "bg-card/90 border-emerald-500/30 text-foreground",
        toast.type === 'error' && "bg-card/95 border-rose-500/40 text-foreground",
        toast.type === 'info' && "bg-card/90 border-indigo-500/30 text-foreground",
        toast.type === 'warning' && "bg-card/90 border-amber-500/30 text-foreground"
      )}
    >
      <div className="flex items-start gap-2.5 min-w-0">
        <div className="shrink-0 pt-0.5">
          {toast.type === 'success' && (
            <CheckCircle2 className="h-4 w-4 text-git-added" />
          )}
          {toast.type === 'error' && (
            <AlertCircle className="h-4 w-4 text-git-deleted" />
          )}
          {toast.type === 'info' && (
            <Info className="h-4 w-4 text-git-branch" />
          )}
          {toast.type === 'warning' && (
            <AlertCircle className="h-4 w-4 text-git-tag" />
          )}
        </div>

        <div className="space-y-0.5 min-w-0">
          <div className="font-semibold text-foreground text-xs leading-tight">
            {toast.title}
          </div>
          {toast.type === 'error' && toast.description ? <ErrorNotice error={toast.description} compact /> : toast.description && (
            <div className="text-[12px] text-muted-foreground leading-relaxed break-words">
              {toast.description}
            </div>
          )}
          {actionError && <div role="alert"><ErrorNotice error={actionError} compact /></div>}
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0 ml-1">
        {toast.action && <button disabled={actionBusy} className="px-2 py-1 rounded hover:bg-accent text-primary disabled:opacity-50"
          onClick={async () => { setActionBusy(true); setActionError(''); try { await toast.action!.onClick(); useToastStore.getState().consumeAction(toast.id); onClose(); } catch (error) { setActionError(error instanceof Error ? error.message : String(error)); } finally { setActionBusy(false); } }}>
          {toast.action.label}
        </button>}
        {toast.type === 'error' && (
          <button
            onClick={copyDetails}
            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
            title={t('toast.copyErrorDetails')}
          >
            {copied ? <Check className="h-3 w-3 text-git-added" /> : <Copy className="h-3 w-3" />}
          </button>
        )}
        <button
          onClick={onClose}
          aria-label={t('common.close')}
          className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
};
