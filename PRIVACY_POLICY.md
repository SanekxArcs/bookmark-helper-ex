# Privacy Policy for Gemini Bookmark Manager

**Last Updated: October 3, 2026**

This Privacy Policy describes how the **Gemini Bookmark Manager** browser extension (the "Extension") handles your data.

## 1. Overview

The Extension is designed to help you organize bookmarks using artificial intelligence. Your privacy is a priority, and the Extension is built to be transparent about data usage.

## 2. Information Collection and Use

To provide its core functionality, the Extension accesses and processes the following data:

- **Bookmarks:** The Extension reads your bookmark titles, folders, and URLs to allow for searching, organization, and AI-powered sorting.
- **Active Tab Information:** When you open the extension popup, it reads the URL and title of the current tab so you can save it.
- **Settings and API Keys:** Your Gemini API key and preferences (theme, model, automation options) are stored locally in your browser (`chrome.storage.local`). They are not synced to other devices.
- **Open tabs (optional):** Only if you turn on "Include open tabs" for search, the Extension reads the titles and URLs of your open tabs to show them in search results. This uses the optional `tabs` permission, which you can revoke at any time in Settings. Open tabs are never sent to the Gemini API.
- **Quick search overlay:** When you press the quick search shortcut, the Extension shows its search box over the current page. It does not read the page's content.
- **Site check (optional):** Only when you run **Site check**, the Extension requests each bookmarked link and its domain home page directly from your browser to see whether they still respond. Requests are sent without cookies, page content is not downloaded or stored, and only the result (alive, HTTP status, timed out, no response) is saved locally. To read HTTP status codes such as 404, it asks for the optional permission to access websites, which you can decline or revoke at any time.
- **Favicons:** Site icons are loaded from your browser's own favicon cache. No requests are made to third-party icon services.

## 3. Data Processing and Transmission

- **No Third-Party Servers:** The Extension does **not** send your data to any servers owned or operated by the developer.
- **Google Gemini API:** Bookmark titles, URLs and your folder names are sent directly to the **Google Gemini API** (`generativelanguage.googleapis.com`) only when an AI feature runs:
  - when you click "Suggest folder", "Sort with AI", "Ask AI" (search) or "Ask AI" (duplicates);
  - when a search finds no matches and **Ask AI when nothing matches** is on (it can be turned off in Settings);
  - when you use the "Save … to suggested folder" right-click menu item;
  - when **Auto-sort new bookmarks** is enabled (it is on by default and can be turned off in Settings), for each bookmark you create with the browser's star button.

  Nothing is sent if you haven't added an API key. This transmission is necessary for the AI features to work. Please refer to [Google's Privacy Policy](https://policies.google.com/privacy) for how they handle API data.
- **Site check:** When you run it, the Extension contacts the websites you bookmarked, the same as opening them. It sends them nothing besides a normal request for the page.
- **Local Processing:** All other operations, including theme management and local searching, happen entirely within your browser.

## 4. Data Retention

The Extension does not maintain any persistent databases of your personal information outside of your own browser's storage. If you uninstall the Extension or clear its data, all stored settings (including your API key) are permanently deleted.

## 5. Third-Party Links

The Extension may contain links to third-party sites (e.g., GitHub, PayPal). We are not responsible for the privacy practices of those websites.

## 6. Disclosure

We do not sell, trade, or otherwise transfer your data to outside parties. We do not use your data for advertising, credit scoring, or any purpose other than bookmark management.

## 7. Contact

If you have questions about this Privacy Policy, you can contact the developer at:
**oleksandr.dzisiak@gmail.com**
