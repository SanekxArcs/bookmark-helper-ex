import { suggestFolder } from '@/lib/ai';
import {
  consumeSelfCreated,
  createBookmark,
  ensureFolder,
  isBookmarkable,
  loadIndex,
  targetLabel,
} from '@/lib/bookmarks';
import { errorMessage } from '@/lib/gemini';
import { getSettings } from '@/lib/settings';

type Undo =
  | { kind: 'remove'; id: string }
  | { kind: 'move'; id: string; parentId: string; index: number; createdFolderId?: string };

const BULK_WINDOW_MS = 3000;
const BULK_THRESHOLD = 4;
const ICON = '/icon/128.png';

export default defineBackground(() => {
  let importing = false;
  const recentCreations: number[] = [];
  // Process one bookmark at a time so bursts don't fire parallel AI calls.
  let queue: Promise<void> = Promise.resolve();

  browser.runtime.onInstalled.addListener(async ({ reason }) => {
    await browser.contextMenus.removeAll();
    browser.contextMenus.create({ id: 'save-page', title: 'Save page to suggested folder', contexts: ['page'] });
    browser.contextMenus.create({ id: 'save-link', title: 'Save link to suggested folder', contexts: ['link'] });
    // v1 queued toasts for the popup; notifications replace that.
    await browser.storage.local.remove('autoSortQueue');
    if (reason === 'install') await browser.runtime.openOptionsPage();
  });

  browser.bookmarks.onImportBegan.addListener(() => (importing = true));
  browser.bookmarks.onImportEnded.addListener(() => (importing = false));

  // ── Auto-sort bookmarks made with the browser's star button ──────────────
  browser.bookmarks.onCreated.addListener((id, bookmark) => {
    if (!bookmark.url || importing) return;

    // "Bookmark all tabs", sync and similar create many bookmarks at once.
    const now = Date.now();
    recentCreations.push(now);
    while (recentCreations.length && now - recentCreations[0]! > BULK_WINDOW_MS) recentCreations.shift();
    if (recentCreations.length >= BULK_THRESHOLD) return;

    const { url, title, parentId } = bookmark;
    queue = queue.then(() => autoSort(id, url, title, parentId!)).catch((err) => console.warn('[auto-sort]', err));
  });

  async function autoSort(id: string, url: string, title: string, originalParentId: string) {
    if (await consumeSelfCreated(url)) return;
    const settings = await getSettings();
    if (!settings.autoSort || !settings.apiKey) return;

    const [parent] = await browser.bookmarks.get(originalParentId);
    // A brand-new parent folder means the user (or a bulk action) just organized this.
    if (parent?.dateAdded && Date.now() - parent.dateAdded < 10_000) return;

    const index = await loadIndex();
    const suggestion = await suggestFolder({ settings, index }, { title, url });

    // If the user picked a folder in the star dialog meanwhile, respect it.
    const [current] = await browser.bookmarks.get(id).catch(() => []);
    if (!current || current.parentId !== originalParentId) return;
    if (suggestion.target.type === 'existing' && suggestion.target.folderId === current.parentId) return;

    const { folderId, createdNew } = await ensureFolder(suggestion.target, index, settings.newFolderRoot);
    await browser.bookmarks.move(id, { parentId: folderId });

    await notify({
      title: 'Bookmark sorted',
      message: `${title || url}\n→ ${targetLabel(suggestion.target, index, settings.newFolderRoot)}`,
      undo: {
        kind: 'move',
        id,
        parentId: originalParentId,
        index: current.index ?? 0,
        createdFolderId: createdNew ? folderId : undefined,
      },
    });
  }

  // ── Context menu: save a page or link straight to the suggested folder ────
  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    const isLink = info.menuItemId === 'save-link';
    const url = isLink ? info.linkUrl : info.pageUrl;
    if (!isBookmarkable(url)) return;
    const title = (isLink ? info.selectionText : tab?.title)?.trim() || url;

    const settings = await getSettings();
    if (!settings.apiKey) {
      await notify({ title: 'Gemini API key needed', message: 'Add your API key in Bookmark Helper settings to use AI saving.', openSettings: true });
      return;
    }

    try {
      const index = await loadIndex();
      const suggestion = await suggestFolder({ settings, index }, { title, url });
      const { folderId } = await ensureFolder(suggestion.target, index, settings.newFolderRoot);
      const created = await createBookmark({ parentId: folderId, title, url });
      await notify({
        title: 'Bookmark saved',
        message: `${title}\n→ ${targetLabel(suggestion.target, index, settings.newFolderRoot)}`,
        undo: { kind: 'remove', id: created.id },
      });
    } catch (err) {
      await notify({ title: 'Couldn’t save bookmark', message: errorMessage(err) });
    }
  });

  // ── Quick search shortcut ────────────────────────────────────────────────
  browser.commands.onCommand.addListener(async (command, tab) => {
    if (command !== 'quick-search') return;
    const target = tab ?? (await browser.tabs.query({ active: true, currentWindow: true }))[0];
    try {
      if (target?.id === undefined) throw new Error('No active tab');
      // The shortcut grants activeTab, which is all executeScript needs.
      await browser.scripting.executeScript({ target: { tabId: target.id }, files: ['/content-scripts/overlay.js'] });
    } catch {
      // Browser pages (chrome://, the new tab page, the Web Store) can't host
      // the overlay, so fall back to the popup's search tab.
      await browser.storage.session.set({ popupTab: 'search' });
      try {
        await browser.action.openPopup();
      } catch {
        await browser.storage.session.remove('popupTab');
        await browser.tabs.create({ url: browser.runtime.getURL('/options.html') + '#search' });
      }
    }
  });

  // ── Notifications with Undo ──────────────────────────────────────────────
  async function notify(opts: { title: string; message: string; undo?: Undo; openSettings?: boolean }) {
    const id = await browser.notifications.create({
      type: 'basic',
      iconUrl: ICON,
      title: opts.title,
      message: opts.message,
      buttons: opts.undo ? [{ title: 'Undo' }] : opts.openSettings ? [{ title: 'Open settings' }] : undefined,
      priority: 0,
    });
    if (opts.undo) await browser.storage.session.set({ [`undo:${id}`]: opts.undo });
    if (opts.openSettings) await browser.storage.session.set({ [`settings:${id}`]: true });
  }

  browser.notifications.onButtonClicked.addListener(async (notificationId) => {
    const undoKey = `undo:${notificationId}`;
    const settingsKey = `settings:${notificationId}`;
    const store = await browser.storage.session.get([undoKey, settingsKey]);
    await browser.storage.session.remove([undoKey, settingsKey]);
    browser.notifications.clear(notificationId);

    if (store[settingsKey]) {
      await browser.tabs.create({ url: browser.runtime.getURL('/options.html') + '#settings' });
      return;
    }
    const undo = store[undoKey] as Undo | undefined;
    if (!undo) return;
    try {
      if (undo.kind === 'remove') {
        await browser.bookmarks.remove(undo.id);
      } else {
        const siblings = await browser.bookmarks.getChildren(undo.parentId);
        await browser.bookmarks.move(undo.id, { parentId: undo.parentId, index: Math.min(undo.index, siblings.length) });
        if (undo.createdFolderId) {
          const children = await browser.bookmarks.getChildren(undo.createdFolderId);
          if (!children.length) await browser.bookmarks.remove(undo.createdFolderId);
        }
      }
    } catch (err) {
      console.warn('[undo]', err);
    }
  });

  browser.notifications.onClosed.addListener((notificationId) => {
    browser.storage.session.remove([`undo:${notificationId}`, `settings:${notificationId}`]);
  });
});
