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

// Track the last visible text for each tab to avoid re-processing unchanged text
const lastVisibleText = new Map<number, string>();

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

    // Clean up states for closed tabs
    const activeTabs = new Set(tabs.map(t => t.id));
    for (const [tabId] of viewerStates) {
      if (!activeTabs.has(tabId)) {
        viewerStates.delete(tabId);
        lastVisibleText.delete(tabId);
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

      // Extract terms from visible text only if it has changed
      if (state.visibleText && state.visibleText.length > 0) {
        const previousText = lastVisibleText.get(tabId);
        if (previousText !== state.visibleText) {
          console.log(`[UPDATE_VIEWER_STATE] Visible text changed for tab ${tabId}, extracting terms`);
          lastVisibleText.set(tabId, state.visibleText);
          extractTermsFromText(state.visibleText, tabId, state.fileName, state.currentPage, state.docHash);
        }
      }
    }
    // Send acknowledgment response
    sendResponse({ success: true });
    return true; // Indicate async response
  }
});

// Helper function to extract terms using offscreen document
async function extractTermsFromText(passage: string, tabId: number, fileName: string, currentPage: number, docHash: string) {
  try {
    console.log(`[extractTerms] Extracting terms for tab ${tabId}, page ${currentPage}`);

    // Ensure offscreen document exists
    let offscreenExists = false;
    try {
      const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType],
        documentUrls: [chrome.runtime.getURL('offscreen.html')]
      });
      offscreenExists = existingContexts.length > 0;
    } catch (err) {
      console.log('[extractTerms] Error checking offscreen context:', err);
    }

    if (!offscreenExists) {
      console.log('[extractTerms] Creating offscreen document');
      try {
        await chrome.offscreen.createDocument({
          url: 'offscreen.html',
          reasons: ['DOM_SCRAPING' as chrome.offscreen.Reason],
          justification: 'Extract technical terms from visible text using AI'
        });
      } catch (err) {
        console.log('[extractTerms] Offscreen document may already exist');
      }
    }

    // Send message to offscreen document to extract terms
    const response = await chrome.runtime.sendMessage({
      type: 'EXTRACT_TERMS',
      payload: { passage }
    });

    if (response.success && response.result) {
      console.log(`[extractTerms] Successfully extracted terms for "${fileName}" page ${currentPage}:`);
      console.log(`  Terms: ${response.result.terms.join(', ')}`);
      console.log(`  Total terms: ${response.result.terms.length}`);

      // Find sections for each term
      if (response.result.terms.length > 0) {
        await findSectionsForTerms(response.result.terms, docHash, fileName, currentPage);
      }
    } else {
      console.warn('[extractTerms] Failed to extract terms:', response.error);
    }
  } catch (error) {
    console.error('[extractTerms] Error extracting terms:', error);
  }
}

// Helper function to find sections for terms
async function findSectionsForTerms(terms: string[], docHash: string, fileName: string, currentPage: number) {
  try {
    console.log(`[findSections] Finding sections for ${terms.length} terms in "${fileName}" page ${currentPage}`);

    // Send message to offscreen document to find sections
    const response = await chrome.runtime.sendMessage({
      type: 'FIND_SECTIONS_FOR_TERMS',
      payload: { terms, docHash }
    });

    if (response.success && response.results) {
      if (response.results.length > 0) {
        console.log(`[findSections] Successfully found sections for "${fileName}" page ${currentPage}:`);
      } else {
        console.log(`[findSections] No sections found for "${fileName}" page ${currentPage}`);
      }

      // Log each term with its section
      for (const result of response.results) {
        if (result.tocItem) {
          const chunkInfo = result.matchedChunkId ? ` [chunk: ${result.matchedChunkId.substring(0, 8)}...]` : '';
          console.log(`  • ${result.term} → ${result.tocItem.title} (Page ${result.tocItem.page})${chunkInfo}`);
        } else {
          console.log(`  • ${result.term} → No section found`);
        }
      }

      // Summary
      const termsWithSections = response.results.filter((r: any) => r.tocItem).length;
      const termsWithChunks = response.results.filter((r: any) => r.matchedChunkId).length;
      console.log(`[findSections] Found sections for ${termsWithSections}/${terms.length} terms (${termsWithChunks} with chunk context)`);

      // Generate summaries for all terms
      await summarizeTerms(response.results, docHash, fileName, currentPage);
    } else {
      console.warn('[findSections] Failed to find sections:', response.error);
    }
  } catch (error) {
    console.error('[findSections] Error finding sections:', error);
  }
}

// Helper function to generate summaries for terms
async function summarizeTerms(termsWithSections: any[], docHash: string, fileName: string, currentPage: number) {
  try {
    console.log(`[summarize] Generating summaries for ${termsWithSections.length} terms in "${fileName}" page ${currentPage}`);

    // Send message to offscreen document to generate summaries
    const response = await chrome.runtime.sendMessage({
      type: 'SUMMARIZE_TERMS',
      payload: { termsWithSections, docHash }
    });

    if (response.success && response.summaries) {
      console.log(`[summarize] Successfully generated summaries for "${fileName}" page ${currentPage}:`);
      console.log('═══════════════════════════════════════════════════════');

      // Log each term summary
      for (const summary of response.summaries) {
        console.log(`\n📚 Term: ${summary.term}`);
        if (summary.tocItem) {
          console.log(`   Section: ${summary.tocItem.title} (Page ${summary.tocItem.page})`);
        }
        if (summary.matchedChunkId) {
          console.log(`   Context Chunk: ${summary.matchedChunkId}`);
        }
        console.log(`   Definition: ${summary.definition}`);
        console.log(`   Key Points:`);
        console.log(`   1. ${summary.explanation1}`);
        console.log(`   2. ${summary.explanation2}`);
        console.log(`   3. ${summary.explanation3}`);
      }

      console.log('\n═══════════════════════════════════════════════════════');
      console.log(`[summarize] Generated ${response.summaries.length} summaries`);
    } else {
      console.warn('[summarize] Failed to generate summaries:', response.error);
    }
  } catch (error) {
    console.error('[summarize] Error generating summaries:', error);
  }
}
