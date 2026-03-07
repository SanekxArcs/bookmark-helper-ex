// Placeholder for background listeners (context menus, notifications)
chrome.runtime.onInstalled.addListener(() => {
    console.log('Gemini Bookmark Manager installed');

    // Create context menu for quick categorization
    chrome.contextMenus.create({
        id: 'categorizeToGemini',
        title: 'Categorize with Gemini',
        contexts: ['page', 'link']
    });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'categorizeToGemini') {
        // Handle context menu click (implementation in next phase)
        console.log('Context menu clicked for:', info.linkUrl || info.pageUrl);
    }
});
