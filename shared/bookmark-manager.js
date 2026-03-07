export class BookmarkManager {
    /**
     * Fetch the entire bookmark tree simplified for AI digestion
     */
    static async getTree() {
        return await chrome.bookmarks.getTree();
    }

    /**
     * Get a simple list of folders and their IDs
     */
    static async getFolders() {
        const tree = await this.getTree();
        const folders = [];

        const extract = (nodes, path = '') => {
            nodes.forEach(node => {
                if (!node.url) { // It's a folder
                    const currentPath = path ? `${path}/${node.title}` : node.title;
                    folders.push({
                        id: node.id,
                        title: node.title,
                        path: currentPath
                    });
                    if (node.children) extract(node.children, currentPath);
                }
            });
        };

        extract(tree);
        return folders;
    }

    /**
     * Move a bookmark to a target folder
     */
    static async moveBookmark(bookmarkId, targetFolderId) {
        return await chrome.bookmarks.move(bookmarkId, { parentId: targetFolderId });
    }

    /**
     * Create a new folder
     */
    static async createFolder(title, parentId = '1') { // Default to Bookmarks Bar
        return await chrome.bookmarks.create({
            parentId,
            title
        });
    }

    /**
     * Get currently active tab info
     */
    static async getActiveTab() {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        return tab;
    }
}
