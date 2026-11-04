import { useId, useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useI18n } from '@/i18n';
import { openExternalUrl } from '@/utils/openExternal';
import { Button } from './button';
import './Markdown.css';

/** Remote issue content stays data: no raw HTML, scripts or executable URL schemes. */
export function Markdown({ children, baseUrl }: { children: string; baseUrl?: string }) {
  const components: Components = {
    a: ({ href, children }) => href ? <a href={href} target={href.startsWith('#') ? undefined : '_blank'} rel="noreferrer noopener" onClick={event => {
      if (!href.startsWith('#')) { event.preventDefault(); void openExternalUrl(href); }
    }}>{children}</a> : <span>{children}</span>,
    img: ({ src, alt, title }) => src ? <img src={src} alt={alt ?? ''} title={title} loading="lazy" referrerPolicy="no-referrer" /> : <span>{alt}</span>,
    table: ({ children }) => <div className="markdown-table-scroll" tabIndex={0}><table>{children}</table></div>,
    // The page owns its h1; issue content starts at h2.
    h1: ({ children }) => <h2 className="markdown-h1">{children}</h2>,
  };
  return <div className="markdown-content select-text"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={components} urlTransform={(url, key) => {
    if (key === 'href' && url.startsWith('#')) return url;
    try {
      const resolved = new URL(url, baseUrl);
      const webUrl = ['https:', 'http:'].includes(resolved.protocol);
      const localImage = typeof window !== 'undefined' && resolved.origin === window.location.origin;
      if (webUrl && (key !== 'src' || resolved.protocol === 'https:' || localImage)) return resolved.href;
    } catch { /* Invalid or relative URL without an issue URL. */ }
    return undefined;
  }}>{children}</ReactMarkdown></div>;
}

export function MarkdownField({ label, value, onChange, disabled, rows = 7, baseUrl }: {
  label: string; value: string; onChange: (value: string) => void; disabled?: boolean; rows?: number; baseUrl?: string;
}) {
  const { t } = useI18n();
  const id = useId();
  const [preview, setPreview] = useState(false);
  return <div className="markdown-field">
    <div className="markdown-field-head"><label htmlFor={id}>{label}</label><div>
      <Button type="button" size="xs" variant={preview ? 'ghost' : 'secondary'} aria-pressed={!preview} onClick={() => setPreview(false)}>{t('issues.write')}</Button>
      <Button type="button" size="xs" variant={preview ? 'secondary' : 'ghost'} aria-pressed={preview} onClick={() => setPreview(true)}>{t('issues.preview')}</Button>
    </div></div>
    <textarea id={id} name="markdown-body" aria-label={label} hidden={preview} value={value} onChange={event => onChange(event.target.value)} disabled={disabled} rows={rows} />
    {preview && <div className="markdown-field-preview" role="region" aria-label={`${label} · ${t('issues.preview')}`}><Markdown baseUrl={baseUrl}>{value || t('issues.previewEmpty')}</Markdown></div>}
    <p className="markdown-field-hint">{t('issues.markdownHint')}</p>
  </div>;
}
