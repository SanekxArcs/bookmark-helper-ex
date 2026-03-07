import { GeminiAPI } from '../../shared/gemini-api.js';
import { BookmarkManager } from '../../shared/bookmark-manager.js';

export class SortTab {
    constructor() {
        this.elements = {};
        this.activeProposals = [];
        this.initialize();
    }

    async initialize() {
        this.initializeElements();
        this.setupEventListeners();
    }

    initializeElements() {
        this.elements = {
            scanBtn: document.getElementById('scanBookmarksBtn'),
            proposalsContainer: document.getElementById('sortProposalsContainer'),
            proposalsList: document.getElementById('proposalsList'),
            emptyState: document.getElementById('emptySortState'),
            proposalCount: document.getElementById('proposalCount'),
            applyAllBtn: document.getElementById('applyAllSortBtn'),
            clearBtn: document.getElementById('clearProposalsBtn'),
            openAdvancedBtn: document.getElementById('openAdvancedOrganizerFromSort'),
            findDuplicatesBtn: document.getElementById('findDuplicatesBtn'),
            duplicateResultsContainer: document.getElementById('duplicateResultsContainer'),
            duplicateGroupsList: document.getElementById('duplicateGroupsList'),
            openFullDuplicatesBtn: document.getElementById('openFullDuplicateFinder')
        };
    }

    setupEventListeners() {
        if (this.elements.scanBtn) {
            this.elements.scanBtn.addEventListener('click', () => this.handleScan());
        }
        if (this.elements.applyAllBtn) {
            this.elements.applyAllBtn.addEventListener('click', () => this.handleApplyAll());
        }
        if (this.elements.clearBtn) {
            this.elements.clearBtn.addEventListener('click', () => this.clearProposals());
        }
        if (this.elements.openAdvancedBtn) {
            this.elements.openAdvancedBtn.addEventListener('click', () => {
                chrome.tabs.create({ url: chrome.runtime.getURL('pages/organizer/organizer.html') });
            });
        }
        if (this.elements.findDuplicatesBtn) {
            this.elements.findDuplicatesBtn.addEventListener('click', () => this.handleFindDuplicates());
        }
        if (this.elements.openFullDuplicatesBtn) {
            this.elements.openFullDuplicatesBtn.addEventListener('click', () => {
                chrome.tabs.create({ url: chrome.runtime.getURL('pages/duplicates/duplicates.html') });
            });
        }
    }

    async handleFindDuplicates() {
        try {
            this.setLoading(true);
            const tree = await BookmarkManager.getTree();
            const groups = this.findDuplicateGroups(tree);

            if (Object.keys(groups).length === 0) {
                this.showToast('✅ No duplicates found!', 'success');
                this.elements.duplicateResultsContainer.classList.add('hidden');
                return;
            }

            this.displayDuplicates(groups);
            this.showToast(`🔍 Found ${Object.keys(groups).length} duplicate groups!`, 'info');
        } catch (error) {
            console.error('Duplicate finder error:', error);
            this.showToast(`Error: ${error.message}`, 'error');
        } finally {
            this.setLoading(false);
        }
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
                    } catch (e) {
                        console.warn('Invalid URL:', node.url);
                    }
                }
                if (node.children) collect(node.children);
            }
        };

        collect(nodes);

        const groups = {};
        let groupId = 1;

        // Process exact URL duplicates
        for (const [url, list] of Object.entries(urlMap)) {
            if (list.length > 1) {
                groups[`group-${groupId++}`] = {
                    type: 'Exact URL Match',
                    key: url,
                    items: list
                };
            }
        }

        // Process potential duplicates (same domain, many results - skip if already in exact matches)
        // Only show if more than 3 bookmarks for same domain to avoid clutter
        for (const [domain, list] of Object.entries(domainMap)) {
            if (list.length > 2) {
                const alreadyGrouped = list.every(item =>
                    Object.values(groups).some(g => g.items.some(i => i.id === item.id))
                );

                if (!alreadyGrouped) {
                    groups[`group-${groupId++}`] = {
                        type: 'Domain Sprawl',
                        key: domain,
                        items: list
                    };
                }
            }
        }

        return groups;
    }

    async displayDuplicates(groups) {
        this.elements.duplicateGroupsList.innerHTML = '';
        this.elements.duplicateResultsContainer.classList.remove('hidden');

        for (const [id, group] of Object.entries(groups)) {
            const groupEl = document.createElement('div');
            groupEl.className = 'p-3 rounded-lg flex flex-col gap-3 transition-all';
            groupEl.style.backgroundColor = '#080808';
            groupEl.style.border = '1px solid #1a1a1a';

            // Collect folder paths for each item
            const itemsWithPaths = await Promise.all(group.items.map(async item => ({
                ...item,
                folderPath: await BookmarkManager.getPath(item.parentId)
            })));

            groupEl.innerHTML = `
                <div class="flex justify-between items-start">
                    <div>
                        <span class="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded" 
                              style="background:#8b5cf61a;color:#8b5cf6;border:1px solid #8b5cf633;">
                            ${group.type}
                        </span>
                        <div class="text-[10px] mt-1.5 font-mono truncate max-w-[200px]" style="color:#888;">${group.key}</div>
                    </div>
                </div>
                <div class="space-y-2 mt-1">
                    ${itemsWithPaths.map(item => `
                        <div class="flex flex-col gap-1 p-2 rounded bg-[#0c0c0c] border border-[#141414]">
                            <div class="flex items-center justify-between gap-3">
                                <div class="truncate flex-1">
                                    <div class="text-[11px] font-bold text-[#eee] truncate">${item.title}</div>
                                    <div class="text-[9px] text-[#555] truncate">${item.url}</div>
                                </div>
                                <div class="flex gap-2">
                                    <button class="open-dup-btn p-2 hover:bg-[#8b5cf61a] rounded text-[#8b5cf6] transition-colors" 
                                            data-url="${item.url}" title="Open Link">
                                        ↗
                                    </button>
                                    <button class="delete-dup-btn p-2 hover:bg-[#ff44441a] rounded text-[#ff4444] transition-colors" 
                                            data-id="${item.id}" title="Delete Bookmark">
                                        🗑️
                                    </button>
                                </div>
                            </div>
                            <div class="flex items-center gap-1.5 mt-1 pt-1.5 border-t border-[#1a1a1a]">
                                <span class="text-[8px] uppercase font-bold text-[#444]">Location:</span>
                                <span class="text-[9px] text-[#8b5cf6] font-medium truncate opacity-80">${item.folderPath}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;

            const deleteBtns = groupEl.querySelectorAll('.delete-dup-btn');
            deleteBtns.forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const bookmarkId = btn.getAttribute('data-id');
                    const title = btn.closest('.flex-col').querySelector('.text-\\\\[11px\\\\]').textContent;
                    if (confirm(`Remove bookmark "${title}"?`)) {
                        try {
                            await BookmarkManager.deleteBookmark(bookmarkId);
                            btn.closest('.flex-col').style.opacity = '0.3';
                            btn.closest('.flex-col').style.pointerEvents = 'none';
                            this.showToast('🗑️ Bookmark deleted', 'info');
                        } catch (err) {
                            this.showToast('Error deleting: ' + err.message, 'error');
                        }
                    }
                });
            });

            const openBtns = groupEl.querySelectorAll('.open-dup-btn');
            openBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    chrome.tabs.create({ url: btn.getAttribute('data-url'), active: false });
                });
            });

            this.elements.duplicateGroupsList.appendChild(groupEl);
        }
    }

    async handleScan() {
        try {
            this.setLoading(true);
            const settings = await chrome.storage.local.get(['apiKey', 'geminiModel']);

            if (!settings.apiKey) {
                this.showToast('⚠️ Please configure your API key in Settings first!', 'error');
                return;
            }

            const api = new GeminiAPI(settings.apiKey, settings.geminiModel);

            // 1. Fetch current tree
            const tree = await BookmarkManager.getTree();
            const flattenedSubset = this.extractRecentBookmarks(tree, 15); // Process small batch for demo/efficiency
            const folders = await BookmarkManager.getFolders();

            if (flattenedSubset.length === 0) {
                this.showToast('ℹ️ No bookmarks found to analyze!', 'info');
                return;
            }

            // 2. Build prompt for batch re-organization
            const prompt = `
                As an AI bookmark organizer, analyze these ${flattenedSubset.length} bookmarks and suggest the best folder for each based on the existing structure.
                
                Folders Available: ${JSON.stringify(folders.map(f => ({ id: f.id, title: f.title })))}
                
                Bookmarks to Analyze:
                ${JSON.stringify(flattenedSubset)}

                Return ONLY a JSON object in this exact format, with no extra text or markdown markers:
                {
                    "moves": [
                        {
                            "id": "bookmark-id",
                            "title": "bookmark-title",
                            "targetFolderId": "folder-id",
                            "targetFolderName": "folder-title",
                            "reason": "short explanation"
                        }
                    ]
                }
                Only include bookmarks that actually need to be moved. If it's already in the best folder, omit it.
            `;

            const result = await api.generateContent(prompt);

            if (result && result.moves && result.moves.length > 0) {
                this.activeProposals = result.moves;
                this.displayProposals(result.moves);
            } else {
                this.showToast('✅ Your bookmarks are perfectly organized!', 'success');
                this.clearProposals();
            }

        } catch (error) {
            console.error('Batch scan error:', error);
            this.showToast(`AI Error: ${error.message}`, 'error');
        } finally {
            this.setLoading(false);
        }
    }

    extractRecentBookmarks(nodes, limit) {
        const list = [];
        const extract = (ns) => {
            for (const node of ns) {
                if (node.url) {
                    list.push({ id: node.id, title: node.title, url: node.url, currentFolderId: node.parentId });
                }
                if (node.children) extract(node.children);
                if (list.length >= limit) break;
            }
        };
        extract(nodes);
        return list;
    }

    displayProposals(moves) {
        if (!this.elements.proposalsList) {
            console.error('Proposals list element not found');
            return;
        }
        this.elements.proposalsList.innerHTML = '';
        if (this.elements.emptyState) this.elements.emptyState.classList.add('hidden');
        if (this.elements.proposalsContainer) this.elements.proposalsContainer.classList.remove('hidden');
        if (this.elements.proposalCount) this.elements.proposalCount.textContent = moves.length;

        moves.forEach(move => {
            const item = document.createElement('div');
            item.className = 'move-card flex flex-col gap-2';
            item.innerHTML = `
                <div class="flex items-center justify-between gap-2">
                    <span class="text-xs font-bold truncate max-w-[160px] uppercase tracking-tight" style="color:#e0e0e0;">${move.title}</span>
                    <span class="badge-accent shrink-0">${move.targetFolderName}</span>
                </div>
                <p class="text-[10px] italic leading-relaxed pl-2" style="color:#444;border-left:2px solid #242424;">"${move.reason}"</p>
            `;
            this.elements.proposalsList.appendChild(item);
        });
    }

    async handleApplyAll() {
        if (this.activeProposals.length === 0) return;

        try {
            this.setLoading(true);
            for (const move of this.activeProposals) {
                await BookmarkManager.moveBookmark(move.id, move.targetFolderId);
            }
            this.showToast(`✅ Successfully moved ${this.activeProposals.length} bookmarks!`, 'success');
            this.clearProposals();
        } catch (error) {
            this.showToast(`Error moving bookmarks: ${error.message}`, 'error');
        } finally {
            this.setLoading(false);
        }
    }

    clearProposals() {
        this.activeProposals = [];
        this.elements.proposalsList.innerHTML = '';
        this.elements.proposalsContainer.classList.add('hidden');
        this.elements.emptyState.classList.remove('hidden');
    }

    setLoading(isLoading) {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) overlay.classList.toggle('hidden', !isLoading);
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast-base ${type === 'success' ? 'toast-ok' : 'toast-err'}`;
        toast.style.transition = 'opacity 0.3s, transform 0.3s';
        toast.textContent = message;

        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(8px)';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}
