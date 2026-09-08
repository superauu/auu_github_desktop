import React, { useEffect, useState } from 'react';
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle2, 
  Info, 
  RefreshCw, 
  ShieldAlert, 
  ShieldCheck, 
  X, 
  XCircle,
  Wrench
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/i18n';
import { useRepoStore } from '@/stores/repoStore';
import type { RepoHealthDiagnosis } from '@/services/git/types';

interface HealthDiagnosisModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const HealthDiagnosisModal: React.FC<HealthDiagnosisModalProps> = ({
  open,
  onOpenChange,
}) => {
  const { t } = useI18n();
  const { currentRepo, diagnoseRepository } = useRepoStore();
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<RepoHealthDiagnosis | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runDiagnosis = async () => {
    if (!currentRepo) return;
    setLoading(true);
    setError(null);
    try {
      const res = await diagnoseRepository();
      setReport(res);
    } catch (err: any) {
      console.error(t('diag.failed'), err);
      setError(err?.message || t('diag.failedDesc'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && currentRepo) {
      runDiagnosis();
    }
  }, [open, currentRepo?.path]);

  if (!open) return null;

  const getStatusColor = (status?: 'healthy' | 'warning' | 'danger') => {
    switch (status) {
      case 'healthy':
        return 'text-emerald-500 border-emerald-500/30 bg-emerald-500/10';
      case 'warning':
        return 'text-amber-500 border-amber-500/30 bg-amber-500/10';
      case 'danger':
        return 'text-rose-500 border-rose-500/30 bg-rose-500/10';
      default:
        return 'text-muted-foreground border-border bg-muted/20';
    }
  };

  const getStatusIcon = (status?: 'healthy' | 'warning' | 'danger') => {
    switch (status) {
      case 'healthy':
        return <ShieldCheck className="h-6 w-6 text-emerald-500" />;
      case 'warning':
        return <AlertTriangle className="h-6 w-6 text-amber-500" />;
      case 'danger':
        return <ShieldAlert className="h-6 w-6 text-rose-500" />;
      default:
        return <Activity className="h-6 w-6 text-primary" />;
    }
  };

  const getIssueLevelIcon = (level: 'error' | 'warning' | 'info' | 'success') => {
    switch (level) {
      case 'error':
        return <XCircle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />;
      case 'info':
        return <Info className="h-4 w-4 text-sky-500 shrink-0 mt-0.5" />;
      case 'success':
        return <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in-0 select-none p-4"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-full max-w-xl max-h-[85vh] flex flex-col rounded-2xl border border-border bg-card shadow-2xl p-6 space-y-4 animate-in zoom-in-95 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <div className="font-semibold text-sm text-foreground flex items-center gap-2">
                <span>{t('diag.title')}</span>
                <Badge variant="outline" className="text-[10px] font-normal py-0 h-4 border-primary/30 text-primary">
                  {t('diag.realtime')}
                </Badge>
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5 font-mono truncate max-w-md">
                {currentRepo ? currentRepo.name : t('diag.noRepo')}
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground rounded-lg"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <RefreshCw className="h-8 w-8 animate-spin text-primary" />
              <div className="text-xs">{t('diag.running')}</div>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-500 text-xs space-y-2">
              <div className="font-semibold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                <span>{t('diag.runFailed')}</span>
              </div>
              <div>{error}</div>
            </div>
          ) : report ? (
            <>
              {/* Score & Summary Banner */}
              <div className="p-4 rounded-xl border border-border/80 bg-accent/20 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="p-2 rounded-xl bg-card border border-border">
                    {getStatusIcon(report.status)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-foreground">{t('diag.overall')}</span>
                      <Badge className={`text-[10px] font-medium ${getStatusColor(report.status)}`}>
                        {report.status === 'healthy' ? t('diag.healthy') : report.status === 'warning' ? t('diag.warning') : t('diag.danger')}
                      </Badge>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                      {report.summary}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-center justify-center shrink-0 pl-4 border-l border-border/50">
                  <div className="text-2xl font-bold font-mono tracking-tight text-foreground">
                    {report.score}
                    <span className="text-xs font-normal text-muted-foreground">/100</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground font-medium">{t('diag.score')}</div>
                </div>
              </div>

              {/* Issues / Health Items List */}
              <div className="space-y-2">
                <div className="text-[11px] font-medium text-muted-foreground px-1">
                  {t('diag.items')} ({report.issues.length})
                </div>
                <div className="space-y-2">
                  {report.issues.map((issue, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl border border-border/60 bg-card/60 hover:bg-card/90 transition-colors space-y-1.5"
                    >
                      <div className="flex items-start gap-2.5">
                        {getIssueLevelIcon(issue.level)}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-foreground truncate">
                              {issue.title}
                            </span>
                            <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                              {issue.type}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                            {issue.description}
                          </p>
                          {issue.actionHint && (
                            <div className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-primary bg-primary/5 border border-primary/15 rounded-lg px-2.5 py-1.5">
                              <Wrench className="h-3 w-3 shrink-0" />
                              <span className="leading-tight">{issue.actionHint}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : null}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-border shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={runDiagnosis}
            disabled={loading || !currentRepo}
            className="h-8 text-xs gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{t('diag.rescan')}</span>
          </Button>

          <Button
            size="sm"
            onClick={() => onOpenChange(false)}
            className="h-8 text-xs px-4"
          >
            {t('common.ok')}
          </Button>
        </div>
      </div>
    </div>
  );
};
