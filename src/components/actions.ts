import { moveBookmarks, removeBookmarks, restoreBookmarks, undoMoves, type BookmarkIndex, type Target } from '@/lib/bookmarks';
import type { Settings } from '@/lib/settings';
import { plural } from '@/lib/utils';
import { toast } from './toaster';

/** Moves bookmarks and shows a toast with Undo. */
export async function moveWithUndo(
  moves: { bookmarkId: string; target: Target }[],
  index: BookmarkIndex,
  settings: Settings,
) {
  const { undo, failed } = await moveBookmarks(moves, index, settings.newFolderRoot);
  const moved = undo.moved.length;
  if (moved) {
    toast.success(`Moved ${plural(moved, 'bookmark')}`, {
      description: failed ? `${plural(failed, 'bookmark')} couldn't be moved.` : undefined,
      duration: 8000,
      action: {
        label: 'Undo',
        onClick: () => undoMoves(undo).then(() => toast('Move undone')),
      },
    });
  } else if (failed) {
    toast.error(`Couldn't move ${plural(failed, 'bookmark')}`);
  } else {
    toast('Nothing to move', { description: 'Those bookmarks are already in place.' });
  }
  return moved;
}

/** Deletes bookmarks and shows a toast with Undo (recreates them in place). */
export async function removeWithUndo(ids: string[]) {
  const removed = await removeBookmarks(ids);
  if (!removed.length) {
    toast.error("Couldn't delete");
    return 0;
  }
  toast.success(`Deleted ${plural(removed.length, 'bookmark')}`, {
    duration: 8000,
    action: {
      label: 'Undo',
      onClick: () => restoreBookmarks(removed).then(() => toast('Restored')),
    },
  });
  return removed.length;
}
