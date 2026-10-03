import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import {
  ChevronRight,
  ExternalLink,
  Folder as FolderIcon,
  FolderInput,
  FolderOpen,
  Inbox,
  KeyRound,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { moveWithUndo, removeWithUndo } from '@/components/actions';
import { FolderPicker } from '@/components/folder-picker';
import { ProposalReview } from '@/components/proposal-review';
import { toast } from '@/components/toaster';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Sheet } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/field';
import { EmptyState, Favicon, Spinner } from '@/components/ui/misc';
import { sortBookmarks, suggestFolder, type Move } from '@/lib/ai';
import { displayUrl, openUrl, type Bookmark, type BookmarkIndex, type Folder } from '@/lib/bookmarks';
import { AIError, errorMessage } from '@/lib/gemini';
import { useAbortable } from '@/lib/hooks';
import type { Settings } from '@/lib/settings';
import { cn, plural } from '@/lib/utils';

interface Props {
  index: BookmarkIndex;
  settings: Settings;
  folderId?: string;
  /** Bookmark to scroll to and highlight (from "Show in folder"). */
  focusId?: string;
  onFolderChange: (id: string) => void;
}

type Review = { status: 'loading'; done: number; total: number } | { status: 'ready'; moves: Move[] } | null;

const dateFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

function ancestors(index: BookmarkIndex, folder: Folder) {
  const chain: Folder[] = [];
  for (let f: Folder | undefined = folder; f; f = f.parentId ? index.folderById.get(f.parentId) : undefined) chain.unshift(f);
  return chain;
}

export function OrganizePage({ index, settings, folderId, focusId, onFolderChange }: Props) {
  const folder = (folderId && index.folderById.get(folderId)) || index.roots[0];
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(index.roots.map((r) => r.id)));
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [flashId, setFlashId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [review, setReview] = useState<Review>(null);
  const [reviewSelected, setReviewSelected] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const lastClicked = useRef<number | null>(null);
  const nextSignal = useAbortable();

  const chain = useMemo(() => (folder ? ancestors(index, folder) : []), [index, folder]);

  useEffect(() => {
    setSelected(new Set());
    setFilter('');
    lastClicked.current = null;
    // Reveal the open folder in the tree.
    setExpanded((prev) => new Set([...prev, ...chain.slice(0, -1).map((f) => f.id)]));
  }, [folder?.id]);

  const subfolders = useMemo(
    () => (folder ? folder.childFolderIds.map((id) => index.folderById.get(id)!).filter(Boolean) : []),
    [index, folder],
  );
  const bookmarks = useMemo(
    () => (folder ? index.bookmarks.filter((b) => b.parentId === folder.id).sort((a, b) => a.index - b.index) : []),
    [index, folder],
  );
  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return bookmarks;
    return bookmarks.filter((b) => b.title.toLowerCase().includes(q) || b.url.toLowerCase().includes(q));
  }, [bookmarks, filter]);

  // Drop selections for bookmarks that disappeared (moved or deleted elsewhere).
  useEffect(() => {
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => bookmarks.some((b) => b.id === id)));
      return next.size === prev.size ? prev : next;
    });
  }, [bookmarks]);

  useEffect(() => {
    if (!focusId) return;
    const el = document.querySelector(`[data-bookmark-id="${CSS.escape(focusId)}"]`);
    el?.scrollIntoView({ block: 'center' });
    setFlashId(focusId);
    const t = setTimeout(() => setFlashId(null), 1600);
    return () => clearTimeout(t);
  }, [focusId, bookmarks]);

  if (!folder) {
    return <EmptyState className="h-full" icon={<Inbox />} title="No bookmark folders found" />;
  }

  const selectedBookmarks = bookmarks.filter((b) => selected.has(b.id));
  const allVisibleSelected = visible.length > 0 && visible.every((b) => selected.has(b.id));

  const toggleRow = (i: number, e: MouseEvent) => {
    const id = visible[i]!.id;
    const next = new Set(selected);
    if (e.shiftKey && lastClicked.current !== null) {
      const from = Math.min(lastClicked.current, i);
      const to = Math.max(lastClicked.current, i);
      const on = !selected.has(id);
      for (const b of visible.slice(from, to + 1)) on ? next.add(b.id) : next.delete(b.id);
    } else {
      next.has(id) ? next.delete(id) : next.add(id);
    }
    lastClicked.current = i;
    setSelected(next);
  };

  const ensureKey = () => {
    if (settings.apiKey) return true;
    toast.error('Gemini API key needed', {
      description: 'Add your key in Settings to use AI sorting.',
      action: { label: 'Settings', onClick: () => (location.hash = 'settings') },
    });
    return false;
  };

  const runSort = async (items: Bookmark[]) => {
    if (!ensureKey() || !items.length) return;
    const signal = nextSignal();
    setReview({ status: 'loading', done: 0, total: items.length });
    try {
      const moves = await sortBookmarks({ settings, index, signal }, items, (done, total) =>
        setReview((r) => (r?.status === 'loading' ? { status: 'loading', done, total } : r)),
      );
      if (signal.aborted) return;
      if (!moves.length) {
        setReview(null);
        toast.success('Already well organized', { description: 'AI found no better folders for these bookmarks.' });
        return;
      }
      setReviewSelected(new Set(moves.map((m) => m.bookmarkId)));
      setReview({ status: 'ready', moves });
    } catch (err) {
      setReview(null);
      if (err instanceof AIError && err.kind === 'aborted') return;
      toast.error('Couldn’t analyze bookmarks', { description: errorMessage(err) });
    }
  };

  const suggestOne = async (b: Bookmark) => {
    if (!ensureKey()) return;
    const signal = nextSignal();
    setReview({ status: 'loading', done: 0, total: 1 });
    try {
      const s = await suggestFolder({ settings, index, signal }, { title: b.title, url: b.url });
      if (signal.aborted) return;
      if (s.target.type === 'existing' && s.target.folderId === b.parentId) {
        setReview(null);
        toast.success('Already in the best folder', { description: s.reason || undefined });
        return;
      }
      setReviewSelected(new Set([b.id]));
      setReview({ status: 'ready', moves: [{ bookmarkId: b.id, ...s }] });
    } catch (err) {
      setReview(null);
      if (err instanceof AIError && err.kind === 'aborted') return;
      toast.error('Couldn’t get a suggestion', { description: errorMessage(err) });
    }
  };

  const applyReview = async () => {
    if (review?.status !== 'ready') return;
    setApplying(true);
    try {
      await moveWithUndo(review.moves.filter((m) => reviewSelected.has(m.bookmarkId)), index, settings);
      setReview(null);
    } finally {
      setApplying(false);
    }
  };

  const deleteSelected = () => removeWithUndo([...selected]).then(() => setSelected(new Set()));

  return (
    <div className="flex h-full">
      {/* Folder tree */}
      <div className="flex w-64 shrink-0 flex-col border-r border-border">
        <div className="flex h-14 shrink-0 items-center px-4 text-xs font-medium text-fg-muted">Folders</div>
        <div className="scroll-area min-h-0 flex-1 px-2 pb-4">
          <ul>
            {index.roots.map((root) => (
              <TreeNode
                key={root.id}
                index={index}
                folder={root}
                activeId={folder.id}
                expanded={expanded}
                onToggle={(id) =>
                  setExpanded((prev) => {
                    const next = new Set(prev);
                    next.has(id) ? next.delete(id) : next.add(id);
                    return next;
                  })
                }
                onSelect={onFolderChange}
              />
            ))}
          </ul>
        </div>
      </div>

      {/* Folder contents */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-6">
          <nav aria-label="Folder path" className="flex min-w-0 flex-1 items-center gap-1 text-sm">
            {chain.map((f, i) => (
              <span key={f.id} className="flex min-w-0 items-center gap-1">
                {i > 0 ? <ChevronRight className="size-3.5 shrink-0 text-fg-subtle" /> : null}
                {i === chain.length - 1 ? (
                  <span className="truncate font-medium text-fg">{f.title}</span>
                ) : (
                  <button type="button" onClick={() => onFolderChange(f.id)} className="truncate text-fg-muted hover:text-fg">
                    {f.title}
                  </button>
                )}
              </span>
            ))}
            <span className="ml-2 shrink-0 text-xs text-fg-subtle tabular-nums">{plural(bookmarks.length, 'bookmark')}</span>
          </nav>
          <div className="relative w-56">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-fg-subtle" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter this folder"
              className="h-8 w-full rounded-md border border-border bg-bg pr-2.5 pl-8 text-sm outline-none placeholder:text-fg-subtle hover:border-border-strong focus:border-accent focus:ring-3 focus:ring-ring/40"
            />
          </div>
          <Button
            variant="primary"
            onClick={() => runSort(selectedBookmarks.length ? selectedBookmarks : bookmarks)}
            disabled={!bookmarks.length || folder.locked}
            title={settings.apiKey ? undefined : 'Add a Gemini API key in Settings'}
          >
            {settings.apiKey ? <Sparkles /> : <KeyRound />}
            {selectedBookmarks.length ? `Sort ${plural(selectedBookmarks.length, 'bookmark')}` : 'Sort folder with AI'}
          </Button>
        </div>

        {selected.size ? (
          <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border bg-surface px-6 text-sm animate-in">
            <Checkbox
              checked={allVisibleSelected}
              onChange={(e) => setSelected(e.target.checked ? new Set(visible.map((b) => b.id)) : new Set())}
              aria-label="Select all"
            />
            <span className="mr-2 font-medium tabular-nums">{selected.size} selected</span>
            <FolderPicker
              index={index}
              exclude={[folder.id]}
              allowCreate
              onSelect={(target) =>
                moveWithUndo(
                  [...selected].map((bookmarkId) => ({ bookmarkId, target })),
                  index,
                  settings,
                ).then(() => setSelected(new Set()))
              }
              trigger={
                <Button size="sm">
                  <FolderInput /> Move to…
                </Button>
              }
            />
            <Button size="sm" variant="danger" onClick={() => (selected.size >= 5 ? setConfirmDelete(true) : deleteSelected())}>
              <Trash2 /> Delete
            </Button>
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSelected(new Set())}>
              <X /> Clear
            </Button>
          </div>
        ) : null}

        <div className="scroll-area min-h-0 flex-1">
          {subfolders.length || visible.length ? (
            <ul className="px-3 py-2">
              {!filter
                ? subfolders.map((f) => (
                    <li key={f.id}>
                      <button
                        type="button"
                        onClick={() => onFolderChange(f.id)}
                        className="flex h-10 w-full items-center gap-3 rounded-md px-3 text-left hover:bg-hover"
                      >
                        <span className="size-3.5" />
                        <FolderIcon className="size-4 shrink-0 text-fg-subtle" />
                        <span className="min-w-0 flex-1 truncate text-sm">{f.title}</span>
                        <span className="text-xs text-fg-subtle tabular-nums">{f.bookmarkCount || ''}</span>
                        <ChevronRight className="size-3.5 text-fg-subtle" />
                      </button>
                    </li>
                  ))
                : null}
              {visible.map((b, i) => (
                <li
                  key={b.id}
                  data-bookmark-id={b.id}
                  onClick={(e) => toggleRow(i, e)}
                  className={cn(
                    'group flex h-12 cursor-default items-center gap-3 rounded-md px-3 transition-colors select-none hover:bg-hover',
                    selected.has(b.id) && 'bg-accent-soft hover:bg-accent-soft',
                    flashId === b.id && 'ring-2 ring-accent',
                  )}
                >
                  <Checkbox checked={selected.has(b.id)} readOnly tabIndex={-1} aria-label={`Select ${b.title}`} />
                  <Favicon url={b.url} />
                  <div className="min-w-0 flex-1">
                    <a
                      href={b.url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="block truncate text-sm text-fg hover:underline"
                      title={b.title}
                    >
                      {b.title || displayUrl(b.url)}
                    </a>
                    <p className="truncate text-xs text-fg-subtle">{displayUrl(b.url)}</p>
                  </div>
                  <span className="hidden w-28 shrink-0 text-right text-xs text-fg-subtle tabular-nums group-hover:hidden lg:block">
                    {b.dateAdded ? dateFormat.format(b.dateAdded) : ''}
                  </span>
                  <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="sm" icon title="Suggest a folder" aria-label="Suggest a folder" onClick={() => suggestOne(b)}>
                      <Sparkles />
                    </Button>
                    <Button variant="ghost" size="sm" icon title="Open in new tab" aria-label="Open in new tab" onClick={() => openUrl(b.url)}>
                      <ExternalLink />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
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
              ))}
            </ul>
          ) : (
            <EmptyState className="py-24" icon={filter ? <Search /> : <FolderOpen />} title={filter ? 'No matches' : 'This folder is empty'}>
              {filter ? `Nothing in ${folder.title} matches “${filter}”.` : undefined}
            </EmptyState>
          )}
        </div>
      </div>

      <Sheet
        open={review !== null}
        onOpenChange={(open) => {
          if (!open) {
            nextSignal();
            setReview(null);
          }
        }}
        title={review?.status === 'ready' ? `Review ${plural(review.moves.length, 'move')}` : 'Analyzing bookmarks'}
        description={review?.status === 'ready' ? 'Uncheck anything you want to keep where it is.' : `From ${folder.path}`}
        footer={
          review?.status === 'ready' ? (
            <div className="flex justify-end gap-2">
              <Button onClick={() => setReview(null)} disabled={applying}>
                Cancel
              </Button>
              <Button variant="primary" onClick={applyReview} loading={applying} disabled={!reviewSelected.size}>
                Move {plural(reviewSelected.size, 'bookmark')}
              </Button>
            </div>
          ) : undefined
        }
      >
        {review?.status === 'ready' ? (
          <ProposalReview
            index={index}
            settings={settings}
            moves={review.moves}
            selected={reviewSelected}
            onSelectedChange={setReviewSelected}
            onRetarget={(id, target) =>
              setReview({ status: 'ready', moves: review.moves.map((m) => (m.bookmarkId === id ? { ...m, target, reason: '' } : m)) })
            }
          />
        ) : review?.status === 'loading' ? (
          <div className="flex flex-col items-center gap-4 px-10 py-24 text-center">
            <Spinner className="size-5" />
            <div className="w-full max-w-60">
              <p className="text-sm">
                {review.total > 1 ? `Analyzing… ${review.done} of ${review.total} done` : 'Finding the best folder…'}
              </p>
              {review.total > 1 ? (
                <div className="mt-3 h-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-accent transition-[width] duration-500"
                    style={{ width: `${Math.max(6, (review.done / review.total) * 100)}%` }}
                  />
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </Sheet>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${plural(selected.size, 'bookmark')}?`}
        description="You can undo this right after."
        confirmLabel="Delete"
        destructive
        onConfirm={deleteSelected}
      />
    </div>
  );
}

function TreeNode({
  index,
  folder,
  activeId,
  expanded,
  onToggle,
  onSelect,
}: {
  index: BookmarkIndex;
  folder: Folder;
  activeId: string;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  const open = expanded.has(folder.id);
  const hasChildren = folder.childFolderIds.length > 0;
  const active = folder.id === activeId;
  return (
    <li>
      <div
        className={cn(
          'group flex h-7 items-center gap-1 rounded-md pr-2 text-sm text-fg-muted hover:bg-hover hover:text-fg',
          active && 'bg-hover font-medium text-fg',
        )}
        style={{ paddingLeft: 4 + folder.depth * 14 }}
      >
        <button
          type="button"
          aria-label={open ? 'Collapse' : 'Expand'}
          onClick={() => onToggle(folder.id)}
          className={cn('grid size-5 shrink-0 place-items-center rounded text-fg-subtle hover:text-fg', !hasChildren && 'invisible')}
        >
          <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} />
        </button>
        <button type="button" onClick={() => onSelect(folder.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          {active ? <FolderOpen className="size-3.5 shrink-0 text-accent-text" /> : <FolderIcon className="size-3.5 shrink-0" />}
          <span className="truncate">{folder.title}</span>
          {folder.bookmarkCount ? (
            <span className="ml-auto text-2xs font-normal text-fg-subtle tabular-nums">{folder.bookmarkCount}</span>
          ) : null}
        </button>
      </div>
      {open && hasChildren ? (
        <ul>
          {folder.childFolderIds.map((id) => {
            const child = index.folderById.get(id);
            return child ? (
              <TreeNode key={id} index={index} folder={child} activeId={activeId} expanded={expanded} onToggle={onToggle} onSelect={onSelect} />
            ) : null;
          })}
        </ul>
      ) : null}
    </li>
  );
}
