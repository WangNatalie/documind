// Background service worker for MV3
console.log('DocuMind background service worker loaded');

// Intercept PDF navigation and redirect to our viewer
// Using onCommitted instead of onBeforeNavigate for earlier interception
chrome.webNavigation.onCommitted.addListener(
  (details) => {
    // Only handle main frame navigation
    if (details.frameId !== 0) return;
    
    const url = details.url;
    
    // Check if it's a PDF URL (case insensitive)
    if (url.match(/^https?:\/\/.+\.pdf(\?.*)?$/i)) {
      console.log('PDF detected, redirecting to viewer:', url);
      
      // Redirect to our viewer
      const viewerUrl = chrome.runtime.getURL(`viewer.html?file=${encodeURIComponent(url)}`);
      
      // Use chrome.tabs.update to navigate to our viewer
      chrome.tabs.update(details.tabId, { url: viewerUrl }).catch((error) => {
        console.error('Failed to redirect:', error);
      });
    }
  }
);

// Request storage persistence on install
chrome.runtime.onInstalled.addListener(async () => {
  console.log('Extension installed');
  
  // Future: Set up cleanup alarm
  // chrome.alarms.create('cleanup', { periodInMinutes: 60 });
});

// Future: Cleanup alarm handler
// chrome.alarms.onAlarm.addListener((alarm) => {
//   if (alarm.name === 'cleanup') {
//     // Cleanup old OPFS files, expired cache, etc.
//   }
// });
