export class TabManager {
    constructor() {
        this.currentTab = 'manage'; // Fixed default tab for now
        this.elements = {
            tabs: document.querySelectorAll('.tab'),
            tabContainer: document.getElementById('tab-content-container')
        };
        this.tabInstances = {};
        this.setupEventListeners();
    }

    setupEventListeners() {
        this.elements.tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                const tabName = e.currentTarget.getAttribute('data-tab');
                this.switchToTab(tabName);
            });
        });
    }

    registerTab(name, instance) {
        this.tabInstances[name] = instance;
    }

    async switchToTab(tabName) {
        if (!this.tabInstances[tabName]) return;

        // Visual feedback
        this.elements.tabs.forEach(tab => {
            if (tab.getAttribute('data-tab') === tabName) {
                tab.classList.add('tab-active');
            } else {
                tab.classList.remove('tab-active');
            }
        });

        // Hide current content
        const allContents = document.querySelectorAll('.tab-content');
        allContents.forEach(content => content.classList.add('hidden'));

        // Show target content
        const targetContent = document.getElementById(`${tabName}-tab`);
        if (targetContent) {
            targetContent.classList.remove('hidden');
            if (this.tabInstances[tabName].onShow) {
                this.tabInstances[tabName].onShow();
            }

            // Sync Lucide icons whenever a tab is shown
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        }

        this.currentTab = tabName;
    }
}
