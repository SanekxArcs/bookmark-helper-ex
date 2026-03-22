import { GeminiAPI } from './shared/gemini-api.js';

chrome.runtime.onInstalled.addListener(() => {
    console.log('Gemini Bookmark Manager installed');
    chrome.contextMenus.create({
        id: 'categorizeToGemini',
        title: 'Categorize with Gemini',
        contexts: ['page', 'link']
    });
});

chrome.contextMenus.onClicked.addListener((info) => {
    if (info.menuItemId === 'categorizeToGemini') {
        console.log('Context menu clicked for:', info.linkUrl || info.pageUrl);
    }
});

// ── Auto-sort new bookmarks added via the browser star icon ──────────────────

function extractFolders(tree) {
    const folders = [];
    const walk = (nodes, path = '') => {
        for (const node of nodes) {
            if (!node.url) {
                const currentPath = path ? `${path} > ${node.title}` : node.title;
                folders.push({ id: node.id, title: node.title, fullPath: currentPath });
                if (node.children) walk(node.children, currentPath);
            }
        }
    };
    if (tree?.[0]?.children) walk(tree[0].children);
    return folders;
}

chrome.bookmarks.onCreated.addListener(async (id, bookmark) => {
    // Skip folder-creation events (no URL)
    if (!bookmark.url) return;

    try {
        const settings = await chrome.storage.local.get(['apiKey', 'geminiModel']);
        if (!settings.apiKey) return;

        const tree = await chrome.bookmarks.getTree();
        const folders = extractFolders(tree);

        const api = new GeminiAPI(settings.apiKey, settings.geminiModel);
        const result = await api.ProposeFolder(bookmark.title, bookmark.url, folders);
        if (!result?.proposal) return;

        const { folderId, folderName, isNew } = result.proposal;

        let targetFolderId;
        if (isNew || !folderId) {
            const newFolder = await chrome.bookmarks.create({ title: folderName, parentId: '1' });
            targetFolderId = newFolder.id;
        } else {
            targetFolderId = folderId;
        }

        await chrome.bookmarks.move(id, { parentId: targetFolderId });

        const payload = { type: 'AUTOSORT_DONE', title: bookmark.title, folderName };

        // Try to notify the popup if it is currently open
        chrome.runtime.sendMessage(payload).catch(async () => {
            // Popup is closed — queue the notification for next open
            const store = await chrome.storage.local.get({ autoSortQueue: [] });
            store.autoSortQueue.push({ title: bookmark.title, folderName });
            await chrome.storage.local.set({ autoSortQueue: store.autoSortQueue });
        });

        // Also fire OS notification as a fallback
        chrome.notifications.create(`autosort-${id}`, {
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: 'Bookmark sorted',
            message: `"${bookmark.title}" sorted to "${folderName}"`
        });

    } catch (err) {
        console.error('[AutoSort] Error:', err);
    }
});
