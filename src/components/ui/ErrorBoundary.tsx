import React from 'react';
import { useI18n } from '@/i18n';
import { Button } from './button';

interface Props { children: React.ReactNode }
interface State { error: Error | null; componentStack: string; attempt: number }

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, componentStack: '', attempt: 0 };
  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }
  componentDidCatch(_error: Error, info: React.ErrorInfo) {
    this.setState({ componentStack: info.componentStack || '' });
  }
  render() {
    if (this.state.error) return <ErrorFallback error={this.state.error} stack={this.state.componentStack}
      retry={() => this.setState(state => ({ error: null, componentStack: '', attempt: state.attempt + 1 }))} />;
    return <React.Fragment key={this.state.attempt}>{this.props.children}</React.Fragment>;
  }
}

function ErrorFallback({ error, stack, retry }: { error: Error; stack: string; retry: () => void }) {
  const { t } = useI18n();
  const [copyStatus, setCopyStatus] = React.useState('');
  const details = `${error.stack || error.message}\n${stack}`;
  return <div role="alert" className="flex-1 min-h-0 overflow-auto p-6 flex flex-col items-start justify-center gap-3 bg-background text-foreground select-text">
    <h2 className="text-base font-semibold">{t('resilience.title')}</h2>
    <p className="text-sm text-muted-foreground">{t('resilience.hint')}</p>
    <div className="flex flex-wrap gap-2">
      <Button onClick={retry}>{t('resilience.retry')}</Button>
      <Button variant="outline" onClick={async () => {
        try { await navigator.clipboard.writeText(details); setCopyStatus('resilience.copied'); }
        catch { setCopyStatus('resilience.copyFailed'); }
      }}>{t('resilience.copy')}</Button>
      <Button variant="ghost" onClick={() => window.location.reload()}>{t('resilience.reload')}</Button>
    </div>
    {copyStatus && <p role="status" className="text-xs">{t(copyStatus)}</p>}
    <details className="max-w-full text-xs"><summary className="cursor-pointer">{t('resilience.details')}</summary>
      <pre className="mt-2 whitespace-pre-wrap break-words max-h-64 overflow-auto">{details}</pre>
    </details>
  </div>;
}
