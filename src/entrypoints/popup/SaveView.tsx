import { useEffect, useMemo, useState } from 'react';
import { BookmarkCheck, KeyRound, Sparkles, Trash2 } from 'lucide-react';
import { removeWithUndo } from '@/components/actions';
import { FolderPicker } from '@/components/folder-picker';
import { toast } from '@/components/toaster';
import { Button } from '@/components/ui/button';
import { Label, Textarea } from '@/components/ui/field';
import { Badge, Callout, EmptyState, Favicon, Spinner } from '@/components/ui/misc';
import { suggestFolder } from '@/lib/ai';
import {
  createBookmark,
  defaultRoot,
  displayUrl,
  ensureFolder,
  isBookmarkable,
  targetLabel,
  type BookmarkIndex,
  type Target,
} from '@/lib/bookmarks';
import { AIError, errorMessage } from '@/lib/gemini';
import { useAbortable, useActiveTab } from '@/lib/hooks';
import type { Settings } from '@/lib/settings';

interface Props {
  index: BookmarkIndex;
  settings: Settings;
  onOpenSettings: () => void;
}

export function SaveView({ index, settings, onOpenSettings }: Props) {
  const tab = useActiveTab();
  const nextSignal = useAbortable();
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [target, setTarget] = useState<Target | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [busy, setBusy] = useState<'suggest' | 'save' | null>(null);

  useEffect(() => {
    if (tab?.title) setTitle(tab.title);
  }, [tab?.title]);

  const url = tab?.url;
  const saved = useMemo(() => (url ? index.bookmarks.filter((b) => b.url === url) : []), [index, url]);

  // Default to the folder used most recently, like the browser's own star dialog.
  const fallback = useMemo<Target>(() => {
    if (saved[0]) return { type: 'existing', folderId: saved[0].parentId };
    const latest = index.bookmarks.reduce<(typeof index.bookmarks)[number] | null>(
      (best, b) => (!best || b.dateAdded > best.dateAdded ? b : best),
      null,
    );
    const folder = latest && index.folderById.get(latest.parentId);
    return { type: 'existing', folderId: folder && !folder.locked ? folder.id : defaultRoot(index, settings.newFolderRoot).id };
  }, [index, saved, settings.newFolderRoot]);

  const current = target ?? fallback;
  // A new folder may have been created by now (e.g. after saving); drop stale ids.
  const currentValid = current.type === 'new' || index.folderById.has(current.folderId) ? current : fallback;

  if (tab === undefined) {
    return (
      <div className="grid h-full place-items-center">
        <Spinner />
      </div>
    );
  }

  if (!tab || !isBookmarkable(url)) {
    return (
      <EmptyState className="h-full" icon={<BookmarkCheck />} title="This page can’t be bookmarked">
        Open a website and click the extension again to save it.
      </EmptyState>
    );
  }

  const suggest = async () => {
    setBusy('suggest');
    try {
      const s = await suggestFolder({ settings, index, signal: nextSignal() }, { title, url, note: note.trim() });
      setTarget(s.target);
      setReason(s.reason);
    } catch (err) {
      if (err instanceof AIError && err.kind === 'aborted') return;
      toast.error('Couldn’t get a suggestion', { description: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    setBusy('save');
    try {
      const { folderId } = await ensureFolder(currentValid, index, settings.newFolderRoot);
      const label = targetLabel(currentValid, index, settings.newFolderRoot);
      const existing = saved[0];
      if (existing) {
        await browser.bookmarks.move(existing.id, { parentId: folderId });
        if (title.trim() && title.trim() !== existing.title) await browser.bookmarks.update(existing.id, { title: title.trim() });
        toast.success('Bookmark moved', { description: label });
      } else {
        const created = await createBookmark({ parentId: folderId, title: title.trim() || url, url });
        toast.success('Bookmark saved', {
          description: label,
          duration: 6000,
          action: {
            label: 'Undo',
            onClick: () => browser.bookmarks.remove(created.id).then(() => toast('Bookmark removed')),
          },
        });
      }
      setTarget({ type: 'existing', folderId });
      setReason(null);
    } catch (err) {
      toast.error('Couldn’t save the bookmark', { description: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  const inSavedFolder = saved.some((b) => currentValid.type === 'existing' && b.parentId === currentValid.folderId);

  return (
    <div className="flex h-full flex-col">
      <div className="scroll-area min-h-0 flex-1 space-y-4 p-3">
        <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-bg">
            <Favicon url={url} size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              aria-label="Bookmark title"
              className="-mx-1 w-[calc(100%+8px)] truncate rounded bg-transparent px-1 text-sm font-medium text-fg outline-none hover:bg-hover focus:bg-bg focus:ring-2 focus:ring-ring/40"
            />
            <p className="truncate text-xs text-fg-subtle" title={url}>
              {displayUrl(url)}
            </p>
          </div>
        </div>

        {saved[0] ? (
          <Callout
            icon={<BookmarkCheck />}
            action={
              <Button
                variant="ghost"
                size="sm"
                icon
                className="-my-1 -mr-1.5 hover:text-danger"
                title="Remove bookmark"
                aria-label="Remove bookmark"
                onClick={() => removeWithUndo(saved.map((b) => b.id))}
              >
                <Trash2 />
              </Button>
            }
          >
            Already saved in <span className="font-medium text-fg">{saved[0].path}</span>
            {saved.length > 1 ? ` and ${saved.length - 1} more` : ''}
          </Callout>
        ) : null}

        <div>
          <Label hint={currentValid.type === 'new' ? <Badge tone="accent">New folder</Badge> : undefined}>Folder</Label>
          <FolderPicker
            index={index}
            value={currentValid.type === 'existing' ? currentValid.folderId : null}
            triggerLabel={currentValid.type === 'new' ? targetLabel(currentValid, index, settings.newFolderRoot) : undefined}
            onSelect={(t) => {
              setTarget(t);
              setReason(null);
            }}
            allowCreate
          />
          {reason ? (
            <p className="mt-2 flex gap-1.5 text-xs text-fg-muted animate-in">
              <Sparkles className="mt-0.5 size-3 shrink-0 text-accent-text" />
              {reason}
            </p>
          ) : null}
        </div>

        {settings.apiKey ? (
          <div>
            <Label htmlFor="note" hint="Optional">
              Context for AI
            </Label>
            <Textarea
              id="note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && suggest()}
              placeholder="e.g. reference for my React side project"
            />
          </div>
        ) : (
          <Callout
            icon={<KeyRound />}
            action={
              <Button size="sm" className="-my-1" onClick={onOpenSettings}>
                Set up
              </Button>
            }
          >
            Add a Gemini API key to get folder suggestions.
          </Callout>
        )}
      </div>

      <div className="flex shrink-0 gap-2 border-t border-border p-3">
        {settings.apiKey ? (
          <Button className="flex-1" onClick={suggest} loading={busy === 'suggest'} disabled={busy === 'save'}>
            {busy === 'suggest' ? null : <Sparkles className="text-accent-text" />}
            Suggest folder
          </Button>
        ) : null}
        <Button
          variant="primary"
          className="flex-1"
          onClick={save}
          loading={busy === 'save'}
          disabled={busy === 'suggest' || inSavedFolder}
        >
          {saved.length ? (inSavedFolder ? 'Saved here' : 'Move here') : 'Save bookmark'}
        </Button>
      </div>
    </div>
  );
}
