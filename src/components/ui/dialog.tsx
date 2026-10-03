import type { ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  destructive,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-overlay animate-in" />
        <DialogPrimitive.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-32px)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-bg p-5 shadow-pop animate-in">
          <DialogPrimitive.Title className="text-sm font-semibold">{title}</DialogPrimitive.Title>
          {description ? (
            <DialogPrimitive.Description className="mt-1.5 text-xs text-fg-muted">{description}</DialogPrimitive.Description>
          ) : (
            <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <DialogPrimitive.Close asChild>
              <Button size="sm">Cancel</Button>
            </DialogPrimitive.Close>
            <Button
              size="sm"
              variant={destructive ? 'danger' : 'primary'}
              className={destructive ? 'border-danger bg-danger text-white hover:bg-danger/90' : undefined}
              onClick={() => {
                onConfirm();
                onOpenChange(false);
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Side panel used for reviewing AI proposals on the full-page manager. */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-overlay animate-in" />
        <DialogPrimitive.Content
          onOpenAutoFocus={(e) => e.preventDefault()}
          className={cn(
            'fixed inset-y-0 right-0 z-40 flex w-full max-w-lg flex-col border-l border-border bg-bg shadow-pop animate-in',
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div className="min-w-0">
              <DialogPrimitive.Title className="text-sm font-semibold">{title}</DialogPrimitive.Title>
              <DialogPrimitive.Description className={cn('mt-0.5 text-xs text-fg-muted', !description && 'sr-only')}>
                {description ?? title}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="sm" icon aria-label="Close">
                <X />
              </Button>
            </DialogPrimitive.Close>
          </div>
          <div className="scroll-area min-h-0 flex-1">{children}</div>
          {footer ? <div className="border-t border-border px-5 py-3">{footer}</div> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
