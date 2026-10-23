import { useEffect, useState } from 'react';
import { Copy, Scissors, ClipboardPaste, TextSelect, Undo2, Redo2 } from 'lucide-react';
import { ContextMenu, type ContextMenuItem } from './ContextMenu';
import { captureTextContext, type TextContext } from '@/utils/textContext';
import { useI18n } from '@/i18n';
import { toast } from '@/stores/toastStore';

/** Replace browser navigation/inspection menus without overriding repository actions. */
export function AppTextContextMenu() {
  const { t } = useI18n();
  const [menu, setMenu] = useState<{ x: number; y: number; context: TextContext } | null>(null);
  useEffect(() => {
    const open = (event: MouseEvent) => {
      // React and Radix business menus handle the event before it reaches window.
      if (event.defaultPrevented) return;
      event.preventDefault();
      const element = event.target instanceof Element ? event.target : null;
      const context = element ? captureTextContext(element) : null;
      if (!context) { setMenu(null); return; }
      const rect = context.target.getBoundingClientRect();
      setMenu({ x: event.clientX || rect.left + 12, y: event.clientY || rect.top + Math.min(rect.height, 24), context });
    };
    window.addEventListener('contextmenu', open);
    return () => window.removeEventListener('contextmenu', open);
  }, []);
  if (!menu) return null;
  const { context } = menu;
  const run = (action: () => void | Promise<void>) => () => {
    void Promise.resolve().then(action).catch(() => toast.error(t('textMenu.failed')));
  };
  const items: ContextMenuItem[] = [];
  if (context.editable) {
    items.push(
      { id: 'undo', label: t('textMenu.undo'), icon: <Undo2 className="h-3.5 w-3.5" />, shortcut: 'Ctrl+Z', onClick: run(() => { if (context.restore()) document.execCommand('undo'); }) },
      { id: 'redo', label: t('textMenu.redo'), icon: <Redo2 className="h-3.5 w-3.5" />, shortcut: 'Ctrl+Shift+Z', onClick: run(() => { if (context.restore()) document.execCommand('redo'); }) },
      { id: 'edit-separator', separator: true },
      { id: 'cut', label: t('textMenu.cut'), icon: <Scissors className="h-3.5 w-3.5" />, shortcut: 'Ctrl+X', disabled: !context.selectedText || context.sensitive, onClick: run(async () => { await navigator.clipboard.writeText(context.selectedText); context.replace(''); }) },
    );
  }
  items.push({ id: 'copy', label: t('textMenu.copy'), icon: <Copy className="h-3.5 w-3.5" />, shortcut: 'Ctrl+C', disabled: !context.selectedText || context.sensitive, onClick: run(() => navigator.clipboard.writeText(context.selectedText)) });
  if (context.content !== null) items.push({ id: 'copy-content', label: t('textMenu.copyContent'), icon: <Copy className="h-3.5 w-3.5" />, disabled: !context.content, onClick: run(() => navigator.clipboard.writeText(context.content!)) });
  if (context.editable) items.push({ id: 'paste', label: t('textMenu.paste'), icon: <ClipboardPaste className="h-3.5 w-3.5" />, shortcut: 'Ctrl+V', onClick: run(async () => { const text = await navigator.clipboard.readText(); if (text) context.replace(text); }) });
  items.push({ id: 'select-all', label: t(context.content !== null ? 'textMenu.selectContent' : 'textMenu.selectAll'), icon: <TextSelect className="h-3.5 w-3.5" />, onClick: context.selectAll });
  return <ContextMenu open x={menu.x} y={menu.y} items={items} onClose={() => setMenu(null)} portalTarget={context.portalTarget} className="z-[110]" label={t('textMenu.title')} />;
}
