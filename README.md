# ⚡ AI Pro Bookmark Organizer (Gemini Edition)

A professional browser extension that uses Google Gemini AI to help you organize your bookmarks into smart folders, perform batch sorting, and manage your links with a clean, AMOLED dark theme interface.

![AMOLED Interface](https://img.shields.io/badge/Theme-AMOLED_Dark-8b5cf6?style=for-the-badge)
![AI Powered](https://img.shields.io/badge/Powered_by-Gemini_2.5-blue?style=for-the-badge)

---

## 🚀 Features

- **✦ Smart Suggest:** Analyze the current page and get AI recommendations for the best folder to save it in.
- **🔄 AI Batch Sort:** Scan your existing bookmarks and let the AI propose moves to better categories.
- **⚡ Advanced Pro Organizer:** A full-screen management interface with a folder tree, multi-select actions, and in-depth AI inspection.
- **🌑 AMOLED Dark Theme:** A premium, high-contrast dark mode with violet accents, optimized for OLED displays.
- **🔍 Duplicate Finder:** Search for potential and exact duplicate bookmarks (same domain or path) with full-screen "PRO" view for deep cleanup.
- **�🔑 Flexible Configuration:** Support for the latest Gemini 2.5 Flash and Flash-Lite models.

---

## 🛠 Installation Guide

As this is a developer version, follow these steps to install it in your browser:

1. **Download the source:** Clone this repository or download and extract the ZIP file.
2. **Open Extensions Page:** In Chrome or Edge, navigate to `chrome://extensions/`.
3. **Enable Developer Mode:** Toggle the switch in the top-right corner.
4. **Load Unpacked:** Click the **"Load unpacked"** button and select the `bookmark-helper-ex` folder.
5. **Pin the Extension:** Click the puzzle icon in your toolbar and pin "Gemini Bookmarks" for easy access.

---

## 🔑 Getting your Gemini API Key

The extension requires a Google Gemini API key to function:

1. Visit **[Google AI Studio](https://aistudio.google.com/app/apikey)**.
2. Sign in with your Google account.
3. Click on **"Create API key"**.
4. Copy your new key.
5. In the extension, go to the **Settings** tab and paste your key into the "Gemini API Key" field.
6. Click **"Save Settings"**.

---

## 📖 How to Use

### 1. Saving New Bookmarks (Manage Tab)

- Open the extension while on a website you want to bookmark.
- Add a personal note if you want (e.g., "Reference for my project").
- Click **"Analyze Page"**.
- AI will suggest a folder. Click **"Confirm & Add"** to save it.

### 2. Batch Organizing (Sort Tab)

- Go to the **Sort** tab in the popup.
- Click **"Scan & Propose Sort"**.
- Review the AI's suggestions and click **"Apply All Changes"** to reorganize your library instantly.

### 3. Advanced Management (Organizer)

- Click the **"Advanced Manager"** button on the Manage or Sort tabs.
- This opens a full-screen view where you can browse your entire folder tree.
- Select multiple bookmarks to perform batch AI sorting within specific folders.
- Use **"Analyze"** on individual items to get deeper insights into where they belong.

---

## 💜 Theme & Design

The extension features a custom **AMOLED Dark Theme** with:

- True black background (`#000000`) for zero-light emission on OLED screens.
- **Violet Accent** (`#8b5cf6`) for a professional "AI" aesthetic.
- Ultra-thin custom scrollbars.
- Smooth CSS animations for a premium feel.

---

## 🛡 Privacy

Your API key is stored locally in your browser's sync storage. Bookmark titles and URLs are sent to the Google Gemini API only when you explicitly request an analysis or sort. No data is stored on external servers by this extension.

---

*Built with ❤️ using Gemini 2.5 and Tailwind CSS.*
