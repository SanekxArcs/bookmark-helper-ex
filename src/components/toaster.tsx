import { Toaster as Sonner } from 'sonner';
import { AlertCircle, CheckCircle2, Info, Loader2 } from 'lucide-react';

export { toast } from 'sonner';

export function Toaster({ theme, position = 'bottom-center' }: { theme: 'light' | 'dark'; position?: 'bottom-center' | 'bottom-right' }) {
  return (
    <Sonner
      theme={theme}
      position={position}
      offset={12}
      gap={8}
      visibleToasts={3}
      icons={{
        success: <CheckCircle2 className="size-4 text-success" />,
        error: <AlertCircle className="size-4 text-danger" />,
        info: <Info className="size-4 text-fg-subtle" />,
        loading: <Loader2 className="size-4 animate-spin text-fg-subtle" />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'flex w-[var(--width)] items-center gap-2.5 rounded-lg border border-border bg-bg px-3 py-2.5 text-sm text-fg shadow-pop',
          title: 'font-medium leading-5',
          description: 'text-xs text-fg-muted',
          icon: 'flex shrink-0 self-start mt-0.5',
          content: 'min-w-0 flex-1',
          actionButton:
            'ml-auto h-7 shrink-0 rounded-md border border-border px-2.5 text-xs font-medium text-fg hover:bg-hover',
        },
      }}
      style={{ ['--width' as string]: 'min(360px, calc(100vw - 24px))' }}
    />
  );
}
