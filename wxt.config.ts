import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'Gemini Bookmark Manager',
    description: 'Organize, search and clean up your bookmarks with Gemini AI.',
    permissions: ['bookmarks', 'storage', 'activeTab', 'scripting', 'contextMenus', 'notifications', 'favicon'],
    // Searching open tabs is opt-in: reading tab titles/URLs shows a "browsing history" warning.
    optional_permissions: ['tabs'],
    host_permissions: ['https://generativelanguage.googleapis.com/*'],
    // Site check asks for this only when run, so it can read real HTTP status codes (404, 500...).
    optional_host_permissions: ['http://*/*', 'https://*/*'],
    action: {
      default_title: 'Bookmark Helper',
    },
    commands: {
      'quick-search': {
        suggested_key: { default: 'Ctrl+Shift+K', mac: 'Command+Shift+K' },
        description: 'Open quick search',
      },
    },
    // The quick search overlay is an iframe of this page, injected into the current site.
    web_accessible_resources: [{ resources: ['quick-search.html'], matches: ['<all_urls>'] }],
  },
});
