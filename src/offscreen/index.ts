// Offscreen document for chunking operations
// This runs in a DOM context where IndexedDB is available

import { processChunkingTaskInOffscreen, processChunkingTaskInOffscreenWithGemini } from "./chunker-offscreen";
import { getAISettings, syncAISettings } from './ai-settings';
import { generateMissingEmbeddings } from './embedder';
import { generateTableOfContents } from './toc-generator';
import { generateChatResponse } from './chatbot';
import { extractTerms, findSectionsForTerms, summarizeTerms, explainSelectedText } from './term-extractor';
import { getChunksByDoc, getTableOfContents } from '../db/index';

console.log("DocuMind offscreen document loaded at", new Date().toISOString());

// Keepalive mechanism to prevent termination during long-running tasks
let keepaliveInterval: number | null = null;

function startKeepalive() {
  if (keepaliveInterval) return;
  console.log("Starting keepalive mechanism");
  keepaliveInterval = window.setInterval(() => {
    console.log("Keepalive ping", new Date().toISOString());
  }, 20000); // Ping every 20 seconds
}

function stopKeepalive() {
  if (keepaliveInterval) {
    console.log("Stopping keepalive mechanism");
    clearInterval(keepaliveInterval);
    keepaliveInterval = null;
  }
}

// Handle messages from the service worker
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // Allow the background/service-worker to push settings into this offscreen
  // document. This is used because some offscreen contexts may not have
  // chrome.storage.local available immediately.
  if (message.type === 'SYNC_AI_SETTINGS') {
    try {
      syncAISettings(message.payload || null);
      console.log('[offscreen/index] SYNC_AI_SETTINGS applied');
      sendResponse({ success: true });
    } catch (e) {
      console.error('[offscreen/index] Failed to apply SYNC_AI_SETTINGS', e);
      sendResponse({ success: false, error: String(e) });
    }
    return true;
  }

  if (message.type === "PROCESS_CHUNKING_TASK") {
    const { taskId, docHash, fileUrl, uploadId } = message.payload;
    console.log(`Received PROCESS_CHUNKING_TASK message for task ${taskId}`);

    // Start keepalive during processing
    startKeepalive();

    // Check settings: if Chunkr is disabled, return failure immediately
    getAISettings().then((settings) => {
      if (!settings.chunkrEnabled) {
        console.log('[offscreen/index] Chunkr processing is disabled by settings');
        sendResponse({ success: false, error: 'Chunkr disabled in settings' });
        return;
      }

      processChunkingTaskInOffscreen({ taskId, docHash, fileUrl, uploadId })
        .then(() => {
          console.log(`Task ${taskId} completed successfully`);
          stopKeepalive();
          sendResponse({ success: true });
        })
        .catch((error: Error) => {
          console.error("Failed to process chunking task in offscreen:", error);
          stopKeepalive();
          sendResponse({ success: false, error: error.message });
        });
    }).catch((err) => {
      console.error('[offscreen/index] Error reading settings, proceeding:', err);
      processChunkingTaskInOffscreen({ taskId, docHash, fileUrl, uploadId })
        .then(() => {
          console.log(`Task ${taskId} completed successfully`);
          stopKeepalive();
          sendResponse({ success: true });
        })
        .catch((error: Error) => {
          console.error("Failed to process chunking task in offscreen:", error);
          stopKeepalive();
          sendResponse({ success: false, error: error.message });
        });
    });


    // Return true to indicate we'll send response asynchronously
    return true;
  }

  if (message.type === "PROCESS_CHUNKING_TASK_GEMINI") {
    const { taskId, docHash, fileUrl, uploadId } = message.payload;
    console.log(
      `Received PROCESS_CHUNKING_TASK_GEMINI message for task ${taskId}`
    );

    // Start keepalive during processing
    startKeepalive();

    // Respect AI settings: if Gemini chunking disabled, return early
    getAISettings().then((settings2) => {
      if (!settings2.gemini?.chunkingEnabled) {
        console.log('[offscreen/index] Gemini chunking is disabled by settings');
        sendResponse({ success: false, error: 'Gemini chunking disabled in settings' });
        return;
      }

      (async () => {
        try {
          await processChunkingTaskInOffscreenWithGemini({ taskId, docHash, fileUrl, uploadId });
          console.log(`Gemini chunking task ${taskId} completed successfully`);
          stopKeepalive();
          sendResponse({ success: true });
        } catch (error: any) {
          console.error("Failed to process Gemini chunking task in offscreen:", error);
          stopKeepalive();
          sendResponse({ success: false, error: error?.message || String(error) });
        }
      })();
    }).catch((err) => {
      console.error('[offscreen/index] Error reading settings, proceeding:', err);
      // Fallback: call the statically imported function directly
      (async () => {
        try {
          await processChunkingTaskInOffscreenWithGemini({ taskId, docHash, fileUrl, uploadId });
          console.log(`Gemini chunking task ${taskId} completed successfully`);
          stopKeepalive();
          sendResponse({ success: true });
        } catch (error: any) {
          console.error("Failed to process Gemini chunking task in offscreen:", error);
          stopKeepalive();
          sendResponse({ success: false, error: error?.message || String(error) });
        }
      })();
    });

    // Return true to indicate we'll send response asynchronously
    return true;
  }

  if (message.type === "VERIFY_CHUNKS_EXIST") {
    const { docHash } = message.payload;
    console.log(`Verifying chunks exist for document ${docHash}`);

    // Import getChunksByDoc dynamically
    (async () => {
      try {
        const chunks = await getChunksByDoc(docHash);
        const exists = chunks.length > 0;
        console.log(`Document ${docHash} has ${chunks.length} chunks (exists: ${exists})`);
        sendResponse({ exists });
      } catch (error: any) {
        console.error('Error verifying chunks:', error);
        sendResponse({ exists: false });
      }
    })();

    // Return true to indicate we'll send response asynchronously
    return true;
  }

  if (message.type === "GENERATE_EMBEDDINGS") {
    const { docHash } = message.payload;
    console.log(`Received GENERATE_EMBEDDINGS request for document ${docHash}`);

    // Start keepalive during processing
    startKeepalive();

    (async () => {
      try {
        const settings = await getAISettings();
        if (!settings.gemini?.embeddingsEnabled) {
          console.log('[offscreen/index] Gemini embeddings generation disabled by settings');
          stopKeepalive();
          sendResponse({ success: true, count: 0 });
          return;
        }

        const count = await generateMissingEmbeddings(docHash);
        console.log(`Generated ${count} embeddings for document ${docHash}`);
        stopKeepalive();
        sendResponse({ success: true, count });
      } catch (error: any) {
        console.error('Error generating embeddings:', error);
        stopKeepalive();
        sendResponse({ success: false, error: error?.message || String(error) });
      }
    })();

    // Return true to indicate we'll send response asynchronously
    return true;
  }

  if (message.type === "PROCESS_TOC_TASK") {
    const { taskId, docHash, fileUrl, uploadId } = message.payload;
    console.log(`Received PROCESS_TOC_TASK message for task ${taskId}`);

    // Start keepalive during processing
    startKeepalive();

    (async () => {
      try {
        const settings = await getAISettings();
        if (!settings.gemini?.tocEnabled) {
          console.log('[offscreen/index] Gemini TOC generation disabled by settings');
          stopKeepalive();
          sendResponse({ success: true });
          return;
        }

        await generateTableOfContents(docHash, fileUrl, uploadId);
        console.log(`TOC task ${taskId} completed successfully`);
        stopKeepalive();
        sendResponse({ success: true });
      } catch (error: any) {
        console.error('Failed to process TOC task in offscreen:', error);
        stopKeepalive();
        sendResponse({ success: false, error: error?.message || String(error) });
      }
    })();

    // Return true to indicate we'll send response asynchronously
    return true;
  }

  if (message.type === "VERIFY_TOC_EXISTS") {
    const { docHash } = message.payload;
    console.log(`Verifying TOC exists for document ${docHash}`);

    // Import getTableOfContents dynamically
    (async () => {
      try {
        const toc = await getTableOfContents(docHash);
        const exists = !!toc;
        console.log(`Document ${docHash} has TOC: ${exists}`);
        sendResponse({ exists });
      } catch (error: any) {
        console.error('Error verifying TOC:', error);
        sendResponse({ exists: false });
      }
    })();

    // Return true to indicate we'll send response asynchronously
    return true;
  }

  if (message.type === "CHAT_QUERY") {
    const { query, docHash } = message.payload;
    console.log(
      `Received CHAT_QUERY request for query: "${query.substring(0, 50)}..."`
    );

    (async () => {
      try {
        const settings = await getAISettings();
        if (!settings.gemini?.chatEnabled) {
          console.log('[offscreen/index] Gemini chat disabled by settings');
          sendResponse({ success: true, result: { response: 'AI chat disabled in settings', sources: [] } });
          return;
        }

        const result = await generateChatResponse(query, docHash);
        console.log(`Generated chat response (${result.response.length} chars) with ${result.sources.length} sources`);
        sendResponse({ success: true, result });
      } catch (error: any) {
        console.error('Error generating chat response:', error);
      }
    })();

    // Return true to indicate we'll send response asynchronously
    return true;
  }

  if (message.type === "EXTRACT_TERMS") {
    const { passage } = message.payload;
    console.log(
      `Received EXTRACT_TERMS request for passage (${passage.length} chars)`
    );

    (async () => {
      try {
        const settings = await getAISettings();
        if (!settings.gemini?.termsEnabled) {
          console.log('[offscreen/index] Gemini term extraction disabled by settings');
          sendResponse({ success: true, result: { terms: [], passage: passage.substring(0,500), timestamp: Date.now() } });
          return;
        }

        const result = await extractTerms(passage);
        console.log(`Extracted ${result.terms.length} terms`);
        sendResponse({ success: true, result });
      } catch (error: any) {
        console.error('Error extracting terms:', error);
        sendResponse({ success: false, error: error?.message || String(error) });
      }
    })();

    // Return true to indicate we'll send response asynchronously
    return true;
  }

  if (message.type === "FIND_SECTIONS_FOR_TERMS") {
    const { terms, docHash } = message.payload;
    console.log(
      `Received FIND_SECTIONS_FOR_TERMS request for ${terms.length} terms`
    );

    (async () => {
      try {
        const settings = await getAISettings();
        if (!settings.gemini?.termsEnabled) {
          console.log('[offscreen/index] Gemini term-section matching disabled by settings');
          sendResponse({ success: true, results: terms.map((t: string) => ({ term: t, tocItem: null })) });
          return;
        }

        const results = await findSectionsForTerms(terms, docHash);
        console.log(`Found sections for ${results.filter((r) => r.tocItem).length}/${results.length} terms`);
        sendResponse({ success: true, results });
      } catch (error: any) {
        console.error("Error finding sections for terms:", error);
        sendResponse({ success: false, error: error?.message || String(error) });
      }
    })();

    // Return true to indicate we'll send response asynchronously
    return true;
  }

  if (message.type === "SUMMARIZE_TERMS") {
    const { termsWithSections, docHash } = message.payload;
    console.log(
      `Received SUMMARIZE_TERMS request for ${termsWithSections.length} terms`
    );

    (async () => {
      try {
        const settings = await getAISettings();
        if (!settings.gemini?.termsEnabled) {
          console.log('[offscreen/index] Gemini term summarization disabled by settings');
          const summaries = termsWithSections.map((t: any) => ({ term: t.term, definition: 'Disabled', explanation1: '', explanation2: '', explanation3: '', tocItem: t.tocItem, matchedChunkId: t.matchedChunkId }));
          sendResponse({ success: true, summaries });
          return;
        }

        const summaries = await summarizeTerms(termsWithSections, docHash);
        console.log(`Generated ${summaries.length} summaries`);
        sendResponse({ success: true, summaries });
      } catch (error: any) {
        console.error("Error summarizing terms:", error);
        sendResponse({ success: false, error: error?.message || String(error) });
      }
    })();

    // Return true to indicate we'll send response asynchronously
    return true;
  }

  if (message.type === "EXPLAIN_SELECTION_TEXT") {
    const { text, docHash } = message.payload;
    console.log(
      `Received EXPLAIN_SELECTION_TEXT request for text: "${text.substring(0, 50)}..."`
    );

    (async () => {
      try {
        const settings = await getAISettings();
        if (!settings.gemini?.termsEnabled) {
          console.log('[offscreen/index] Gemini explain selection disabled by settings');
          sendResponse({ success: true, summary: { term: text, definition: 'Disabled', explanation1: '', explanation2: '', explanation3: '', tocItem: null } });
          return;
        }

        const summary = await explainSelectedText(text, docHash);
        console.log(`Generated summary for selected text`);
        sendResponse({ success: true, summary });
      } catch (error: any) {
        console.error("Error summarizing selected text:", error);
        sendResponse({ success: false, error: error?.message || String(error) });
      }
    })();

    // Return true to indicate we'll send response asynchronously
    return true;
  }
});
