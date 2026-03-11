import { GeminiAPI } from '../../shared/gemini-api.js';

export class SearchTab {
    constructor() {
        this.allBookmarks = [];   // flat list, loaded once
        this.debounceTimer = null;
        this.lastQuery = '';
        this.initialize();
    }

    async initialize() {
        this.initializeElements();
        this.setupEventListeners();
        await this.loadAllBookmarks();
    }

    initializeElements() {
        this.el = {
            input: document.getElementById('searchInput'),
            clearBtn: document.getElementById('searchClearBtn'),
            modeChip: document.getElementById('searchModeChip'),
            aiForceBtn: document.getElementById('aiSearchForceBtn'),
            placeholder: document.getElementById('searchPlaceholder'),
            aiThinking: document.getElementById('aiThinking'),
            noResults: document.getElementById('noResults'),
            resultList: document.getElementById('resultList'),
            openFullPage: document.getElementById('openSearchFullPage'),
        };
    }

    // ─── Load all bookmarks flat ──────────────────────────────────────────────

    async loadAllBookmarks() {
        const tree = await chrome.bookmarks.getTree();
        this.allBookmarks = [];
        this.flattenTree(tree, '');
    }

    flattenTree(nodes, parentPath) {
        for (const node of nodes) {
            if (node.url) {
                this.allBookmarks.push({
                    id: node.id,
                    title: node.title || '',
                    url: node.url,
                    path: parentPath,
                });
            }
            if (node.children) {
                const name = node.title ? (parentPath ? `${parentPath} / ${node.title}` : node.title) : parentPath;
                this.flattenTree(node.children, name);
            }
        }
    }

    // ─── Event listeners ─────────────────────────────────────────────────────

    setupEventListeners() {
        this.el.input?.addEventListener('input', () => {
            const q = this.el.input.value.trim();
            this.el.clearBtn?.classList.toggle('hidden', !q);
            clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(() => this.handleSearch(q), 280);
        });

        this.el.input?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                clearTimeout(this.debounceTimer);
                this.handleSearch(this.el.input.value.trim());
            }
        });

        this.el.clearBtn?.addEventListener('click', () => {
            this.el.input.value = '';
            this.el.clearBtn.classList.add('hidden');
            this.reset();
            this.el.input.focus();
        });

        this.el.aiForceBtn?.addEventListener('click', () => {
            this.runAISearch(this.lastQuery);
        });

        this.el.openFullPage?.addEventListener('click', () => {
            chrome.tabs.create({ url: chrome.runtime.getURL('pages/search/search.html') });
        });
    }

    // Called when the tab becomes visible so bookmarks stay fresh
    async onShow() {
        await this.loadAllBookmarks();
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    // ─── Core search flow ─────────────────────────────────────────────────────

    async handleSearch(query) {
        this.lastQuery = query;

        if (!query) {
            this.reset();
            return;
        }

        // 1. Simple text search
        const textResults = this.simpleSearch(query);
        this.setModeChip('text', textResults.length);

        if (textResults.length > 0) {
            this.showResults(textResults, 'text');
            this.el.aiForceBtn?.classList.remove('hidden');
        } else {
            // 2. No text results → auto-trigger AI
            this.el.aiForceBtn?.classList.add('hidden');
            await this.runAISearch(query);
        }
    }

    // ─── Simple text search ───────────────────────────────────────────────────

    simpleSearch(query) {
        const q = query.toLowerCase();
        return this.allBookmarks.filter(b =>
            b.title.toLowerCase().includes(q) ||
            b.url.toLowerCase().includes(q) ||
            b.path.toLowerCase().includes(q)
        ).slice(0, 50);
    }

    // ─── AI search ────────────────────────────────────────────────────────────

    async runAISearch(query) {
        if (!query) return;

        const settings = await chrome.storage.local.get(['apiKey', 'geminiModel']);
        if (!settings.apiKey) {
            this.setModeChip('no-key');
            this.showNoResults();
            return;
        }

        this.setModeChip('ai-loading');
        this.showAIThinking(true);

        try {
            const api = new GeminiAPI(settings.apiKey, settings.geminiModel);

            // Build compact bookmark list for the prompt (limit to 2000 entries to stay within token limits)
            const sample = this.allBookmarks.slice(0, 2000);
            const bookmarkLines = sample.map(b =>
                `[${b.id}] "${b.title}" | ${b.url} | ${b.path}`
            ).join('\n');

            const prompt = `You are a bookmark search assistant. The user is searching for: "${query}"

Below is their full bookmark list (format: [id] "title" | url | folder path):
${bookmarkLines}

Return a JSON object with a single key "results" containing an array of bookmark IDs (strings) that are most relevant to the user's query. Consider partial name matches, topic matches, and semantic similarity. Return up to 15 most relevant IDs, ordered by relevance. If nothing is relevant return an empty array.

Example: {"results": ["42", "7", "123"]}`;

            const response = await api.generateContent(prompt);
            const ids = Array.isArray(response?.results) ? response.results.map(String) : [];

            const aiResults = ids
                .map(id => this.allBookmarks.find(b => b.id === id))
                .filter(Boolean);

            this.showAIThinking(false);

            if (aiResults.length === 0) {
                this.setModeChip('ai-none');
                this.showNoResults();
            } else {
                this.setModeChip('ai', aiResults.length);
                this.showResults(aiResults, 'ai');
            }
        } catch (err) {
            this.showAIThinking(false);
            this.setModeChip('ai-error');
            this.showNoResults();
            console.error('AI search error:', err);
        }
    }

    // ─── UI helpers ───────────────────────────────────────────────────────────

    reset() {
        this.el.placeholder?.classList.remove('hidden');
        this.el.aiThinking?.classList.add('hidden');
        this.el.noResults?.classList.add('hidden');
        this.el.resultList && (this.el.resultList.innerHTML = '');
        this.el.aiForceBtn?.classList.add('hidden');
        this.setModeChip('idle');
    }

    showAIThinking(visible) {
        this.el.aiThinking?.classList.toggle('hidden', !visible);
        this.el.placeholder?.classList.add('hidden');
        this.el.noResults?.classList.add('hidden');
        this.el.resultList && (this.el.resultList.innerHTML = '');
    }

    showNoResults() {
        this.el.noResults?.classList.remove('hidden');
        this.el.placeholder?.classList.add('hidden');
        this.el.resultList && (this.el.resultList.innerHTML = '');
    }

    showResults(results, mode) {
        this.el.placeholder?.classList.add('hidden');
        this.el.noResults?.classList.add('hidden');
        this.el.aiThinking?.classList.add('hidden');

        const list = this.el.resultList;
        if (!list) return;
        list.innerHTML = '';

        const isAI = mode === 'ai';
        const fragment = document.createDocumentFragment();

        for (const b of results) {
            const item = this.buildResultItem(b, isAI);
            fragment.appendChild(item);
        }

        list.appendChild(fragment);
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    buildResultItem(b, isAI) {
        const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(new URL(b.url).hostname)}&sz=32`;

        const div = document.createElement('div');
        div.className = 'search-result-item';
        div.style.cssText = 'background:#0d0d0d;border:1px solid #1a1a1a;border-radius:12px;padding:10px 12px;cursor:pointer;display:flex;align-items:center;gap:10px;transition:border-color .15s,background .15s;';

        div.innerHTML = `
          <img src="${faviconUrl}" width="16" height="16"
            style="border-radius:3px;flex-shrink:0;opacity:.8;"
            onerror="this.style.display='none'" loading="lazy" />
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:5px;">
              <span class="result-title" style="font-size:12px;font-weight:600;color:#e0e0e0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;max-width:240px;">${this.escapeHtml(b.title || b.url)}</span>
              ${isAI ? `<span style="font-size:9px;padding:1px 5px;border-radius:20px;background:var(--accent-dim);color:var(--accent);border:1px solid var(--accent-glow);flex-shrink:0;font-weight:700;">AI</span>` : ''}
            </div>
            <div style="font-size:10px;color:#444;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px;">${this.escapeHtml(b.url)}</div>
            ${b.path ? `<div style="font-size:9px;color:#333;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"><i data-lucide="folder" style="width:9px;height:9px;display:inline-block;vertical-align:middle;margin-right:2px;"></i>${this.escapeHtml(b.path)}</div>` : ''}
          </div>
          <a href="${b.url}" target="_blank" rel="noopener noreferrer"
            title="Open bookmark"
            style="flex-shrink:0;color:#333;padding:4px;"
            class="open-link">
            <i data-lucide="external-link" style="width:13px;height:13px;display:block;"></i>
          </a>
        `;

        // Click on item row → open bookmark
        div.addEventListener('click', (e) => {
            if (e.target.closest('.open-link')) return;
            chrome.tabs.create({ url: b.url });
        });

        div.addEventListener('mouseenter', () => {
            div.style.background = '#131313';
            div.style.borderColor = '#2a2a2a';
        });
        div.addEventListener('mouseleave', () => {
            div.style.background = '#0d0d0d';
            div.style.borderColor = '#1a1a1a';
        });

        return div;
    }

    setModeChip(mode, count) {
        const chip = this.el.modeChip;
        if (!chip) return;

        const configs = {
            idle: { text: 'Type to search', bg: '#161616', border: '#242424', color: '#555' },
            text: { text: `${count} result${count !== 1 ? 's' : ''}`, bg: '#161616', border: '#242424', color: '#666' },
            'ai-loading': { text: 'AI searching…', bg: 'var(--accent-dim)', border: 'var(--accent-glow)', color: 'var(--accent)' },
            ai: { text: `AI found ${count}`, bg: 'var(--accent-dim)', border: 'var(--accent-glow)', color: 'var(--accent)' },
            'ai-none': { text: 'AI: no matches', bg: '#161616', border: '#242424', color: '#444' },
            'ai-error': { text: 'AI error — check console', bg: 'rgba(248,113,113,.1)', border: 'rgba(248,113,113,.3)', color: '#f87171' },
            'no-key': { text: 'Set API key in Settings', bg: 'rgba(251,191,36,.1)', border: 'rgba(251,191,36,.3)', color: '#fbbf24' },
        };

        const cfg = configs[mode] || configs.idle;
        chip.textContent = cfg.text;
        chip.style.background = cfg.bg;
        chip.style.borderColor = cfg.border;
        chip.style.color = cfg.color;
    }

    escapeHtml(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
}
