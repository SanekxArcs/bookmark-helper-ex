// Full-page search — standalone script (no module exports needed)
import { GeminiAPI } from '../../shared/gemini-api.js';

class FullPageSearch {
    constructor() {
        this.allBookmarks = [];
        this.debounceTimer = null;
        this.lastQuery = '';

        this.el = {
            input: document.getElementById('searchInput'),
            clearBtn: document.getElementById('searchClearBtn'),
            modeChip: document.getElementById('searchModeChip'),
            aiForceBtn: document.getElementById('aiSearchForceBtn'),
            placeholder: document.getElementById('searchPlaceholder'),
            aiThinking: document.getElementById('aiThinking'),
            noResults: document.getElementById('noResults'),
            resultList: document.getElementById('resultList'),
            totalCount: document.getElementById('totalCount'),
        };

        this.init();
    }

    async init() {
        await this.loadAllBookmarks();
        this.setupEventListeners();
        this.el.totalCount && (this.el.totalCount.textContent = `${this.allBookmarks.length} bookmarks indexed`);
        lucide.createIcons();

        // If opened with a query in URL hash (e.g. from popup)
        const hash = decodeURIComponent(location.hash.slice(1));
        if (hash) {
            this.el.input.value = hash;
            this.el.clearBtn?.classList.remove('hidden');
            this.handleSearch(hash);
        }
    }

    async loadAllBookmarks() {
        const tree = await chrome.bookmarks.getTree();
        this.allBookmarks = [];
        this.flattenTree(tree, '');
    }

    flattenTree(nodes, parentPath) {
        for (const node of nodes) {
            if (node.url) {
                this.allBookmarks.push({ id: node.id, title: node.title || '', url: node.url, path: parentPath });
            }
            if (node.children) {
                const name = node.title ? (parentPath ? `${parentPath} / ${node.title}` : node.title) : parentPath;
                this.flattenTree(node.children, name);
            }
        }
    }

    setupEventListeners() {
        this.el.input?.addEventListener('input', () => {
            const q = this.el.input.value.trim();
            this.el.clearBtn?.classList.toggle('hidden', !q);
            clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(() => this.handleSearch(q), 300);
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
    }

    async handleSearch(query) {
        this.lastQuery = query;
        if (!query) { this.reset(); return; }

        const textResults = this.simpleSearch(query);
        this.setModeChip('text', textResults.length);

        if (textResults.length > 0) {
            this.showResults(textResults, 'text');
            this.el.aiForceBtn?.classList.remove('hidden');
        } else {
            this.el.aiForceBtn?.classList.add('hidden');
            await this.runAISearch(query);
        }
    }

    simpleSearch(query) {
        const q = query.toLowerCase();
        return this.allBookmarks.filter(b =>
            b.title.toLowerCase().includes(q) ||
            b.url.toLowerCase().includes(q) ||
            b.path.toLowerCase().includes(q)
        ).slice(0, 100);
    }

    async runAISearch(query) {
        if (!query) return;

        const settings = await chrome.storage.local.get(['apiKey', 'geminiModel']);
        if (!settings.apiKey) { this.setModeChip('no-key'); this.showNoResults(); return; }

        this.setModeChip('ai-loading');
        this.showAIThinking(true);

        try {
            const api = new GeminiAPI(settings.apiKey, settings.geminiModel);
            const sample = this.allBookmarks.slice(0, 2000);
            const bookmarkLines = sample.map(b => `[${b.id}] "${b.title}" | ${b.url} | ${b.path}`).join('\n');

            const prompt = `You are a bookmark search assistant. The user is searching for: "${query}"

Below is their full bookmark list (format: [id] "title" | url | folder path):
${bookmarkLines}

Return a JSON object with a single key "results" containing an array of bookmark IDs (strings) that are most relevant to the user's query. Consider partial name matches, topic matches, and semantic similarity. Return up to 20 most relevant IDs, ordered by relevance. If nothing is relevant return an empty array.

Example: {"results": ["42", "7", "123"]}`;

            const response = await api.generateContent(prompt);
            const ids = Array.isArray(response?.results) ? response.results.map(String) : [];
            const aiResults = ids.map(id => this.allBookmarks.find(b => b.id === id)).filter(Boolean);

            this.showAIThinking(false);

            if (aiResults.length === 0) { this.setModeChip('ai-none'); this.showNoResults(); }
            else { this.setModeChip('ai', aiResults.length); this.showResults(aiResults, 'ai'); }
        } catch (err) {
            this.showAIThinking(false);
            this.setModeChip('ai-error');
            this.showNoResults();
            console.error('AI search error:', err);
        }
    }

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
        for (const b of results) fragment.appendChild(this.buildResultItem(b, isAI));
        list.appendChild(fragment);
        lucide.createIcons();
    }

    buildResultItem(b, isAI) {
        let hostname = '';
        try { hostname = new URL(b.url).hostname; } catch (_) { }
        const faviconUrl = hostname ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=32` : '';

        const div = document.createElement('div');
        div.className = 'search-result-item';
        div.style.cssText = 'background:#0d0d0d;border:1px solid #1a1a1a;border-radius:14px;padding:12px 14px;cursor:pointer;display:flex;align-items:center;gap:12px;';

        div.innerHTML = `
          ${faviconUrl ? `<img src="${faviconUrl}" width="18" height="18" style="border-radius:4px;flex-shrink:0;opacity:.8;" onerror="this.style.display='none'" loading="lazy" />` : `<i data-lucide="bookmark" style="width:16px;height:16px;flex-shrink:0;color:#333;"></i>`}
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:6px;">
              <span style="font-size:13px;font-weight:600;color:#e0e0e0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;">${this.escapeHtml(b.title || b.url)}</span>
              ${isAI ? `<span style="font-size:9px;padding:1px 6px;border-radius:20px;background:var(--accent-dim);color:var(--accent);border:1px solid var(--accent-glow);flex-shrink:0;font-weight:700;white-space:nowrap;">AI</span>` : ''}
            </div>
            <div style="font-size:11px;color:#3a3a3a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px;">${this.escapeHtml(b.url)}</div>
            ${b.path ? `<div style="font-size:10px;color:#2e2e2e;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"><i data-lucide="folder" style="width:10px;height:10px;display:inline-block;vertical-align:middle;margin-right:3px;"></i>${this.escapeHtml(b.path)}</div>` : ''}
          </div>
          <a href="${b.url}" target="_blank" rel="noopener noreferrer"
            title="Open bookmark"
            style="flex-shrink:0;color:#2a2a2a;padding:6px;border-radius:8px;border:1px solid #1a1a1a;"
            class="open-link hover:text-accent">
            <i data-lucide="external-link" style="width:14px;height:14px;display:block;"></i>
          </a>
        `;

        div.addEventListener('click', (e) => {
            if (e.target.closest('.open-link')) return;
            window.open(b.url, '_blank', 'noopener,noreferrer');
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
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
}

new FullPageSearch();
