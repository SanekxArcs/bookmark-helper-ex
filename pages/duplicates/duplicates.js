import { BookmarkManager } from '../../shared/bookmark-manager.js';

export class ProDuplicateFinder {
    constructor() {
        this.elements = {};
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
                <div class="flex items-center gap-2">
                    <span class="text-[9px] font-black tracking-widest px-2 py-0.5 rounded border ${group.type === 'Exact URL Match' ? 'border-[#8b5cf633] text-[#8b5cf6] bg-[#8b5cf60a]' : 'border-[#444] text-[#888]'} uppercase">
                        ${group.type}
                    </span>
                </div>
                <div class="text-[10px] font-mono text-[#555] truncate max-w-full">${group.key}</div>
            `;
            card.appendChild(header);

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
                            <button class="open-btn p-2 hover:bg-[#8b5cf61a] rounded text-[#8b5cf6] transition-all" data-url="${item.url}" title="Open Link">↗</button>
                            <button class="del-btn p-2 hover:bg-[#ff44441a] rounded text-[#ff4444] transition-all" data-id="${item.id}" title="Remove Bookmark">🗑️</button>
                        </div>
                    </div>
                    <div class="pt-2 mt-1 border-t border-[#1a1a1a] flex items-center gap-2">
                        <span class="text-[8px] uppercase font-black text-[#333]">Folder:</span>
                        <span class="text-[9px] font-medium text-[#8b5cf6] opacity-70 truncate">${path}</span>
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
                            this.showToast('🗑️ Bookmark removed', 'info');
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