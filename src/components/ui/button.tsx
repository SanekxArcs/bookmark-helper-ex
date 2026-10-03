import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const variants = {
  primary: 'bg-accent text-accent-fg hover:bg-accent/90 disabled:opacity-50',
  secondary: 'border border-border bg-bg text-fg hover:bg-hover disabled:opacity-50',
  ghost: 'text-fg-muted hover:bg-hover hover:text-fg disabled:opacity-40',
  danger: 'border border-border bg-bg text-danger hover:bg-danger/10 disabled:opacity-50',
};

const sizes = {
  sm: 'h-7 gap-1.5 rounded-md px-2.5 text-xs',
  md: 'h-8 gap-2 rounded-md px-3 text-sm',
  lg: 'h-9 gap-2 rounded-lg px-4 text-sm',
};

const iconSizes = {
  sm: 'size-7 rounded-md',
  md: 'size-8 rounded-md',
  lg: 'size-9 rounded-lg',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  icon?: boolean;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, loading, disabled, className, children, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-colors select-none [&_svg]:size-4 [&_svg]:shrink-0',
        variants[variant],
        icon ? iconSizes[size] : sizes[size],
        size === 'sm' && '[&_svg]:size-3.5',
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="animate-spin" /> : null}
      {loading && icon ? null : children}
    </button>
  );
});
