type TextControl = HTMLInputElement | HTMLTextAreaElement;

export interface TextContext {
  target: HTMLElement;
  portalTarget: HTMLElement;
  editable: boolean;
  sensitive: boolean;
  selectedText: string;
  content: string | null;
  restore: () => boolean;
  selectAll: () => void;
  replace: (text: string) => void;
}

/** Snapshot the selection before opening a menu moves focus away from the editor. */
export function captureTextContext(element: Element): TextContext | null {
  const control = element.closest('input, textarea');
  const isControl = control instanceof HTMLTextAreaElement || (control instanceof HTMLInputElement && ['text', 'search', 'url', 'tel', 'email', 'password', 'number'].includes(control.type));
  const editor = element.closest<HTMLElement>('[contenteditable="true"], [contenteditable="plaintext-only"]');
  const code = element.closest<HTMLElement>('[data-text-context], pre, code');
  const selection = window.getSelection();
  const range = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
  const selected = !!selection && !selection.isCollapsed && !!range?.intersectsNode(element);
  if (!isControl && !editor && !code && !selected) return null;
  const target = (isControl ? control : editor || code || element) as HTMLElement;
  if (isControl && (control as TextControl).disabled) return null;
  const field = isControl ? control as TextControl : null;
  const value = field?.value;
  const supportsRange = field?.selectionStart !== null;
  const start = field ? field.selectionStart ?? 0 : undefined, end = field ? field.selectionEnd ?? field.value.length : undefined;
  const sensitive = field instanceof HTMLInputElement && field.type === 'password';
  const editable = field ? !field.readOnly : !!editor;
  const selectedText = sensitive ? '' : field ? field.value.slice(start ?? 0, end ?? 0) : selected ? selection!.toString() : '';
  const restore = () => {
    if (!target.isConnected || (field && (field.disabled || field.value !== value))) return false;
    target.focus({ preventScroll: true });
    if (field) {
      // Email inputs do not support setSelectionRange.
      if (supportsRange && start !== undefined && end !== undefined) field.setSelectionRange(start, end);
    } else if (range && target.contains(range.commonAncestorContainer)) {
      selection?.removeAllRanges(); selection?.addRange(range);
    }
    return true;
  };
  return {
    target,
    portalTarget: element.closest<HTMLElement>('[role="dialog"]') || document.body,
    editable, sensitive, selectedText,
    content: code && !editor && !field ? Array.from(code.querySelectorAll('[data-diff-content]')).map(node => node.textContent || '').join('\n') || code.innerText : null,
    restore,
    selectAll: () => {
      if (!restore()) return;
      if (field) field.select();
      else {
        const all = document.createRange(); all.selectNodeContents(target);
        selection?.removeAllRanges(); selection?.addRange(all);
      }
    },
    replace: text => {
      if (!editable || (field && field.readOnly) || !restore()) return;
      // Native editing keeps the undo stack and dispatches input events for controlled fields.
      if (document.execCommand(text ? 'insertText' : 'delete', false, text)) return;
      if (!field || start === null || start === undefined || end === null || end === undefined) throw new Error('Text editing is unavailable');
      const next = field.value.slice(0, start) + text + field.value.slice(end);
      const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(field, next);
      if (supportsRange) field.setSelectionRange(start + text.length, start + text.length);
      field.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: text ? 'insertText' : 'deleteContentBackward', data: text || null }));
    },
  };
}
