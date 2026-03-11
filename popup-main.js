// Main entry point for the popup navigation and module initialization
import { TabManager } from './shared/tab-manager.js';
import { SettingsTab } from './tabs/settings/settings.js';
import { ManageTab } from './tabs/manage/manage.js';
import { SortTab } from './tabs/sort/sort.js';
import { SearchTab } from './tabs/search/search.js';

class BookmarkApp {
    constructor() {
        this.tabManager = null;
        this.tabs = {};
        this.initialize();
    }

    async initialize() {
        try {
            console.log('BookmarkApp starting initialization...');

            // Apply theme from storage
            const settings = await chrome.storage.local.get('accentColor');
            if (settings.accentColor) {
                document.documentElement.setAttribute('data-theme', settings.accentColor);
            }

            // Setup Tab Manager
            this.tabManager = new TabManager();

            // Load and initialize tab modules
            await Promise.all([
                this.loadTabHTML('manage'),
                this.loadTabHTML('sort'),
                this.loadTabHTML('search'),
                this.loadTabHTML('settings')
            ]);

            // Initialize Tabs
            this.tabs.settings = new SettingsTab();
            this.tabManager.registerTab('settings', this.tabs.settings);

            this.tabs.manage = new ManageTab();
            this.tabManager.registerTab('manage', this.tabs.manage);

            this.tabs.sort = new SortTab();
            this.tabManager.registerTab('sort', this.tabs.sort);

            this.tabs.search = new SearchTab();
            this.tabManager.registerTab('search', this.tabs.search);

            // Switch to initial tab
            await this.tabManager.switchToTab('manage');

            // Apply Lucide icons after everything is loaded
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }

            console.log('BookmarkApp fully initialized');
        } catch (error) {
            console.error('Initialization error:', error);
        }
    }

    async loadTabHTML(tabName) {
        const container = document.getElementById('tab-content-container');
        try {
            const response = await fetch(`./tabs/${tabName}/${tabName}.html`);
            if (!response.ok) throw new Error(`Status ${response.status}`);
            const html = await response.text();

            const div = document.createElement('div');
            div.id = `${tabName}-tab`;
            div.className = 'tab-content hidden';
            div.innerHTML = html;
            container.appendChild(div);
        } catch (error) {
            console.warn(`Could not load ${tabName} tab:`, error);
            const errorDiv = document.createElement('div');
            errorDiv.id = `${tabName}-tab`;
            errorDiv.className = 'tab-content hidden p-8 text-center';
            errorDiv.style.color = '#555';
            errorDiv.innerHTML = `<p>Error loading ${tabName} tab content</p>`;
            container.appendChild(errorDiv);
        }
    }
}

// Instantiate the app when DOM ready
document.addEventListener('DOMContentLoaded', () => {
    new BookmarkApp();
});
