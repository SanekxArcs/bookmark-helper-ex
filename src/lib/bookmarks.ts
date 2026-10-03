import type { Browser } from 'wxt/browser';
import type { NewFolderRoot } from './settings';

type Node = Browser.bookmarks.BookmarkTreeNode & { folderType?: string };

export interface Bookmark {
  id: string;
  parentId: string;
  index: number;
  title: string;
  url: string;
  /** Folder path, e.g. "Bookmarks bar / Dev / React". */
  path: string;
  dateAdded: number;
}

export interface Folder {
  id: string;
  parentId: string | null;
  title: string;
  path: string;
  depth: number;
  isRoot: boolean;
  folderType?: string;
  /** Managed folders (enterprise policy) can't be changed. */
  locked: boolean;
  bookmarkCount: number;
  childFolderIds: string[];
}

export interface BookmarkIndex {
  bookmarks: Bookmark[];
  folders: Folder[];
  roots: Folder[];
  folderById: Map<string, Folder>;
  bookmarkById: Map<string, Bookmark>;
}

export const PATH_SEPARATOR = ' / ';

export async function loadIndex(): Promise<BookmarkIndex> {
  const [root] = (await browser.bookmarks.getTree()) as Node[];
  const index: BookmarkIndex = {
    bookmarks: [],
    folders: [],
    roots: [],
    folderById: new Map(),
    bookmarkById: new Map(),
  };

  const walk = (node: Node, parent: Folder | null, inheritedLock: boolean) => {
    if (node.url) {
      const bookmark: Bookmark = {
        id: node.id,
        parentId: node.parentId ?? '',
        index: node.index ?? 0,
        title: node.title || '',
        url: node.url,
        path: parent?.path ?? '',
        dateAdded: node.dateAdded ?? 0,
      };
      index.bookmarks.push(bookmark);
      index.bookmarkById.set(bookmark.id, bookmark);
      if (parent) parent.bookmarkCount++;
      return;
    }

    const title = node.title || 'Untitled folder';
    const locked = inheritedLock || node.unmodifiable === 'managed';
    const folder: Folder = {
      id: node.id,
      parentId: parent?.id ?? null,
      title,
      path: parent ? parent.path + PATH_SEPARATOR + title : title,
      depth: parent ? parent.depth + 1 : 0,
      isRoot: !parent,
      folderType: node.folderType,
      locked,
      bookmarkCount: 0,
      childFolderIds: [],
    };
    index.folders.push(folder);
    index.folderById.set(folder.id, folder);
    if (parent) parent.childFolderIds.push(folder.id);
    else index.roots.push(folder);

    for (const child of node.children ?? []) walk(child, folder, locked);
  };

  // The invisible top-level node holds the Bookmarks bar, Other bookmarks, etc.
  for (const child of (root?.children ?? []) as Node[]) walk(child, null, false);
  return index;
}

/** Folders the AI may suggest: everything that isn't policy-managed. */
export function targetFolders(index: BookmarkIndex) {
  return index.folders.filter((f) => !f.locked);
}

export function defaultRoot(index: BookmarkIndex, which: NewFolderRoot): Folder {
  const wanted = which === 'bar' ? 'bookmarks-bar' : 'other';
  const unlocked = index.roots.filter((r) => !r.locked);
  return (
    unlocked.find((r) => r.folderType === wanted) ??
    // Older Chrome versions have no folderType: the bar is id 1, other is id 2.
    unlocked.find((r) => r.id === (which === 'bar' ? '1' : '2')) ??
    unlocked[0] ??
    index.roots[0]!
  );
}

// ── Where a bookmark should go ──────────────────────────────────────────────

export type Target =
  | { type: 'existing'; folderId: string }
  | { type: 'new'; name: string; parentId: string | null };

export function targetLabel(target: Target, index: BookmarkIndex, root: NewFolderRoot) {
  if (target.type === 'existing') return index.folderById.get(target.folderId)?.path ?? 'Unknown folder';
  const parent = target.parentId ? index.folderById.get(target.parentId) : defaultRoot(index, root);
  return (parent ? parent.path + PATH_SEPARATOR : '') + target.name;
}

export function targetKey(target: Target) {
  return target.type === 'existing' ? target.folderId : `new:${target.parentId ?? ''}:${target.name.toLowerCase()}`;
}

/** Resolves a target to a folder id, creating (or reusing) the folder if needed. */
export async function ensureFolder(
  target: Target,
  index: BookmarkIndex,
  root: NewFolderRoot,
  created: Map<string, string> = new Map(),
): Promise<{ folderId: string; createdNew: boolean }> {
  if (target.type === 'existing') return { folderId: target.folderId, createdNew: false };

  const key = targetKey(target);
  const cached = created.get(key);
  if (cached) return { folderId: cached, createdNew: false };

  const parentId = target.parentId ?? defaultRoot(index, root).id;
  const siblings = await browser.bookmarks.getChildren(parentId);
  const existing = siblings.find((n) => !n.url && n.title.trim().toLowerCase() === target.name.trim().toLowerCase());
  if (existing) {
    created.set(key, existing.id);
    return { folderId: existing.id, createdNew: false };
  }

  const folder = await browser.bookmarks.create({ parentId, title: target.name.trim() });
  created.set(key, folder.id);
  return { folderId: folder.id, createdNew: true };
}

// ── Mutations with undo ──────────────────────────────────────────────────────

export interface MoveUndo {
  moved: { id: string; parentId: string; index: number }[];
  createdFolderIds: string[];
}

export async function moveBookmarks(
  moves: { bookmarkId: string; target: Target }[],
  index: BookmarkIndex,
  root: NewFolderRoot,
): Promise<{ undo: MoveUndo; failed: number }> {
  const undo: MoveUndo = { moved: [], createdFolderIds: [] };
  const created = new Map<string, string>();
  let failed = 0;

  for (const move of moves) {
    try {
      const [current] = await browser.bookmarks.get(move.bookmarkId);
      if (!current) throw new Error('Bookmark not found');
      const { folderId, createdNew } = await ensureFolder(move.target, index, root, created);
      if (createdNew) undo.createdFolderIds.push(folderId);
      if (current.parentId === folderId) continue;
      await browser.bookmarks.move(move.bookmarkId, { parentId: folderId });
      undo.moved.push({ id: current.id, parentId: current.parentId!, index: current.index ?? 0 });
    } catch (err) {
      console.warn('Move failed', move, err);
      failed++;
    }
  }
  return { undo, failed };
}

export async function undoMoves(undo: MoveUndo) {
  // Restore in reverse so original indexes line up again.
  for (const item of [...undo.moved].reverse()) {
    try {
      const siblings = await browser.bookmarks.getChildren(item.parentId);
      await browser.bookmarks.move(item.id, { parentId: item.parentId, index: Math.min(item.index, siblings.length) });
    } catch (err) {
      console.warn('Undo move failed', item, err);
    }
  }
  for (const id of undo.createdFolderIds) {
    try {
      const children = await browser.bookmarks.getChildren(id);
      if (children.length === 0) await browser.bookmarks.remove(id);
    } catch {
      // Folder already gone.
    }
  }
}

export interface RemovedBookmark {
  parentId: string;
  index: number;
  title: string;
  url: string;
}

export async function removeBookmarks(ids: string[]): Promise<RemovedBookmark[]> {
  const removed: RemovedBookmark[] = [];
  for (const id of ids) {
    try {
      const [node] = await browser.bookmarks.get(id);
      if (!node?.url) continue;
      await browser.bookmarks.remove(id);
      removed.push({ parentId: node.parentId!, index: node.index ?? 0, title: node.title, url: node.url });
    } catch (err) {
      console.warn('Remove failed', id, err);
    }
  }
  return removed;
}

export async function restoreBookmarks(removed: RemovedBookmark[]) {
  await markSelfCreated(removed.map((r) => r.url));
  // Recreate lowest index first so later indexes stay valid.
  for (const item of [...removed].sort((a, b) => a.index - b.index)) {
    try {
      const siblings = await browser.bookmarks.getChildren(item.parentId);
      await browser.bookmarks.create({
        parentId: item.parentId,
        index: Math.min(item.index, siblings.length),
        title: item.title,
        url: item.url,
      });
    } catch (err) {
      console.warn('Restore failed', item, err);
    }
  }
}

/** Creates a bookmark without triggering auto-sort in the background. */
export async function createBookmark(input: { parentId: string; title: string; url: string }) {
  await markSelfCreated([input.url]);
  return browser.bookmarks.create(input);
}

// ── Auto-sort bypass ─────────────────────────────────────────────────────────
// Bookmarks the extension itself creates (saving from the popup, undoing a
// delete) are already where the user wants them, so the background auto-sort
// must leave them alone. Session storage is shared with the service worker.

const SELF_CREATED_KEY = 'selfCreated';
const SELF_CREATED_TTL = 30_000;

export async function markSelfCreated(urls: string[]) {
  const now = Date.now();
  const store = await browser.storage.session.get(SELF_CREATED_KEY);
  const entries = Object.fromEntries(
    Object.entries((store[SELF_CREATED_KEY] ?? {}) as Record<string, number>).filter(
      ([, at]) => now - at < SELF_CREATED_TTL,
    ),
  );
  for (const url of urls) entries[url] = now;
  await browser.storage.session.set({ [SELF_CREATED_KEY]: entries });
}

export async function consumeSelfCreated(url: string) {
  const store = await browser.storage.session.get(SELF_CREATED_KEY);
  const entries = (store[SELF_CREATED_KEY] ?? {}) as Record<string, number>;
  const at = entries[url];
  if (at === undefined) return false;
  delete entries[url];
  await browser.storage.session.set({ [SELF_CREATED_KEY]: entries });
  return Date.now() - at < SELF_CREATED_TTL;
}

// ── Misc helpers ─────────────────────────────────────────────────────────────

export function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Host + path without protocol, query or trailing slash, for compact display. */
export function displayUrl(url: string) {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return url;
    const path = u.pathname === '/' ? '' : u.pathname.replace(/\/$/, '');
    return u.hostname.replace(/^www\./, '') + path;
  } catch {
    return url;
  }
}

export function isBookmarkable(url: string | undefined): url is string {
  if (!url) return false;
  return /^(https?|ftp|file):/.test(url);
}

export async function openUrl(url: string, background = false) {
  await browser.tabs.create({ url, active: !background });
}
