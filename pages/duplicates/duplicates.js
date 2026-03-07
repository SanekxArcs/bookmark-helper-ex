import { BookmarkManager } from '../../shared/bookmark-manager.js';
import { GeminiAPI } from '../../shared/gemini-api.js';

export class ProDuplicateFinder {
    constructor() {
        this.elements = {};
        this.api = null;
        this.status = {
            totalGroups: 0,
            totalItems: 0,
            exactMatches: 0,
            domainSprawl: 0
        };
        this.initialize();
    }

    async initialize() {
        this.initializeElements();
        this.setupEventListeners();

        // Apply theme and load settings
        const settings = await chrome.storage.local.get(['accentColor', 'apiKey', 'geminiModel']);
        if (settings.accentColor) {
            document.documentElement.setAttribute('data-theme', settings.accentColor);
        }

        if (settings.apiKey) {
            this.api = new GeminiAPI(settings.apiKey, settings.geminiModel);
        }

        // Initialize Lucide
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    initializeElements() {
        this.elements = {
            scanBtn: document.getElementById('scanBtn'),
            resultsGrid: document.getElementById('resultsGrid'),
            initialState: document.getElementById('initialState'),
            statsBar: document.getElementById('statsBar'),
            loadingOverlay: document.getElementById('loading-overlay'),
            toastContainer: document.getElementById('toast-container'),
            totalGroups: document.getElementById('totalGroups'),
            totalItems: document.getElementById('totalItems'),
            exactMatches: document.getElementById('exactMatches'),
            domainSprawl: document.getElementById('domainSprawl')
        };
    }

    setupEventListeners() {
        if (this.elements.scanBtn) {
            this.elements.scanBtn.addEventListener('click', () => this.handleScan());
        }
    }

    async handleScan() {
        try {
            this.setLoading(true);
            const tree = await BookmarkManager.getTree();
            const groups = this.findDuplicateGroups(tree);

            if (Object.keys(groups).length === 0) {
                this.showToast('✅ No duplicates found!', 'success');
                this.elements.resultsGrid.innerHTML = '';
                this.elements.initialState.classList.remove('hidden');
                this.elements.statsBar.classList.add('hidden');
                return;
            }

            this.updateStats(groups);
            this.displayGroups(groups);

            // Re-render Lucide icons for new content
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        } catch (error) {
            console.error('Scan error:', error);
            this.showToast(`Error: ${error.message}`, 'error');
        } finally {
            this.setLoading(false);
        }
    }

    updateStats(groups) {
        const list = Object.values(groups);
        this.status.totalGroups = list.length;
        this.status.totalItems = list.reduce((sum, g) => sum + g.items.length, 0);
        this.status.exactMatches = list.filter(g => g.type === 'Exact URL Match').length;
        this.status.domainSprawl = list.filter(g => g.type === 'Domain Cluster').length;

        this.elements.totalGroups.textContent = this.status.totalGroups;
        this.elements.totalItems.textContent = this.status.totalItems;
        this.elements.exactMatches.textContent = this.status.exactMatches;
        this.elements.domainSprawl.textContent = this.status.domainSprawl;

        this.elements.statsBar.classList.remove('hidden');
        this.elements.initialState.classList.add('hidden');
    }

    findDuplicateGroups(nodes) {
        const urlMap = {};
        const domainMap = {};

        const collect = (ns) => {
            for (const node of ns) {
                if (node.url) {
                    try {
                        const urlObj = new URL(node.url);
                        const normalizedUrl = urlObj.origin + urlObj.pathname + urlObj.search;
                        const domain = urlObj.hostname;

                        if (!urlMap[normalizedUrl]) urlMap[normalizedUrl] = [];
                        urlMap[normalizedUrl].push(node);

                        if (!domainMap[domain]) domainMap[domain] = [];
                        domainMap[domain].push(node);
                    } catch (e) { }
                }
                if (node.children) collect(node.children);
            }
        };

        collect(nodes);

        const groups = {};
        let groupId = 1;

        // Exact Matches
        for (const [url, list] of Object.entries(urlMap)) {
            if (list.length > 1) {
                groups[`group-${groupId++}`] = {
                    type: 'Exact URL Match',
                    key: url,
                    items: list
                };
            }
        }

        // Domain Clusters
        for (const [domain, list] of Object.entries(domainMap)) {
            if (list.length > 3) { // Slightly stricter threshold for full view
                const alreadyGrouped = list.every(item =>
                    Object.values(groups).some(g => g.items.some(i => i.id === item.id))
                );

                if (!alreadyGrouped) {
                    groups[`group-${groupId++}`] = {
                        type: 'Domain Cluster',
                        key: domain,
                        items: list
                    };
                }
            }
        }
        return groups;
    }

    async displayGroups(groups) {
        this.elements.resultsGrid.innerHTML = '';

        for (const [id, group] of Object.entries(groups)) {
            const card = document.createElement('div');
            card.className = 'duplicate-group p-5 flex flex-col gap-4';

            // Build header
            const header = document.createElement('div');
            header.className = 'flex flex-col gap-2';
            header.innerHTML = `
                <div class="flex items-center justify-between gap-4">
                    <div class="flex items-center gap-2">
                        <span class="text-[9px] font-black tracking-widest px-2 py-0.5 rounded border ${group.type === 'Exact URL Match' ? 'border-accent-dim text-accent bg-accent-dim' : 'border-[#444] text-[#888]'} uppercase">
                            ${group.type}
                        </span>
                    </div>
                    <button class="ai-resolve-btn hidden btn-ghost px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center gap-2 hover:text-accent transition-all" 
                            title="AI will decide which bookmark to keep or move">
                        <i data-lucide="brain-circuit" class="w-3.5 h-3.5"></i>
                        AI Resolve
                    </button>
                </div>
                <div class="text-[10px] font-mono text-[#555] truncate max-w-full">${group.key}</div>
            `;
            card.appendChild(header);

            // Show AI resolve button if API key is present
            if (this.api) {
                const aiBtn = header.querySelector('.ai-resolve-btn');
                aiBtn.classList.remove('hidden');
                aiBtn.addEventListener('click', () => this.handleAIResolve(group, card));
            }

            const itemsContainer = document.createElement('div');
            itemsContainer.className = 'flex flex-col gap-3';

            for (const item of group.items) {
                const path = await BookmarkManager.getPath(item.parentId);
                const itemRow = document.createElement('div');
                itemRow.className = 'item-row';
                itemRow.innerHTML = `
                    <div class="flex justify-between items-start gap-4">
                        <div class="truncate flex-1">
                            <h4 class="text-xs font-bold text-[#eee] truncate mb-0.5">${item.title}</h4>
                            <p class="text-[10px] text-[#444] font-mono truncate">${item.url}</p>
                        </div>
                        <div class="flex gap-1.5">
                            <button class="open-btn p-2 hover-bg-accent-dim rounded text-accent transition-all" data-url="${item.url}" title="Open Link">
                                <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                            </button>
                            <button class="del-btn p-2 hover:bg-[#ff44441a] rounded text-[#ff4444] transition-all" data-id="${item.id}" title="Remove Bookmark">
                                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                            </button>
                        </div>
                    </div>
                    <div class="pt-2 mt-1 border-t border-[#1a1a1a] flex items-center gap-2">
                        <span class="text-[8px] uppercase font-black text-[#333]">Folder:</span>
                        <span class="text-[9px] font-medium text-accent opacity-70 truncate">${path}</span>
                    </div>
                `;

                itemRow.querySelector('.open-btn').addEventListener('click', () => {
                    chrome.tabs.create({ url: item.url, active: false });
                });

                itemRow.querySelector('.del-btn').addEventListener('click', async () => {
                    if (confirm(`Delete permanent bookmark "${item.title}"?`)) {
                        try {
                            await BookmarkManager.deleteBookmark(item.id);
                            itemRow.classList.add('deleted-item');
                            this.showToast('Bookmark removed', 'info');
                        } catch (e) {
                            this.showToast('Error: ' + e.message, 'error');
                        }
                    }
                });

                itemsContainer.appendChild(itemRow);
            }
            card.appendChild(itemsContainer);
            this.elements.resultsGrid.appendChild(card);
        }

        // Initialize icons for dynamic content
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    async handleAIResolve(group, card) {
        try {
            const aiBtn = card.querySelector('.ai-resolve-btn');
            const originalContent = aiBtn.innerHTML;
            aiBtn.disabled = true;
            aiBtn.innerHTML = '<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i> Analyzing...';
            if (typeof lucide !== 'undefined') lucide.createIcons();

            // Enrich items with folder paths for AI context
            const enrichedItems = await Promise.all(group.items.map(async item => ({
                ...item,
                folderPath: await BookmarkManager.getPath(item.parentId)
            })));

            const result = await this.api.ResolveDuplicates(group.type, group.key, enrichedItems);

            if (result && result.decision) {
                const dec = result.decision;
                const keepItem = enrichedItems.find(i => i.id === dec.keepId);
                const keepTitle = keepItem?.title || 'Selected Bookmark';
                const keepFolder = keepItem?.folderPath || 'Unknown Folder';

                if (confirm(`AI Decision:\n\n- KEEP: "${keepTitle}" (in ${keepFolder})\n- DELETE: ${dec.deleteIds.length} duplicates\n${dec.moveToFolder ? `- MOVE TO: "${dec.moveToFolder}"\n` : ''}\nReason: ${dec.reason}\n\nApply these changes?`)) {
                    // 1. Delete duplicates
                    for (const id of dec.deleteIds) {
                        try { await BookmarkManager.deleteBookmark(id); } catch (e) { console.error('Delete error', id, e); }
                    }

                    // 2. Move if needed
                    if (dec.moveToFolder) {
                        try {
                            const tree = await BookmarkManager.getTree();
                            let targetFolderId = this.findFolderByName(tree, dec.moveToFolder);

                            if (!targetFolderId) {
                                // Create new folder if not exists
                                const otherBookmarks = await this.getOtherBookmarksNode(tree);
                                const newFolder = await chrome.bookmarks.create({
                                    parentId: otherBookmarks.id,
                                    title: dec.moveToFolder
                                });
                                targetFolderId = newFolder.id;
                            }

                            await chrome.bookmarks.move(dec.keepId, { parentId: targetFolderId });
                        } catch (e) {
                            console.error('Move error', e);
                            this.showToast('Error moving bookmark: ' + e.message, 'error');
                        }
                    }

                    this.showToast('✅ AI Resolve Complete!', 'success');
                    card.style.opacity = '0.5';
                    card.style.pointerEvents = 'none';
                    card.innerHTML = `<div class="p-4 text-xs font-bold text-accent flex items-center gap-2"><i data-lucide="check-circle" class="w-4 h-4"></i> AI Resolved: ${dec.reason}</div>`;
                    if (typeof lucide !== 'undefined') lucide.createIcons();

                } else {
                    aiBtn.disabled = false;
                    aiBtn.innerHTML = originalContent;
                    if (typeof lucide !== 'undefined') lucide.createIcons();
                }
            }
        } catch (error) {
            console.error('AI Resolve error:', error);
            this.showToast('AI Resolve Failed: ' + error.message, 'error');
            const aiBtn = card.querySelector('.ai-resolve-btn');
            aiBtn.disabled = false;
            aiBtn.innerHTML = '<i data-lucide="brain-circuit" class="w-3.5 h-3.5"></i> AI Resolve';
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    }

    findFolderByName(nodes, name) {
        if (!nodes) return null;
        for (const node of nodes) {
            if (!node.url && node.title.toLowerCase() === name.toLowerCase()) return node.id;
            if (node.children) {
                const res = this.findFolderByName(node.children, name);
                if (res) return res;
            }
        }
        return null;
    }

    async getOtherBookmarksNode(tree) {
        // Typically children[0] is Bar, children[1] is Other
        if (tree[0] && tree[0].children) {
            return tree[0].children[1] || tree[0].children[0];
        }
        return tree[0];
    }

    setLoading(isLoading) {
        if (this.elements.loadingOverlay) this.elements.loadingOverlay.classList.toggle('hidden', !isLoading);
    }

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast-base ${type === 'success' ? 'toast-ok' : 'toast-err'}`;
        toast.textContent = message;
        this.elements.toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            setTimeout(() => toast.remove(), 400);
        }, 3000);
    }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    new ProDuplicateFinder();
});