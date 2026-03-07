import { GeminiAPI } from '../../shared/gemini-api.js';
import { BookmarkManager } from '../../shared/bookmark-manager.js';

class AdvancedOrganizer {
    constructor() {
        this.elements = {};
        this.currentFolderId = null;
        this.allFolders = [];
        this.activeBookmarks = [];
        this.proposals = [];
        this.initialize();
    }

    async initialize() {
        try {
            this.initializeElements();
            this.setLoading(true, 'Loading your bookmarks structure...');
            this.setupEventListeners();
            await this.syncTree();
            await this.checkAPIStatus();
        } catch (error) {
            console.error('Initialization error:', error);
            this.showToast('Failed to initialize organizer: ' + error.message, 'error');
        } finally {
            this.setLoading(false);
        }
    }

    initializeElements() {
        this.elements = {
            tree: document.getElementById('folderTree'),
            bookmarksList: document.getElementById('bookmarksList'),
            currentFolderName: document.getElementById('currentFolderName'),
            sortBtn: document.getElementById('sortSelectedBtn'),
            refreshTree: document.getElementById('refreshTree'),
            proposalsOverlay: document.getElementById('proposalsOverlay'),
            proposalsList: document.getElementById('proposalsList'),
            applyBtn: document.getElementById('applyOrganizerBtn'),
            closeProposals: document.getElementById('closeProposals'),
            globalLoading: document.getElementById('globalLoading'),
            apiKeyStatus: document.getElementById('apiDot'),
            selectAll: document.getElementById('selectAllBookmarks'),
            sortAllInFolderBtn: document.getElementById('sortAllInFolderBtn')
        };
    }

    setupEventListeners() {
        if (this.elements.refreshTree) {
            this.elements.refreshTree.addEventListener('click', () => this.syncTree());
        }
        if (this.elements.sortBtn) {
            this.elements.sortBtn.addEventListener('click', () => this.handleAISort(false));
        }
        if (this.elements.sortAllInFolderBtn) {
            this.elements.sortAllInFolderBtn.addEventListener('click', () => this.handleAISort(true));
        }
        if (this.elements.closeProposals) {
            this.elements.closeProposals.addEventListener('click', () => {
                this.elements.proposalsOverlay.classList.add('hidden');
            });
        }
        if (this.elements.applyBtn) {
            this.elements.applyBtn.addEventListener('click', () => this.applyProposals());
        }
        if (this.elements.selectAll) {
            this.elements.selectAll.addEventListener('change', (e) => {
                const checked = e.target.checked;
                document.querySelectorAll('.bookmark-checkbox').forEach(cb => cb.checked = checked);
                this.updateActionButtons();
            });
        }
    }

    updateActionButtons() {
        const selectedCount = document.querySelectorAll('.bookmark-checkbox:checked').length;
        if (this.elements.sortBtn) {
            this.elements.sortBtn.disabled = selectedCount === 0;
            this.elements.sortBtn.innerHTML = `<span>🧠</span> AI Sort ${selectedCount === 0 ? 'Selected' : selectedCount + ' items'}`;

            if (selectedCount > 0) {
                this.elements.sortBtn.classList.add('accent');
                this.elements.sortBtn.disabled = false;
            } else {
                this.elements.sortBtn.classList.remove('accent');
            }
        }
    }

    async checkAPIStatus() {
        const data = await chrome.storage.local.get(['apiKey']);
        const dot = document.getElementById('apiDot');
        if (dot) {
            if (data.apiKey) {
                dot.className = 'h-1.5 w-1.5 rounded-full dot-success';
            } else {
                dot.className = 'h-1.5 w-1.5 rounded-full dot-idle';
            }
        }
    }

    async syncTree() {
        try {
            const treeNodes = await chrome.bookmarks.getTree();
            console.log('Bookmark tree fetched:', treeNodes);

            this.elements.tree.innerHTML = '';
            this.allFolders = [];

            // chrome.bookmarks.getTree() returns an array with one root node.
            // We want to skip the invisible root and show its children (Bookmarks Bar, Other, etc)
            if (treeNodes && treeNodes[0] && treeNodes[0].children) {
                this.renderTree(treeNodes[0].children, this.elements.tree);
            }
        } catch (error) {
            console.error('Failed to sync tree:', error);
            this.showToast('Could not load bookmarks: ' + error.message, 'error');
        }
    }

    renderTree(nodes, container, depth = 0) {
        if (!nodes) return;

        nodes.forEach(node => {
            if (!node.url) { // Folder
                this.allFolders.push({ id: node.id, title: node.title });

                const div = document.createElement('div');
                div.className = 'tree-node flex items-center gap-2 cursor-pointer';
                div.style.paddingLeft = `${(depth * 12) + 8}px`;
                div.dataset.id = node.id;
                div.dataset.title = node.title;
                div.innerHTML = `
                    <span style="font-size:11px;opacity:0.5;">▶</span>
                    <span style="font-size:12px;color:#888;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${node.title || 'Untitled Folder'}</span>
                `;

                div.addEventListener('click', (e) => {
                    e.stopPropagation();
                    document.querySelectorAll('.tree-node-active').forEach(el => el.classList.remove('tree-node-active'));
                    div.classList.add('tree-node-active');
                    this.loadFolder(node.id, node.title);
                });

                container.appendChild(div);
                if (node.children && node.children.length > 0) {
                    this.renderTree(node.children, container, depth + 1);
                }
            }
        });
    }

    async loadFolder(folderId, title) {
        this.currentFolderId = folderId;
        this.elements.currentFolderName.textContent = title;
        if (this.elements.selectAll) this.elements.selectAll.checked = false;

        const nodes = await chrome.bookmarks.getChildren(folderId);
        this.activeBookmarks = nodes.filter(n => n.url);

        this.renderBookmarksList(this.activeBookmarks);

        this.elements.sortBtn.disabled = true;
        this.elements.sortBtn.innerHTML = `<span>🧠</span> AI Sort Selected`;
        document.getElementById('currentFolderStats').textContent = `${this.activeBookmarks.length} links tracked`;
    }

    renderBookmarksList(bookmarks) {
        this.elements.bookmarksList.innerHTML = '';
        if (bookmarks.length === 0) {
            this.elements.bookmarksList.innerHTML = `
                <div class="flex flex-col items-center justify-center p-20" style="color:#333;opacity:0.8;">
                    <span class="text-6xl mb-4 grayscale">📭</span>
                    <p class="text-sm font-medium tracking-tight">No bookmarks found in this folder</p>
                </div>
            `;
            return;
        }

        bookmarks.forEach(bm => {
            const div = document.createElement('div');
            div.className = 'bookmark-item group flex items-center gap-3 mb-1.5';

            div.innerHTML = `
                <input type="checkbox" class="bookmark-checkbox h-3.5 w-3.5 cursor-pointer shrink-0" data-id="${bm.id}">
                <div class="flex flex-col min-w-0 flex-grow">
                    <span class="bookmark-title truncate">${bm.title || 'Untitled'}</span>
                    <span class="bookmark-url">${bm.url}</span>
                </div>
                <div class="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button class="inspect-btn tool-btn accent"
                            data-id="${bm.id}" data-title="${(bm.title || '').replace(/"/g, '&quot;')}" data-url="${bm.url}">
                        🧠
                    </button>
                    <button class="delete-btn tool-btn" style="color:#ef4444;" 
                            data-id="${bm.id}">
                        ✕
                    </button>
                </div>
            `;

            // Selection events
            div.querySelector('.bookmark-checkbox').addEventListener('change', () => this.updateActionButtons());

            // Action button events
            div.querySelector('.inspect-btn').addEventListener('click', (e) => {
                const btn = e.currentTarget;
                const { id, title, url } = btn.dataset;
                this.handleInspect(id, title, url);
            });

            div.querySelector('.delete-btn').addEventListener('click', async (e) => {
                const btn = e.currentTarget;
                const { id } = btn.dataset;
                if (confirm('Are you sure you want to remove this bookmark?')) {
                    await chrome.bookmarks.remove(id);
                    this.showToast('Bookmark removed', 'success');
                    this.loadFolder(this.currentFolderId, this.elements.currentFolderName.textContent);
                }
            });

            this.elements.bookmarksList.appendChild(div);
        });
    }

    async handleInspect(id, title, url) {
        try {
            this.setLoading(true, `Analyzing "${title}"...`);
            const settings = await chrome.storage.local.get(['apiKey', 'geminiModel']);
            const api = new GeminiAPI(settings.apiKey, settings.geminiModel || 'gemini-1.5-flash');

            // Similar logic to ProposeFolder, but for the organizer context
            const tree = await chrome.bookmarks.getTree();
            const folders = [];
            const extractFolders = (nodes, path = '') => {
                if (!nodes) return;
                nodes.forEach(node => {
                    if (node && !node.url) {
                        const currentPath = path ? `${path} > ${node.title}` : node.title;
                        folders.push({ id: node.id, title: node.title, fullPath: currentPath });
                        if (node.children) extractFolders(node.children, currentPath);
                    }
                });
            };
            extractFolders(tree[0].children);

            const result = await api.ProposeFolder(title, url, folders);

            if (result && result.proposal) {
                // Show as a single proposal overlay
                this.proposals = [{
                    id: id,
                    title: title,
                    targetFolderId: result.proposal.folderId,
                    targetFolderName: result.proposal.folderName,
                    reason: result.proposal.reason
                }];
                this.renderProposals(this.proposals);
                this.elements.proposalsOverlay.classList.remove('hidden');
                document.getElementById('proposalContext').textContent = 'Individual Inspection';
            }
        } catch (error) {
            this.showToast(`Error: ${error.message}`, 'error');
        } finally {
            this.setLoading(false);
        }
    }

    async handleAISort(sortAll = false) {
        try {
            let targetBookmarks = [];

            if (sortAll) {
                targetBookmarks = this.activeBookmarks;
            } else {
                const selectedNodes = Array.from(document.querySelectorAll('.bookmark-checkbox:checked'));
                const selectedIds = selectedNodes.map(cb => cb.dataset.id);

                if (selectedIds.length === 0) {
                    this.showToast('Please select some bookmarks first', 'error');
                    return;
                }
                targetBookmarks = this.activeBookmarks.filter(b => selectedIds.includes(b.id));
            }

            this.setLoading(true, `AI is analyzing ${targetBookmarks.length} items...`);
            const settings = await chrome.storage.local.get(['apiKey', 'geminiModel']);

            if (!settings.apiKey) {
                this.showToast('Please set API key in main settings', 'error');
                return;
            }

            const api = new GeminiAPI(settings.apiKey, settings.geminiModel || 'gemini-1.5-flash');
            const otherFolders = this.allFolders.filter(f => f.id !== this.currentFolderId);

            const bookmarksData = targetBookmarks.map(b => ({
                id: b.id,
                title: b.title,
                url: b.url.substring(0, 200)
            }));

            const prompt = `
                CONTEXT: I am organizing bookmarks from the folder "${this.elements.currentFolderName.textContent}".
                TASK: Categorize these ${bookmarksData.length} bookmarks. Prefer putting them into existing folders.
                
                EXISTING FOLDERS:
                ${JSON.stringify(otherFolders.slice(0, 50))} 
                
                BOOKMARKS TO SORT:
                ${JSON.stringify(bookmarksData)}

                REQUIRED JSON FORMAT:
                {
                    "moves": [
                        { "id": "bookmark-id", "title": "bookmark-name", "targetFolderId": "folder-id", "targetFolderName": "folder-name", "reason": "why" }
                    ]
                }
                Only suggest moves if they truly belong elsewhere.
            `;

            const data = await api.generateContent(prompt);

            if (data.moves && data.moves.length > 0) {
                this.proposals = data.moves;
                this.renderProposals(this.proposals);
                this.elements.proposalsOverlay.classList.remove('hidden');
                document.getElementById('proposalContext').textContent = this.elements.currentFolderName.textContent + (sortAll ? ' (Entire Folder)' : ' (Selection)');
            } else {
                this.showToast('AI thinks the items are fine where they are!', 'success');
            }

        } catch (error) {
            this.showToast(`Error: ${error.message}`, 'error');
        } finally {
            this.setLoading(false);
        }
    }

    renderProposals(moves) {
        this.elements.proposalsList.innerHTML = '';
        moves.forEach(move => {
            const div = document.createElement('div');
            div.className = 'move-card flex flex-col gap-3';
            div.innerHTML = `
                <div class="flex justify-between items-start gap-3">
                    <div class="min-w-0 flex-grow">
                        <p class="text-[12px] font-bold truncate uppercase tracking-tight" style="color:#e0e0e0;">${move.title}</p>
                        <div class="flex items-center gap-2 mt-2">
                            <span class="text-[9px] font-bold uppercase" style="color:#444;">→</span>
                            <span class="badge-accent">${move.targetFolderName}</span>
                        </div>
                    </div>
                    <span class="badge-accent shrink-0">AI</span>
                </div>
                <div class="relative rounded-lg p-3" style="background:#111;border:1px solid #1e1e1e;">
                    <p class="text-[10px] italic leading-relaxed" style="color:#555;">&ldquo;${move.reason}&rdquo;</p>
                </div>
            `;
            this.elements.proposalsList.appendChild(div);
        });
    }

    async applyProposals() {
        try {
            this.setLoading(true, 'Moving bookmarks...');
            for (const move of this.proposals) {
                await BookmarkManager.moveBookmark(move.id, move.targetFolderId);
            }
            this.showToast(`Successfully moved ${this.proposals.length} bookmarks!`, 'success');
            this.elements.proposalsOverlay.classList.add('hidden');
            await this.loadFolder(this.currentFolderId, this.elements.currentFolderName.textContent);
        } catch (error) {
            this.showToast(error.message, 'error');
        } finally {
            this.setLoading(false);
        }
    }

    setLoading(active, msg = '') {
        this.elements.globalLoading.classList.toggle('hidden', !active);
        if (active) {
            this.elements.globalLoading.classList.replace('hidden', 'flex');
        } else {
            this.elements.globalLoading.classList.replace('flex', 'hidden');
        }
        document.getElementById('loadingMsg').textContent = msg;
    }

    showToast(msg, type) {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const div = document.createElement('div');
        div.className = `toast-base ${type === 'success' ? 'toast-ok' : 'toast-err'}`;
        div.style.transition = 'opacity 0.3s, transform 0.3s';
        div.textContent = msg;
        container.appendChild(div);
        setTimeout(() => {
            div.style.opacity = '0';
            div.style.transform = 'translateY(8px)';
            setTimeout(() => div.remove(), 300);
        }, 4000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new AdvancedOrganizer();
});
