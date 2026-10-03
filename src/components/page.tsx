import type { ReactNode } from 'react';

export function Page({ title, description, actions, children }: { title: string; description?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-4xl px-8 pt-8 pb-12">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          {description ? <p className="mt-1 text-sm text-fg-muted">{description}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}
