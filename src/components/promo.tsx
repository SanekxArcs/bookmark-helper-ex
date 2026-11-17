import { ArrowUpRight, X } from 'lucide-react';
import { OTHER_EXTENSIONS, SIDE_BUDDY, type PromoExtension } from '@/lib/promo';
import { cn } from '@/lib/utils';

function PromoIcon({ ext, className }: { ext: PromoExtension; className?: string }) {
  return <img src={ext.icon} alt="" className={cn('size-8 shrink-0 rounded-lg', className)} />;
}

/** "More from the author" rows for settings; render inside a settings Section. */
export function OtherExtensionsList() {
  return (
    <>
      {OTHER_EXTENSIONS.map((ext) => (
        <a
          key={ext.id}
          href={ext.url}
          target="_blank"
          rel="noreferrer"
          className="group flex items-center gap-3 px-3.5 py-3 transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-hover"
        >
          <PromoIcon ext={ext} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-fg">{ext.name}</p>
            <p className="text-xs text-fg-muted">{ext.tagline}</p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-accent-text">
            Get it
            <ArrowUpRight className="size-3.5 transition-transform group-hover:-translate-y-px group-hover:translate-x-px" />
          </span>
        </a>
      ))}
    </>
  );
}

/** Compact list for the bottom of the full manager's sidebar. */
export function OtherExtensionsSidebar() {
  return (
    <div className="mx-2 mb-2 rounded-lg border border-border bg-bg p-1">
      <p className="px-1.5 pb-0.5 pt-1 text-2xs text-fg-subtle">Also by the author</p>
      {OTHER_EXTENSIONS.map((ext) => (
        <a
          key={ext.id}
          href={ext.url}
          target="_blank"
          rel="noreferrer"
          title={ext.tagline}
          className="group flex items-center gap-2 rounded-md p-1.5 transition-colors hover:bg-hover"
        >
          <PromoIcon ext={ext} className="size-5 rounded" />
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-fg">{ext.name}</span>
          <ArrowUpRight className="size-3.5 shrink-0 text-fg-subtle group-hover:text-fg" />
        </a>
      ))}
    </div>
  );
}

/** One-time, dismissible Side Buddy tip shown in the popup after a few saves. */
export function SideBuddyTip({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="relative flex items-center gap-3 rounded-xl border border-border bg-surface p-3 pr-9 animate-in">
      <PromoIcon ext={SIDE_BUDDY} />
      <div className="min-w-0 flex-1 text-xs">
        <p className="font-medium text-fg">Lots of tabs open too?</p>
        <p className="text-fg-muted">
          {SIDE_BUDDY.name} keeps them in folders in the side panel.{' '}
          <a href={SIDE_BUDDY.url} target="_blank" rel="noreferrer" className="font-medium text-accent-text hover:underline">
            Try it free
          </a>
        </p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        title="Don’t show again"
        aria-label="Don’t show again"
        className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-md text-fg-subtle transition-colors hover:bg-hover hover:text-fg [&_svg]:size-3.5"
      >
        <X />
      </button>
    </div>
  );
}
