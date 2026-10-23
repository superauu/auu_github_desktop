import React, { useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';

interface ModalSurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
  onDismiss: () => void;
  dismissible?: boolean;
  label?: string;
  children: React.ReactElement<{ children?: React.ReactNode; className?: string }>;
}

/** Preserve each dialog's layout while sharing focus trapping, Escape and focus restoration. */
export function ModalSurface({ onDismiss, dismissible = true, label = 'Dialog', children, ...props }: ModalSurfaceProps) {
  const previousFocus = useRef(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  return <Dialog.Root open onOpenChange={(open) => { if (!open && dismissible) onDismiss(); }}>
    <Dialog.Portal>
      <Dialog.Overlay {...props} onClick={(event) => {
        if (event.target === event.currentTarget && dismissible) onDismiss();
      }}>
        <Dialog.Content asChild aria-describedby={undefined}
          onCloseAutoFocus={(event) => { event.preventDefault(); previousFocus.current?.focus(); }}
          onEscapeKeyDown={(event) => { if (!dismissible) event.preventDefault(); }}
          onInteractOutside={(event) => { if (!dismissible || (event.target instanceof Element && event.target.closest('[data-auugit-toast]'))) event.preventDefault(); }}>
          {React.cloneElement(children, { className: `${children.props.className || ''} glass-dialog` }, <>
            <Dialog.Title className="sr-only">{label}</Dialog.Title>
            {children.props.children}
          </>)}
        </Dialog.Content>
      </Dialog.Overlay>
    </Dialog.Portal>
  </Dialog.Root>;
}
