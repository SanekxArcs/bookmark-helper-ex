import { useMemo } from 'react';
import { ArrowRight, Folder, FolderInput, FolderPlus } from 'lucide-react';
import type { Move } from '@/lib/ai';
import { displayUrl, targetKey, targetLabel, type BookmarkIndex, type Target } from '@/lib/bookmarks';
import type { Settings } from '@/lib/settings';
import { cn } from '@/lib/utils';
import { FolderPicker } from './folder-picker';
import { Button } from './ui/button';
import { Checkbox } from './ui/field';
import { Badge, Favicon } from './ui/misc';

interface Props {
  index: BookmarkIndex;
  settings: Settings;
  moves: Move[];
  selected: Set<string>;
  onSelectedChange: (next: Set<string>) => void;
  onRetarget: (bookmarkId: string, target: Target) => void;
  compact?: boolean;
}

/** AI-proposed moves grouped by destination, each toggleable and re-targetable. */
export function ProposalReview({ index, settings, moves, selected, onSelectedChange, onRetarget, compact }: Props) {
  const groups = useMemo(() => {
    const map = new Map<string, { target: Target; moves: Move[] }>();
    for (const m of moves) {
      const key = targetKey(m.target);
      const group = map.get(key) ?? { target: m.target, moves: [] };
      group.moves.push(m);
      map.set(key, group);
    }
    return [...map.values()].sort((a, b) => b.moves.length - a.moves.length);
  }, [moves]);

  const setMany = (ids: string[], on: boolean) => {
    const next = new Set(selected);
    ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
    onSelectedChange(next);
  };

  return (
    <div className={cn('space-y-3', compact ? 'p-0' : 'p-5')}>
      {groups.map((group) => {
        const ids = group.moves.map((m) => m.bookmarkId);
        const checkedCount = ids.filter((id) => selected.has(id)).length;
        const isNew = group.target.type === 'new';
        return (
          <section key={targetKey(group.target)} className="overflow-hidden rounded-lg border border-border">
            <label className="flex cursor-pointer items-center gap-2.5 border-b border-border bg-surface px-3 py-2">
              <Checkbox
                checked={checkedCount === ids.length}
                ref={(el) => {
                  if (el) el.indeterminate = checkedCount > 0 && checkedCount < ids.length;
                }}
                onChange={(e) => setMany(ids, e.target.checked)}
              />
              {isNew ? (
                <FolderPlus className="size-3.5 shrink-0 text-accent-text" />
              ) : (
                <Folder className="size-3.5 shrink-0 text-fg-subtle" />
              )}
              <span className="min-w-0 flex-1 truncate text-xs font-medium" title={targetLabel(group.target, index, settings.newFolderRoot)}>
                {targetLabel(group.target, index, settings.newFolderRoot)}
              </span>
              {isNew ? <Badge tone="accent">New</Badge> : null}
              <span className="text-2xs text-fg-subtle tabular-nums">{ids.length}</span>
            </label>
            <ul>
              {group.moves.map((m) => {
                const b = index.bookmarkById.get(m.bookmarkId);
                if (!b) return null;
                return (
                  <li key={m.bookmarkId} className="group flex items-start gap-2.5 border-b border-border px-3 py-2 last:border-b-0">
                    <Checkbox
                      className="mt-0.5"
                      checked={selected.has(m.bookmarkId)}
                      onChange={(e) => setMany([m.bookmarkId], e.target.checked)}
                      aria-label={`Move ${b.title}`}
                    />
                    <Favicon url={b.url} className="mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-fg" title={b.title}>
                        {b.title || displayUrl(b.url)}
                      </div>
                      <div className="flex min-w-0 items-center gap-1 text-xs text-fg-subtle">
                        <span className="truncate">{b.path.split(' / ').pop()}</span>
                        <ArrowRight className="size-3 shrink-0" />
                        <span className="truncate">{targetLabel(m.target, index, settings.newFolderRoot).split(' / ').pop()}</span>
                      </div>
                      {m.reason ? <p className={cn('mt-1 text-xs text-fg-muted', compact && 'line-clamp-2')}>{m.reason}</p> : null}
                    </div>
                    <FolderPicker
                      index={index}
                      value={m.target.type === 'existing' ? m.target.folderId : null}
                      onSelect={(t) => onRetarget(m.bookmarkId, t)}
                      allowCreate
                      align="end"
                      trigger={
                        <Button
                          variant="ghost"
                          size="sm"
                          icon
                          title="Choose a different folder"
                          aria-label="Choose a different folder"
                          className="-my-0.5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                        >
                          <FolderInput />
                        </Button>
                      }
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
