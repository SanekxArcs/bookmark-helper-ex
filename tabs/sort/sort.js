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
            openAdvancedBtn: document.getElementById('openAdvancedOrganizerFromSort')
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
