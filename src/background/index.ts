// Background service worker for MV3
import { createChunkingTask, createGeminiChunkingTask, processPendingTasks } from './chunker';
import { createTOCTask, processPendingTOCTasks } from './toc';

console.log('DocuMind background service worker loaded');

// Track viewer states
interface ViewerState {
  tabId: number;
  docHash: string;
  fileName: string;
  currentPage: number;
  totalPages: number;
  zoom: string;
  visibleText: string;
  lastUpdate: number;
}

const viewerStates = new Map<number, ViewerState>();

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

  // Set up viewer state tracking alarm (every 5 seconds)
  chrome.alarms.create('trackViewerState', { periodInMinutes: 5 / 60 });

  // Future: Set up cleanup alarm
  // chrome.alarms.create('cleanup', { periodInMinutes: 60 });
});

// Alarm handler for periodic tasks
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'trackViewerState') {
    // Query all viewer tabs and request their current state
    const tabs = await chrome.tabs.query({
      url: chrome.runtime.getURL('viewer.html*')
    });

    console.log(`[trackViewerState] Found ${tabs.length} viewer tab(s)`);

    // Clean up states for closed tabs
    const activeTabs = new Set(tabs.map(t => t.id));
    for (const [tabId] of viewerStates) {
      if (!activeTabs.has(tabId)) {
        viewerStates.delete(tabId);
        console.log(`[trackViewerState] Removed state for closed tab ${tabId}`);
      }
    }

    // Request state from each viewer tab
    for (const tab of tabs) {
      if (tab.id) {
        try {
          chrome.tabs.sendMessage(tab.id, { type: 'REQUEST_VIEWER_STATE' });
        } catch (error) {
          console.error(`Failed to request state from tab ${tab.id}:`, error);
        }
      }
    }

    // Log current viewer states
    if (viewerStates.size > 0) {
      console.log('[trackViewerState] Current viewer states:');
      for (const [tabId, state] of viewerStates) {
        console.log(`  Tab ${tabId}: ${state.fileName} - Page ${state.currentPage}/${state.totalPages} (${state.zoom})`);
        console.log(`  Visible Text (${state.visibleText.length} chars):`);
        console.log(state.visibleText);
        console.log('--- End of visible text ---');
      }
    }
  }

  // Future: Cleanup alarm handler
  // if (alarm.name === 'cleanup') {
  //   // Cleanup old OPFS files, expired cache, etc.
  // }
});

// Message handler for creating chunking tasks and tracking viewer state
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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

  if (message.type === 'UPDATE_VIEWER_STATE') {
    // Update the stored state for this viewer tab
    const tabId = sender.tab?.id;
    if (tabId) {
      const state: ViewerState = {
        tabId,
        docHash: message.payload.docHash,
        fileName: message.payload.fileName,
        currentPage: message.payload.currentPage,
        totalPages: message.payload.totalPages,
        zoom: message.payload.zoom,
        visibleText: message.payload.visibleText || '',
        lastUpdate: Date.now(),
      };
      viewerStates.set(tabId, state);
      console.log(`[UPDATE_VIEWER_STATE] Received state from tab ${tabId}:`, {
        fileName: state.fileName,
        page: `${state.currentPage}/${state.totalPages}`,
        textLength: state.visibleText.length
      });
      console.log('[UPDATE_VIEWER_STATE] Full visible text:', state.visibleText);
    }
    return false;
  }
});
