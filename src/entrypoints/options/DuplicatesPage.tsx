import { useMemo, useState } from 'react';
import { CheckCircle2, ExternalLink, Sparkles, Trash2 } from 'lucide-react';
import { removeWithUndo } from '@/components/actions';
import { Page } from '@/components/page';
import { toast } from '@/components/toaster';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Badge, EmptyState, Favicon, Segmented } from '@/components/ui/misc';
import { resolveDuplicates, type DuplicateDecision } from '@/lib/ai';
import { displayUrl, openUrl, type Bookmark, type BookmarkIndex } from '@/lib/bookmarks';
import { findDuplicates, redundantCount, type DuplicateGroup, type DuplicateKind } from '@/lib/duplicates';
import { AIError, errorMessage } from '@/lib/gemini';
import type { Settings } from '@/lib/settings';
import { cn, plural } from '@/lib/utils';

const KIND_INFO: Record<DuplicateKind, { label: string; description: string }> = {
  exact: { label: 'Exact', description: 'Same page, ignoring http/https, www, trailing slashes and tracking parameters.' },
  similar: { label: 'Similar', description: 'Same address with different query parameters. Often the same page, sometimes not.' },
  site: { label: 'Same site', description: 'Many bookmarks from one website. Not duplicates, but worth a look when cleaning up.' },
};

const COLLAPSED_ITEMS = 6;

export function DuplicatesPage({ index, settings }: { index: BookmarkIndex; settings: Settings }) {
  const groups = useMemo(() => findDuplicates(index.bookmarks), [index]);
  const [kind, setKind] = useState<DuplicateKind>('exact');
  const [confirmAll, setConfirmAll] = useState(false);
  const counts = useMemo(
    () => ({
      exact: groups.filter((g) => g.kind === 'exact').length,
      similar: groups.filter((g) => g.kind === 'similar').length,
      site: groups.filter((g) => g.kind === 'site').length,
    }),
    [groups],
  );
  const visible = groups.filter((g) => g.kind === kind);
  const redundant = redundantCount(groups);

  // Keep the oldest copy of each exact duplicate.
  const removeAllExact = () =>
    removeWithUndo(groups.filter((g) => g.kind === 'exact').flatMap((g) => g.items.slice(1).map((b) => b.id)));

  return (
    <div className="scroll-area h-full">
      <Page
        title="Duplicates"
        description="Find bookmarks saved more than once and keep just one copy."
        actions={
          redundant ? (
            <Button variant="danger" onClick={() => setConfirmAll(true)}>
              <Trash2 /> Remove {plural(redundant, 'exact duplicate')}
            </Button>
          ) : null
        }
      >
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <Segmented
            value={kind}
            onChange={setKind}
            options={(Object.keys(KIND_INFO) as DuplicateKind[]).map((k) => ({
              value: k,
              label: `${KIND_INFO[k].label} · ${counts[k]}`,
            }))}
          />
          <p className="text-xs text-fg-muted">{KIND_INFO[kind].description}</p>
        </div>

        {visible.length ? (
          <div className="space-y-3">
            {visible.map((g) => (
              <GroupCard key={g.key} group={g} settings={settings} index={index} />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-border">
            <EmptyState className="py-16" icon={<CheckCircle2 />} title={`No ${KIND_INFO[kind].label.toLowerCase()} duplicates`}>
              {kind === 'exact' ? 'Every bookmark points to a unique page.' : 'Nothing to review here.'}
            </EmptyState>
          </div>
        )}
      </Page>

      <ConfirmDialog
        open={confirmAll}
        onOpenChange={setConfirmAll}
        title={`Remove ${plural(redundant, 'duplicate')}?`}
        description="The oldest copy of each bookmark is kept. You can undo this right after."
        confirmLabel="Remove duplicates"
        destructive
        onConfirm={removeAllExact}
      />
    </div>
  );
}

function GroupCard({ group, settings, index }: { group: DuplicateGroup; settings: Settings; index: BookmarkIndex }) {
  const [expanded, setExpanded] = useState(false);
  const [decision, setDecision] = useState<DuplicateDecision | null>(null);
  const [asking, setAsking] = useState(false);
  const items = expanded ? group.items : group.items.slice(0, COLLAPSED_ITEMS);
  const hidden = group.items.length - items.length;

  const keepOnly = (keep: Bookmark) => removeWithUndo(group.items.filter((b) => b.id !== keep.id).map((b) => b.id));

  const askAI = async () => {
    if (!settings.apiKey) {
      toast.error('Gemini API key needed', { action: { label: 'Settings', onClick: () => (location.hash = 'settings') } });
      return;
    }
    setAsking(true);
    try {
      setDecision(await resolveDuplicates({ settings, index }, group.items));
    } catch (err) {
      if (!(err instanceof AIError && err.kind === 'aborted')) toast.error('AI couldn’t decide', { description: errorMessage(err) });
    } finally {
      setAsking(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-xl border border-border">
      <header className="flex items-center gap-3 border-b border-border bg-surface px-4 py-2.5">
        <Favicon url={group.items[0]!.url} />
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg-muted" title={group.label}>
          {group.label}
        </span>
        <Badge>{plural(group.items.length, 'copy', 'copies')}</Badge>
        {group.kind !== 'site' ? (
          <Button size="sm" variant="ghost" onClick={() => keepOnly(group.items[0]!)} title="Keep the oldest copy, remove the rest">
            Keep oldest
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" onClick={askAI} loading={asking}>
          {asking ? null : <Sparkles className="text-accent-text" />}
          Ask AI
        </Button>
      </header>

      {decision ? (
        <div className="flex items-start gap-3 border-b border-border bg-accent-soft px-4 py-3 text-sm animate-in">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-accent-text" />
          <div className="min-w-0 flex-1">
            <p>
              Keep <span className="font-medium">“{index.bookmarkById.get(decision.keepId)?.title || 'one copy'}”</span>
              {decision.removeIds.length ? `, remove ${plural(decision.removeIds.length, 'other')}.` : '. Nothing to remove.'}
            </p>
            {decision.reason ? <p className="mt-0.5 text-xs text-fg-muted">{decision.reason}</p> : null}
          </div>
          <Button size="sm" onClick={() => setDecision(null)}>
            Dismiss
          </Button>
          {decision.removeIds.length ? (
            <Button size="sm" variant="primary" onClick={() => removeWithUndo(decision.removeIds).then(() => setDecision(null))}>
              Apply
            </Button>
          ) : null}
        </div>
      ) : null}

      <ul>
        {items.map((b) => {
          const keep = decision?.keepId === b.id;
          const remove = decision?.removeIds.includes(b.id);
          return (
            <li
              key={b.id}
              className={cn('group flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-b-0', remove && 'opacity-50')}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm">{b.title || displayUrl(b.url)}</span>
                  {keep ? <Badge tone="success">Keep</Badge> : remove ? <Badge>Remove</Badge> : null}
                </div>
                <p className="truncate text-xs text-fg-subtle">
                  {b.path}
                  {group.kind !== 'exact' ? <> · {displayUrl(b.url)}</> : null}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                {group.kind !== 'site' ? (
                  <Button size="sm" variant="ghost" onClick={() => keepOnly(b)}>
                    Keep only this
                  </Button>
                ) : null}
                <Button size="sm" variant="ghost" icon title="Open" aria-label="Open" onClick={() => openUrl(b.url)}>
                  <ExternalLink />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon
                  title="Delete"
                  aria-label="Delete"
                  className="hover:text-danger"
                  onClick={() => removeWithUndo([b.id])}
                >
                  <Trash2 />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      {hidden > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="w-full border-t border-border px-4 py-2 text-left text-xs text-fg-muted hover:bg-hover hover:text-fg"
        >
          Show {hidden} more
        </button>
      ) : null}
    </section>
  );
}
