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

  if (message.type === 'CHAT_QUERY') {
    const { query, docHash } = message.payload;
    console.log(`[background] Received CHAT_QUERY for query: "${query.substring(0, 50)}..."`);
    
    (async () => {
      try {
        // Ensure offscreen document exists
        let offscreenExists = false;
        try {
          const existingContexts = await chrome.runtime.getContexts({
            contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType],
            documentUrls: [chrome.runtime.getURL('offscreen.html')]
          });
          offscreenExists = existingContexts.length > 0;
        } catch (err) {
          console.log('[background] Error checking offscreen context:', err);
        }

        if (!offscreenExists) {
          console.log('[background] Creating offscreen document for chat query...');
          await chrome.offscreen.createDocument({
            url: 'offscreen.html',
            reasons: ['DOM_SCRAPING' as chrome.offscreen.Reason],
            justification: 'Generate AI chat response with document context'
          });
        }

        // Forward to offscreen document
        const response = await chrome.runtime.sendMessage({
          type: 'CHAT_QUERY',
          payload: { query, docHash }
        });

        if (response && response.success) {
          console.log('[background] Chat query successful');
          sendResponse({ success: true, result: response.result });
        } else {
          console.error('[background] Chat query failed:', response?.error);
          sendResponse({ success: false, error: response?.error || 'Unknown error' });
        }
      } catch (error: any) {
        console.error('[background] Error processing chat query:', error);
        sendResponse({ success: false, error: error.message || 'Unknown error' });
      }
    })();
    
    return true; // Indicate async response
  }
});
