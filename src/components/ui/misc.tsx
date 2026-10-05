import { useState, type ReactNode } from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { Globe, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-4 animate-spin text-fg-subtle', className)} />;
}

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger'; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-[18px] shrink-0 items-center rounded px-1.5 text-2xs font-medium',
        tone === 'neutral' && 'bg-muted text-fg-muted',
        tone === 'accent' && 'bg-accent-soft text-accent-text',
        tone === 'success' && 'bg-success/12 text-success',
        tone === 'warning' && 'bg-warning/12 text-warning',
        tone === 'danger' && 'bg-danger/12 text-danger',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-border bg-surface px-1 font-sans text-2xs text-fg-muted">
      {children}
    </kbd>
  );
}

export function Switch({ checked, onCheckedChange, id }: { checked: boolean; onCheckedChange: (v: boolean) => void; id?: string }) {
  return (
    <SwitchPrimitive.Root
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      className="relative inline-flex h-[18px] w-8 shrink-0 items-center rounded-full bg-border-strong transition-colors data-[state=checked]:bg-accent"
    >
      <SwitchPrimitive.Thumb className="block size-3.5 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-4 data-[state=checked]:bg-accent-fg" />
    </SwitchPrimitive.Root>
  );
}

const faviconBase = (browser.runtime.getURL as (path: string) => string)('/_favicon/');

/** Site icon from the browser's own favicon cache (no third-party requests). */
export function Favicon({ url, size = 16, className }: { url: string; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed || !/^https?:/.test(url)) {
    return <Globe className={cn('shrink-0 text-fg-subtle', className)} style={{ width: size, height: size }} />;
  }
  return (
    <img
      src={`${faviconBase}?pageUrl=${encodeURIComponent(url)}&size=${size * 2}`}
      width={size}
      height={size}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn('shrink-0 rounded-sm', className)}
    />
  );
}

export function EmptyState({ icon, title, children, className }: { icon?: ReactNode; title: string; children?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-10 text-center', className)}>
      {icon ? <div className="mb-3 text-fg-subtle [&_svg]:size-5">{icon}</div> : null}
      <p className="text-sm font-medium text-fg">{title}</p>
      {children ? <div className="mt-1 max-w-xs text-xs text-fg-muted">{children}</div> : null}
    </div>
  );
}

export function Callout({ tone = 'neutral', icon, children, action }: { tone?: 'neutral' | 'danger' | 'warning'; icon?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-xs',
        tone === 'neutral' && 'border-border bg-surface text-fg-muted',
        tone === 'warning' && 'border-warning/25 bg-warning/8 text-fg',
        tone === 'danger' && 'border-danger/25 bg-danger/8 text-fg',
      )}
    >
      {icon ? (
        <span className={cn('mt-px [&_svg]:size-3.5', tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : 'text-fg-subtle')}>
          {icon}
        </span>
      ) : null}
      <div className="min-w-0 flex-1 leading-[1.125rem]">{children}</div>
      {action}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon?: ReactNode }[];
  className?: string;
}) {
  return (
    <div role="radiogroup" className={cn('inline-flex rounded-lg border border-border bg-surface p-0.5', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'inline-flex h-7 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 text-xs font-medium text-fg-muted transition-colors hover:text-fg [&_svg]:size-3.5',
            value === o.value && 'bg-bg text-fg shadow-[0_0_0_1px_var(--border),0_1px_2px_rgb(0_0_0/0.06)]',
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}
