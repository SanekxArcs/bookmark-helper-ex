// Manager for storing and loading settings from chrome.storage
export class SettingsTab {
    constructor() {
        this.elements = {};
        this.initialize();
    }

    async initialize() {
        this.initializeElements();
        await this.loadSavedData();
        this.setupEventListeners();
        this.updateUsageStats();
    }

    initializeElements() {
        this.elements = {
            apiKey: document.getElementById('apiKey'),
            modelSelect: document.getElementById('modelSelect'),
            saveBtn: document.getElementById('saveSettingsBtn'),
            toggleApiKey: document.getElementById('toggleApiKey'),
            bookmarkCount: document.getElementById('bookmarkCount'),
            storageUsed: document.getElementById('storageUsed')
        };
    }

    async loadSavedData() {
        const data = await chrome.storage.local.get(['apiKey', 'geminiModel']);
        if (this.elements.apiKey) {
            this.elements.apiKey.value = data.apiKey || '';
        }
        if (this.elements.modelSelect) {
            // Default to 2.5-flash as requested
            this.elements.modelSelect.value = data.geminiModel || 'gemini-2.5-flash';
        }
    }

    setupEventListeners() {
        if (this.elements.saveBtn) {
            this.elements.saveBtn.addEventListener('click', async () => {
                const data = {
                    apiKey: this.elements.apiKey.value.trim(),
                    geminiModel: this.elements.modelSelect.value
                };

                await chrome.storage.local.set(data);
                this.showToast('✅ Settings saved successfully!', 'success');
            });
        }

        if (this.elements.toggleApiKey) {
            this.elements.toggleApiKey.addEventListener('click', () => {
                const type = this.elements.apiKey.type === 'password' ? 'text' : 'password';
                this.elements.apiKey.type = type;
                this.elements.toggleApiKey.textContent = type === 'password' ? '👁️' : '🔒';
            });
        }
    }

    async updateUsageStats() {
        // Simple bookmark count
        const bookmarks = await chrome.bookmarks.getTree();
        let count = 0;
        const countNodes = (nodes) => {
            nodes.forEach(node => {
                if (node.url) count++;
                if (node.children) countNodes(node.children);
            });
        };
        countNodes(bookmarks);

        if (this.elements.bookmarkCount) {
            this.elements.bookmarkCount.textContent = count;
        }

        // Storage usage
        const bytes = await chrome.storage.local.getBytesInUse();
        if (this.elements.storageUsed) {
            this.elements.storageUsed.textContent = `${(bytes / 1024).toFixed(2)} KB`;
        }
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
