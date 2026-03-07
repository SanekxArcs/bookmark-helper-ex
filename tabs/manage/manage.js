import { GeminiAPI } from '../../shared/gemini-api.js';
import { BookmarkManager } from '../../shared/bookmark-manager.js';

export class ManageTab {
    constructor() {
        this.elements = {};
        this.currentProposal = null;
        this.initialize();
    }

    async initialize() {
        this.initializeElements();
        this.setupEventListeners();
        await this.loadCurrentTabInfo();
    }

    initializeElements() {
        this.elements = {
            tabTitle: document.getElementById('tabTitleDisplay'),
            tabUrl: document.getElementById('tabUrlDisplay'),
            getProposalBtn: document.getElementById('getProposalBtn'),
            proposalResult: document.getElementById('proposalResult'),
            proposedFolderName: document.getElementById('proposedFolderName'),
            isNewTag: document.getElementById('isNewTag'),
            proposalReason: document.getElementById('proposalReason'),
            applyProposalBtn: document.getElementById('applyProposalBtn'),
            openAdvancedBtn: document.getElementById('openAdvancedOrganizer'),
            personalNote: document.getElementById('personalNote')
        };
    }

    async loadCurrentTabInfo() {
        try {
            const tab = await BookmarkManager.getActiveTab();
            if (this.elements.tabTitle) {
                this.elements.tabTitle.textContent = tab.title || 'Untitled Site';
            }
            if (this.elements.tabUrl) {
                this.elements.tabUrl.textContent = tab.url || '--';
            }
        } catch (error) {
            console.error('Error loading tab info:', error);
        }
    }

    setupEventListeners() {
        // AI Suggestion Trigger
        if (this.elements.getProposalBtn) {
            this.elements.getProposalBtn.addEventListener('click', () => this.handleGetProposal());
        }

        // Apply Proposal Trigger
        if (this.elements.applyProposalBtn) {
            this.elements.applyProposalBtn.addEventListener('click', () => this.handleApplyProposal());
        }

        if (this.elements.openAdvancedBtn) {
            this.elements.openAdvancedBtn.addEventListener('click', () => {
                chrome.tabs.create({ url: chrome.runtime.getURL('pages/organizer/organizer.html') });
            });
        }
    }

    async handleGetProposal() {
        try {
            this.setLoading(true);
            const settings = await chrome.storage.local.get(['apiKey', 'geminiModel']);

            if (!settings.apiKey) {
                this.showToast('⚠️ Please configure your API key in Settings first!', 'error');
                return;
            }

            const api = new GeminiAPI(settings.apiKey, settings.geminiModel);
            const tab = await BookmarkManager.getActiveTab();
            const personalContext = this.elements.personalNote?.value || '';

            // Get all current folders with hierarchical paths
            const tree = await chrome.bookmarks.getTree();
            const folders = [];
            const extractFolders = (nodes, path = '') => {
                if (!nodes) return;
                nodes.forEach(node => {
                    if (node && !node.url) { // Folder
                        const currentPath = path ? `${path} > ${node.title}` : node.title;
                        folders.push({ id: node.id, title: node.title, fullPath: currentPath });
                        if (node.children) extractFolders(node.children, currentPath);
                    }
                });
            };

            // Safely skip the invisible root node
            if (tree && tree[0] && tree[0].children) {
                extractFolders(tree[0].children);
            } else if (tree && tree.length > 0) {
                extractFolders(tree);
            }

            const result = await api.ProposeFolder(tab.title, tab.url, folders, personalContext);

            if (result && result.proposal) {
                this.currentProposal = result.proposal;
                this.displayProposal(result.proposal);
            }

        } catch (error) {
            console.error('Proposal error:', error);
            this.showToast(`AI Error: ${error.message}`, 'error');
        } finally {
            this.setLoading(false);
        }
    }

    displayProposal(proposal) {
        if (!this.elements.proposalResult) return;

        this.elements.proposalResult.classList.remove('hidden');
        this.elements.proposedFolderName.textContent = proposal.folderName || 'Root';

        if (proposal.isNew) {
            this.elements.isNewTag.classList.remove('hidden');
        } else {
            this.elements.isNewTag.classList.add('hidden');
        }

        this.elements.proposalReason.textContent = `Reason: ${proposal.reason || 'Optimal categorization.'}`;
        this.elements.applyProposalBtn.textContent = proposal.isNew ? '✨ Create & Bookmark' : '✅ Add to Folder';
    }

    async handleApplyProposal() {
        if (!this.currentProposal) return;

        try {
            this.setLoading(true);
            const tab = await BookmarkManager.getActiveTab();
            let targetFolderId = this.currentProposal.folderId;

            // Handle new folder creation if AI suggested it
            if (this.currentProposal.isNew) {
                const newFolder = await BookmarkManager.createFolder(this.currentProposal.folderName);
                targetFolderId = newFolder.id;
            }

            // Create the bookmark
            await chrome.bookmarks.create({
                parentId: targetFolderId || '1',
                title: tab.title,
                url: tab.url
            });

            this.showToast('✅ Bookmark saved successfully!', 'success');
            this.elements.proposalResult.classList.add('hidden');
            this.currentProposal = null;

        } catch (error) {
            this.showToast(`Error: ${error.message}`, 'error');
        } finally {
            this.setLoading(false);
        }
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
