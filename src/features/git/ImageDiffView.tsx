import { useEffect, useState } from 'react';
import { readGitImage } from '@/services/git/ImageDiffService';
import { useI18n } from '@/i18n';
import { Button } from '@/components/ui/button';

export function ImageDiffView({ repoPath, path, beforePath, before, after }: { repoPath: string; path: string; beforePath?: string; before: string; after: string }) {
  const { t } = useI18n();
  const [images, setImages] = useState<[string | null, string | null]>([null, null]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [overlay, setOverlay] = useState(false);
  const [amount, setAmount] = useState(50);
  const [dimensions, setDimensions] = useState(['', '']);
  useEffect(() => {
    let active = true; setLoading(true); setError(''); setImages([null, null]); setDimensions(['', '']);
    Promise.all([before === 'EMPTY' ? null : readGitImage(repoPath, beforePath || path, before), after === 'EMPTY' ? null : readGitImage(repoPath, path, after)]).then(value => { if (active) setImages(value as [string | null, string | null]); }).catch(error => { if (active) setError(error.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [repoPath, path, beforePath, before, after]);
  const image = (index: number) => images[index] ? <img src={images[index]!} alt={t(index ? 'flow.after' : 'flow.before')} onError={() => setError(t('flow.invalidImage'))} onLoad={e => { const img = e.currentTarget; setDimensions(previous => previous.map((value, i) => i === index ? `${img.naturalWidth} × ${img.naturalHeight}` : value)); }} className="max-w-full max-h-[60vh] object-contain mx-auto" /> : <p className="py-12 text-center text-sm text-muted-foreground">{t('flow.imageAbsent')}</p>;
  if (loading) return <p role="status" className="p-6">{t('common.loading')}</p>;
  if (error) return <p role="alert" className="p-6 text-destructive break-words">{error}</p>;
  return <div className="flex-1 min-h-0 overflow-auto p-4 space-y-4"><div className="flex flex-wrap items-center gap-2"><Button variant={overlay ? 'ghost' : 'secondary'} size="sm" onClick={() => setOverlay(false)}>{t('flow.sideBySide')}</Button><Button variant={overlay ? 'secondary' : 'ghost'} size="sm" disabled={!images[0] || !images[1]} onClick={() => setOverlay(true)}>{t('flow.overlay')}</Button><span className="text-xs text-muted-foreground">{dimensions.join(' → ')}</span></div>
    {overlay ? <div className="space-y-3"><label className="flex gap-3 items-center text-sm">{t('flow.opacity')}<input type="range" min="0" max="100" value={amount} onChange={e => setAmount(Number(e.target.value))} /></label><div className="relative border border-border rounded-lg bg-[repeating-conic-gradient(#9992_0%_25%,transparent_0%_50%)] bg-[length:20px_20px]">{image(0)}<div className="absolute inset-0 flex items-center justify-center" style={{ opacity: amount / 100 }}>{image(1)}</div></div></div> : <div className="grid grid-cols-2 gap-4">{[0, 1].map(index => <section key={index} className="min-w-0 border border-border rounded-lg overflow-hidden"><h3 className="text-sm p-2 border-b border-border">{t(index ? 'flow.after' : 'flow.before')} · {dimensions[index]}</h3><div className="p-3 bg-[repeating-conic-gradient(#9992_0%_25%,transparent_0%_50%)] bg-[length:20px_20px]">{image(index)}</div></section>)}</div>}
    <p className="text-xs text-muted-foreground">{t('flow.imageHint')}</p>
  </div>;
}
