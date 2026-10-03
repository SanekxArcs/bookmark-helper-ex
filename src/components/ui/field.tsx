import { forwardRef, type ComponentProps, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const control =
  'w-full rounded-md border border-border bg-bg text-sm text-fg placeholder:text-fg-subtle transition-[border-color,box-shadow] outline-none hover:border-border-strong focus:border-accent focus:ring-3 focus:ring-ring/40 disabled:opacity-50';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cn(control, 'h-8 px-2.5', className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(control, 'min-h-16 resize-none px-2.5 py-2 leading-5', className)} {...props} />;
  },
);

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={cn('relative', className)}>
      <select className={cn(control, 'h-8 appearance-none pr-8 pl-2.5')} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-fg-subtle" />
    </div>
  );
}

export function Label({ htmlFor, children, hint }: { htmlFor?: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-2">
      <label htmlFor={htmlFor} className="text-xs font-medium text-fg">
        {children}
      </label>
      {hint ? <span className="text-2xs text-fg-subtle">{hint}</span> : null}
    </div>
  );
}

export function Checkbox({ className, ...props }: ComponentProps<'input'>) {
  return <input type="checkbox" className={cn('size-3.5 shrink-0 cursor-pointer accent-accent', className)} {...props} />;
}
