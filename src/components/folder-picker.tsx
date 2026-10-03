import { useMemo, useState, type ReactNode } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Command } from 'cmdk';
import { Check, ChevronsUpDown, Folder, FolderPlus, Search } from 'lucide-react';
import { targetFolders, type BookmarkIndex, type Target } from '@/lib/bookmarks';
import { cn } from '@/lib/utils';

interface Props {
  index: BookmarkIndex;
  /** Currently selected folder id, if any. */
  value?: string | null;
  onSelect: (target: Target) => void;
  /** Allow creating a new folder from the search text. */
  allowCreate?: boolean;
  /** Hide folders (e.g. the one being sorted from). */
  exclude?: string[];
  /** Custom trigger; defaults to a select-like button. */
  trigger?: ReactNode;
  triggerLabel?: ReactNode;
  placeholder?: string;
  align?: 'start' | 'end';
  className?: string;
}

export function FolderPicker({
  index,
  value,
  onSelect,
  allowCreate,
  exclude,
  trigger,
  triggerLabel,
  placeholder = 'Choose a folder',
  align = 'start',
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const folders = useMemo(
    () => targetFolders(index).filter((f) => !exclude?.includes(f.id)),
    [index, exclude],
  );
  const selected = value ? index.folderById.get(value) : undefined;
  const query = search.trim();
  const exactMatch = folders.some((f) => f.title.toLowerCase() === query.toLowerCase());

  const choose = (target: Target) => {
    onSelect(target);
    setOpen(false);
    setSearch('');
  };

  return (
    <Popover.Root open={open} onOpenChange={(o) => (setOpen(o), o || setSearch(''))}>
      <Popover.Trigger asChild>
        {trigger ?? (
          <button
            type="button"
            className={cn(
              'flex h-8 w-full items-center gap-2 rounded-md border border-border bg-bg px-2.5 text-left text-sm transition-colors outline-none hover:border-border-strong focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-ring/40 data-[state=open]:border-accent',
              className,
            )}
          >
            <Folder className="size-3.5 shrink-0 text-fg-subtle" />
            <span className={cn('min-w-0 flex-1 truncate', !selected && !triggerLabel && 'text-fg-subtle')}>
              {triggerLabel ?? selected?.path ?? placeholder}
            </span>
            <ChevronsUpDown className="size-3.5 shrink-0 text-fg-subtle" />
          </button>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align={align}
          sideOffset={4}
          collisionPadding={8}
          className="z-50 w-[max(var(--radix-popover-trigger-width),280px)] max-w-[calc(100vw-16px)] overflow-hidden rounded-lg border border-border bg-bg shadow-pop animate-in"
        >
          <Command loop>
            <div className="flex items-center gap-2 border-b border-border px-2.5">
              <Search className="size-3.5 shrink-0 text-fg-subtle" />
              <Command.Input
                autoFocus
                value={search}
                onValueChange={setSearch}
                placeholder={allowCreate ? 'Search or create a folder…' : 'Search folders…'}
                className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-fg-subtle"
              />
            </div>
            <Command.List className="scroll-area max-h-64 p-1">
              <Command.Empty className="px-2 py-6 text-center text-xs text-fg-muted">No folders found.</Command.Empty>
              {folders.map((f) => (
                <Command.Item
                  key={f.id}
                  value={`${f.path}\u0000${f.id}`}
                  onSelect={() => choose({ type: 'existing', folderId: f.id })}
                  className="flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-sm text-fg-muted data-[selected=true]:bg-hover data-[selected=true]:text-fg"
                  style={query ? undefined : { paddingLeft: 8 + f.depth * 14 }}
                >
                  <Folder className="size-3.5 shrink-0 text-fg-subtle" />
                  <span className="min-w-0 flex-1 truncate">
                    {query ? f.path : f.title}
                  </span>
                  {f.id === value ? <Check className="size-3.5 shrink-0 text-accent-text" /> : null}
                </Command.Item>
              ))}
              {allowCreate && query && !exactMatch ? (
                <Command.Item
                  value={`\u0001create ${query}`}
                  forceMount
                  onSelect={() => choose({ type: 'new', name: query, parentId: null })}
                  className="flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-sm text-fg data-[selected=true]:bg-hover"
                >
                  <FolderPlus className="size-3.5 shrink-0 text-accent-text" />
                  <span className="truncate">
                    Create “{query}”
                  </span>
                </Command.Item>
              ) : null}
            </Command.List>
          </Command>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
