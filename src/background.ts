// Background service worker for Documind extension
// Intercepts PDF requests and redirects to custom viewer

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.url.endsWith('.pdf') && details.frameId === 0) {
    const viewerUrl = chrome.runtime.getURL('viewer.html') + '?file=' + encodeURIComponent(details.url);
    chrome.tabs.update(details.tabId, { url: viewerUrl });
  }
});

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'PDF_DETECTED') {
    // Handle PDF detection
    console.log('PDF detected:', request.url);
  }
  return true;
});

console.log('Documind background service worker initialized');
