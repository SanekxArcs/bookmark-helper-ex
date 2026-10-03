import { useMemo, useState, type ReactNode } from 'react';
import { ChevronRight, Copy, KeyRound, ListChecks, Sparkles, Wand2 } from 'lucide-react';
import { moveWithUndo } from '@/components/actions';
import { FolderPicker } from '@/components/folder-picker';
import { ProposalReview } from '@/components/proposal-review';
import { toast } from '@/components/toaster';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/field';
import { Callout, EmptyState, Spinner } from '@/components/ui/misc';
import { sortBookmarks, type Move } from '@/lib/ai';
import { defaultRoot, type BookmarkIndex } from '@/lib/bookmarks';
import { findDuplicates, redundantCount } from '@/lib/duplicates';
import { AIError, errorMessage } from '@/lib/gemini';
import { useAbortable } from '@/lib/hooks';
import type { Settings } from '@/lib/settings';
import { openManager, plural } from '@/lib/utils';

interface Props {
  index: BookmarkIndex;
  settings: Settings;
  onOpenSettings: () => void;
}

type State =
  | { step: 'idle' }
  | { step: 'analyzing'; done: number; total: number }
  | { step: 'review'; moves: Move[] }
  | { step: 'empty' };

export function OrganizeView({ index, settings, onOpenSettings }: Props) {
  const nextSignal = useAbortable();
  const [state, setState] = useState<State>({ step: 'idle' });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);

  // Start with the root that holds the most loose bookmarks: that's usually the mess.
  const [sourceId, setSourceId] = useState<string>(() => {
    const roots = index.roots.filter((r) => !r.locked);
    const best = [...roots].sort((a, b) => b.bookmarkCount - a.bookmarkCount)[0];
    return (best ?? defaultRoot(index, settings.newFolderRoot)).id;
  });
  const source = index.folderById.get(sourceId);
  const sourceBookmarks = useMemo(() => index.bookmarks.filter((b) => b.parentId === sourceId), [index, sourceId]);
  const duplicates = useMemo(() => redundantCount(findDuplicates(index.bookmarks)), [index]);

  const analyze = async () => {
    const signal = nextSignal();
    setState({ step: 'analyzing', done: 0, total: sourceBookmarks.length });
    try {
      const moves = await sortBookmarks({ settings, index, signal }, sourceBookmarks, (done, total) =>
        setState({ step: 'analyzing', done, total }),
      );
      setSelected(new Set(moves.map((m) => m.bookmarkId)));
      setState(moves.length ? { step: 'review', moves } : { step: 'empty' });
    } catch (err) {
      setState({ step: 'idle' });
      if (err instanceof AIError && err.kind === 'aborted') return;
      toast.error('Couldn’t analyze bookmarks', { description: errorMessage(err) });
    }
  };

  const apply = async () => {
    if (state.step !== 'review') return;
    setApplying(true);
    try {
      await moveWithUndo(state.moves.filter((m) => selected.has(m.bookmarkId)), index, settings);
      setState({ step: 'idle' });
    } finally {
      setApplying(false);
    }
  };

  if (state.step === 'review') {
    return (
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 items-center justify-between gap-2 px-3 pt-3 pb-2">
          <div className="min-w-0">
            <p className="text-sm font-medium">{plural(state.moves.length, 'suggested move')}</p>
            <p className="truncate text-xs text-fg-muted">From {source?.path}</p>
          </div>
        </div>
        <div className="scroll-area min-h-0 flex-1 px-3 pb-3">
          <ProposalReview
            compact
            index={index}
            settings={settings}
            moves={state.moves}
            selected={selected}
            onSelectedChange={setSelected}
            onRetarget={(id, target) =>
              setState({ step: 'review', moves: state.moves.map((m) => (m.bookmarkId === id ? { ...m, target, reason: '' } : m)) })
            }
          />
        </div>
        <div className="flex shrink-0 gap-2 border-t border-border p-3">
          <Button className="flex-1" onClick={() => setState({ step: 'idle' })} disabled={applying}>
            Discard
          </Button>
          <Button variant="primary" className="flex-1" onClick={apply} loading={applying} disabled={!selected.size}>
            Move {plural(selected.size, 'bookmark')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="scroll-area h-full space-y-3 p-3">
      <section className="rounded-xl border border-border bg-surface p-3.5">
        <div className="mb-3 flex items-start gap-2.5">
          <div className="grid size-7 shrink-0 place-items-center rounded-md bg-accent-soft text-accent-text">
            <Wand2 className="size-3.5" />
          </div>
          <div>
            <h2 className="text-sm font-medium">Tidy up a folder</h2>
            <p className="text-xs text-fg-muted">AI suggests better folders for its bookmarks. You review every move.</p>
          </div>
        </div>

        <Label hint={plural(sourceBookmarks.length, 'bookmark')}>Folder to sort</Label>
        <FolderPicker index={index} value={sourceId} onSelect={(t) => t.type === 'existing' && setSourceId(t.folderId)} />

        {state.step === 'analyzing' ? (
          <div className="mt-3 flex items-center gap-2.5 rounded-lg border border-border bg-bg px-3 py-2.5">
            <Spinner />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-fg">Analyzing bookmarks…</p>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-500"
                  style={{ width: `${Math.max(8, (state.done / Math.max(state.total, 1)) * 100)}%` }}
                />
              </div>
            </div>
            <Button size="sm" variant="ghost" onClick={() => (nextSignal(), setState({ step: 'idle' }))}>
              Cancel
            </Button>
          </div>
        ) : state.step === 'empty' ? (
          <EmptyState icon={<ListChecks />} title="Looks well organized" className="py-6">
            No better folders found for these bookmarks.
          </EmptyState>
        ) : null}

        {settings.apiKey ? (
          state.step !== 'analyzing' ? (
            <Button variant="primary" className="mt-3 w-full" onClick={analyze} disabled={!sourceBookmarks.length}>
              <Sparkles />
              {sourceBookmarks.length ? `Suggest moves for ${plural(sourceBookmarks.length, 'bookmark')}` : 'This folder has no bookmarks'}
            </Button>
          ) : null
        ) : (
          <div className="mt-3">
            <Callout
              icon={<KeyRound />}
              action={
                <Button size="sm" className="-my-1" onClick={onOpenSettings}>
                  Set up
                </Button>
              }
            >
              Add a Gemini API key to use AI sorting.
            </Callout>
          </div>
        )}
      </section>

      <NavCard
        icon={<Copy />}
        title="Duplicates"
        description={duplicates ? `${plural(duplicates, 'redundant bookmark')} found` : 'No exact duplicates found'}
        onClick={() => openManager('duplicates').then(() => window.close())}
      />
      <NavCard
        icon={<ListChecks />}
        title="Full organizer"
        description="Browse folders, multi-select, move and clean up"
        onClick={() => openManager('organize').then(() => window.close())}
      />
    </div>
  );
}

function NavCard({ icon, title, description, onClick }: { icon: ReactNode; title: string; description: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface px-3.5 py-3 text-left transition-colors hover:bg-hover"
    >
      <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted text-fg-muted [&_svg]:size-3.5">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block truncate text-xs text-fg-muted">{description}</span>
      </span>
      <ChevronRight className="size-4 text-fg-subtle" />
    </button>
  );
}
