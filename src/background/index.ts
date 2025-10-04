// Background service worker for MV3
import { createChunkingTask, createGeminiChunkingTask, processPendingTasks } from './chunker';
import { createTOCTask, processPendingTOCTasks } from './toc';

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

  // Process any pending chunking tasks from previous session
  try {
    await processPendingTasks();
  } catch (error) {
    console.error('Failed to process pending chunking tasks:', error);
  }

  // Process any pending TOC tasks from previous session
  try {
    await processPendingTOCTasks();
  } catch (error) {
    console.error('Failed to process pending TOC tasks:', error);
  }

  // Future: Set up cleanup alarm
  // chrome.alarms.create('cleanup', { periodInMinutes: 60 });
});

// Future: Cleanup alarm handler
// chrome.alarms.onAlarm.addListener((alarm) => {
//   if (alarm.name === 'cleanup') {
//     // Cleanup old OPFS files, expired cache, etc.
//   }
// });

// Message handler for creating chunking tasks
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'CREATE_CHUNKING_TASK_CHUNKR') {
    console.log('[background/index] Received message:', message);
    const { docHash, fileUrl, uploadId } = message.payload;
    console.log('[background/index] Extracted params:', { docHash, fileUrl, uploadId });
    
    createChunkingTask({ docHash, fileUrl, uploadId })
      .then((taskId) => {
        sendResponse({ success: true, taskId });
      })
      .catch((error) => {
        console.error('Failed to create chunking task:', error);
        sendResponse({ success: false, error: error.message });
      });
    
    // Return true to indicate we'll send response asynchronously
    return true;
  }

  if (message.type === 'CREATE_CHUNKING_TASK_GEMINI') {
    console.log('[background/index] Received CREATE_CHUNKING_TASK_GEMINI message:', message);
    const { docHash, fileUrl, uploadId } = message.payload;
    console.log('[background/index] Extracted params:', { docHash, fileUrl, uploadId });
    
    createGeminiChunkingTask({ docHash, fileUrl, uploadId })
      .then((taskId) => {
        sendResponse({ success: true, taskId });
      })
      .catch((error) => {
        console.error('Failed to create Gemini chunking task:', error);
        sendResponse({ success: false, error: error.message });
      });
    
    // Return true to indicate we'll send response asynchronously
    return true;
  }

  if (message.type === 'CREATE_TOC_TASK') {
    console.log('[background/index] Received CREATE_TOC_TASK message:', message);
    const { docHash, fileUrl, uploadId } = message.payload;
    console.log('[background/index] Extracted params:', { docHash, fileUrl, uploadId });
    
    createTOCTask({ docHash, fileUrl, uploadId })
      .then((taskId) => {
        sendResponse({ success: true, taskId });
      })
      .catch((error) => {
        console.error('Failed to create TOC task:', error);
        sendResponse({ success: false, error: error.message });
      });
    
    // Return true to indicate we'll send response asynchronously
    return true;
  }
});
