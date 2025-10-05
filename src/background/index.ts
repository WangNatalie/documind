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

// Track the last page that had terms extracted for each tab
const lastExtractedPage = new Map<number, number>();

// Track pages that have been processed (to avoid re-processing)
const processedPages = new Map<number, Set<number>>(); // tabId -> Set of page numbers

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
          lastExtractedPage.delete(tabId);
          processedPages.delete(tabId);
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

  if (message.type === 'REQUEST_PAGE_TERMS') {
    // Viewer is requesting terms for a specific page (cache miss)
    const { page, docHash } = message.payload;
    const tabId = sender.tab?.id;

    if (tabId) {
      console.log(`[REQUEST_PAGE_TERMS] Viewer requesting terms for page ${page}`);

      // Remove this page from processed set to allow re-processing
      const processedSet = processedPages.get(tabId);
      if (processedSet) {
        processedSet.delete(page);
      }

      // Get the viewer state to extract text
      const state = viewerStates.get(tabId);
      if (state && state.docHash === docHash) {
        // If this is the current page, process it immediately
        if (state.currentPage === page && state.visibleText) {
          processPageTerms(tabId, page, state);
        } else {
          // For other pages, we'd need to request their text
          // For now, just re-trigger state request which will process current page
          chrome.tabs.sendMessage(tabId, { type: 'REQUEST_VIEWER_STATE' }).catch(err => {
            console.error('Failed to request viewer state:', err);
          });
        }
      }
    }
    return false;
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

      // Extract terms only when the current page changes (real page transition)
      if (state.visibleText && state.visibleText.length > 0) {
        const previousPage = lastExtractedPage.get(tabId);
        if (previousPage !== state.currentPage) {
          console.log(`[UPDATE_VIEWER_STATE] Page changed from ${previousPage || 'none'} to ${state.currentPage} for tab ${tabId}`);
          lastExtractedPage.set(tabId, state.currentPage);

          // Initialize processed pages set if needed
          if (!processedPages.has(tabId)) {
            processedPages.set(tabId, new Set());
          }

          // Clean up processed pages cache: only keep current ±2 pages to save memory
          const pagesToKeep = new Set<number>();
          for (let i = Math.max(1, state.currentPage - 2); i <= Math.min(state.totalPages, state.currentPage + 2); i++) {
            pagesToKeep.add(i);
          }

          const processedSet = processedPages.get(tabId)!;
          for (const page of Array.from(processedSet)) {
            if (!pagesToKeep.has(page)) {
              processedSet.delete(page);
            }
          }

          // Process current page first (priority)
          processPageTerms(tabId, state.currentPage, state);

          // Pre-process adjacent pages (prev and next) for caching
          if (state.currentPage > 1) {
            processPageTerms(tabId, state.currentPage - 1, state, true);
          }
          if (state.currentPage < state.totalPages) {
            processPageTerms(tabId, state.currentPage + 1, state, true);
          }
        }
      }
    }
    // Send acknowledgment response
    sendResponse({ success: true });
    return true; // Indicate async response
  }

  if (message.type === 'EXPLAIN_SELECTION') {
    // Handle summarize selection from context menu
    const { text, docHash } = message.payload;
    console.log(`[EXPLAIN_SELECTION] Received request for text: "${text.substring(0, 50)}..."`);

    // Handle async operation properly
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
          console.log('[EXPLAIN_SELECTION] Error checking offscreen context:', err);
        }

        if (!offscreenExists) {
          console.log('[EXPLAIN_SELECTION] Creating offscreen document...');
          await chrome.offscreen.createDocument({
            url: 'offscreen.html',
            reasons: ['DOM_SCRAPING' as chrome.offscreen.Reason],
            justification: 'Generate AI explanation for selected text'
          });
        }

        // Send message to offscreen document to explain the selection
        const response = await chrome.runtime.sendMessage({
          type: 'EXPLAIN_SELECTION_TEXT',
          payload: { text, docHash }
        });

        if (response && response.success && response.summary) {
          console.log('[EXPLAIN_SELECTION] Successfully generated explanation');
          sendResponse({ success: true, summary: response.summary });
        } else {
          console.error('[EXPLAIN_SELECTION] Failed to generate explanation:', response?.error);
          sendResponse({ success: false, error: response?.error || 'Unknown error' });
        }
      } catch (error: any) {
        console.error('[EXPLAIN_SELECTION] Error:', error);
        sendResponse({ success: false, error: error.message || 'Unknown error' });
      }
    })().catch((error) => {
      console.error('[EXPLAIN_SELECTION] Unhandled error:', error);
      sendResponse({ success: false, error: error.message || 'Unknown error' });
    });

    return true; // Indicate async response
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

// Helper function to process terms for a specific page
async function processPageTerms(tabId: number, pageNum: number, state: ViewerState, isAdjacentPage: boolean = false) {
  const pageSet = processedPages.get(tabId);
  if (!pageSet) return;

  // Skip if this page has already been processed
  if (pageSet.has(pageNum)) {
    console.log(`[processPageTerms] Page ${pageNum} already processed for tab ${tabId}, skipping`);
    return;
  }

  // Mark as processed
  pageSet.add(pageNum);

  // For current page, use existing visible text
  // For adjacent pages, we'd need to request their text - for now, we'll skip adjacent if no text
  if (pageNum === state.currentPage && state.visibleText) {
    const priority = isAdjacentPage ? 'adjacent' : 'current';
    console.log(`[processPageTerms] Processing ${priority} page ${pageNum} for tab ${tabId}`);
    await extractTermsFromText(state.visibleText, state.fileName, pageNum, state.docHash);
  } else if (isAdjacentPage) {
    // For adjacent pages, we could request text from the viewer
    // For now, we'll just log and skip
    console.log(`[processPageTerms] Skipping adjacent page ${pageNum} (would need to request text from viewer)`);
  }
}

// Helper function to extract terms using offscreen document
async function extractTermsFromText(passage: string, fileName: string, currentPage: number, docHash: string) {
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
      console.log(`[extractTerms] Successfully extracted ${response.result.terms.length} terms for "${fileName}" page ${currentPage}:`);
      console.log(`  Terms: ${response.result.terms.join(', ')}`);

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
        // Summary
        const termsWithSections = response.results.filter((r: any) => r.tocItem).length;
        const termsWithChunks = response.results.filter((r: any) => r.matchedChunkId).length;
        console.log(`[findSections] Found sections for ${termsWithSections}/${terms.length} terms (${termsWithChunks} with chunk context)`);
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
    // Send message to offscreen document to generate summaries
    const response = await chrome.runtime.sendMessage({
      type: 'SUMMARIZE_TERMS',
      payload: { termsWithSections, docHash }
    });

    if (response.success && response.summaries) {
      console.log(`[summarize] Successfully generated summaries for "${fileName}" page ${currentPage}:`);

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

      // Send summaries to the viewer tab for display
      const viewerTab = Array.from(viewerStates.entries()).find(
        ([_, state]) => state.docHash === docHash
      );

      if (viewerTab) {
        const [tabId] = viewerTab;
        try {
          await chrome.tabs.sendMessage(tabId, {
            type: 'TERM_SUMMARIES_READY',
            payload: { summaries: response.summaries, currentPage }
          });
          console.log(`[summarize] Sent ${response.summaries.length} summaries to tab ${tabId}`);
        } catch (error) {
          console.error(`[summarize] Failed to send summaries to tab ${tabId}:`, error);
        }
      }

    } else {
      console.warn('[summarize] Failed to generate summaries:', response.error);
    }
  } catch (error) {
    console.error('[summarize] Error generating summaries:', error);
  }
}