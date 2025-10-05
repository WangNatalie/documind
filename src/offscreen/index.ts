// Offscreen document for chunking operations
// This runs in a DOM context where IndexedDB is available

import { processChunkingTaskInOffscreen } from './chunker-offscreen';


console.log('DocuMind offscreen document loaded at', new Date().toISOString());

// Keepalive mechanism to prevent termination during long-running tasks
let keepaliveInterval: number | null = null;

function startKeepalive() {
  if (keepaliveInterval) return;
  console.log('Starting keepalive mechanism');
  keepaliveInterval = window.setInterval(() => {
    console.log('Keepalive ping', new Date().toISOString());
  }, 20000); // Ping every 20 seconds
}

function stopKeepalive() {
  if (keepaliveInterval) {
    console.log('Stopping keepalive mechanism');
    clearInterval(keepaliveInterval);
    keepaliveInterval = null;
  }
}

// Handle messages from the service worker
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'PROCESS_CHUNKING_TASK') {
    const { taskId, docHash, fileUrl, uploadId } = message.payload;
    console.log(`Received PROCESS_CHUNKING_TASK message for task ${taskId}`);

    // Start keepalive during processing
    startKeepalive();

    processChunkingTaskInOffscreen({ taskId, docHash, fileUrl, uploadId })
      .then(() => {
        console.log(`Task ${taskId} completed successfully`);
        stopKeepalive();
        sendResponse({ success: true });
      })
      .catch((error: Error) => {
        console.error('Failed to process chunking task in offscreen:', error);
        stopKeepalive();
        sendResponse({ success: false, error: error.message });
      });

    // Return true to indicate we'll send response asynchronously
    return true;
  }

  if (message.type === 'PROCESS_CHUNKING_TASK_GEMINI') {
    const { taskId, docHash, fileUrl, uploadId } = message.payload;
    console.log(`Received PROCESS_CHUNKING_TASK_GEMINI message for task ${taskId}`);

    // Start keepalive during processing
    startKeepalive();

    import('./chunker-offscreen.js').then(async (chunker) => {
      await chunker.processChunkingTaskInOffscreenWithGemini({ taskId, docHash, fileUrl, uploadId });
      console.log(`Gemini chunking task ${taskId} completed successfully`);
      stopKeepalive();
      sendResponse({ success: true });
    }).catch((error: Error) => {
      console.error('Failed to process Gemini chunking task in offscreen:', error);
      stopKeepalive();
      sendResponse({ success: false, error: error.message });
    });

    // Return true to indicate we'll send response asynchronously
    return true;
  }

  if (message.type === 'VERIFY_CHUNKS_EXIST') {
    const { docHash } = message.payload;
    console.log(`Verifying chunks exist for document ${docHash}`);

    // Import getChunksByDoc dynamically
    import('../db/index.js').then(async (db) => {
      const chunks = await db.getChunksByDoc(docHash);
      const exists = chunks.length > 0;
      console.log(`Document ${docHash} has ${chunks.length} chunks (exists: ${exists})`);
      sendResponse({ exists });
    }).catch((error: Error) => {
      console.error('Error verifying chunks:', error);
      sendResponse({ exists: false });
    });

    // Return true to indicate we'll send response asynchronously
    return true;
  }

  if (message.type === 'GENERATE_EMBEDDINGS') {
    const { docHash } = message.payload;
    console.log(`Received GENERATE_EMBEDDINGS request for document ${docHash}`);

    // Start keepalive during processing
    startKeepalive();

    import('./embedder.js').then(async (embedder) => {
      const count = await embedder.generateMissingEmbeddings(docHash);
      console.log(`Generated ${count} embeddings for document ${docHash}`);
      stopKeepalive();
      sendResponse({ success: true, count });
    }).catch((error: Error) => {
      console.error('Error generating embeddings:', error);
      stopKeepalive();
      sendResponse({ success: false, error: error.message });
    });

    // Return true to indicate we'll send response asynchronously
    return true;
  }

  if (message.type === 'PROCESS_TOC_TASK') {
    const { taskId, docHash, fileUrl, uploadId } = message.payload;
    console.log(`Received PROCESS_TOC_TASK message for task ${taskId}`);

    // Start keepalive during processing
    startKeepalive();

    import('./toc-generator.js').then(async (toc) => {
      await toc.generateTableOfContents(docHash, fileUrl, uploadId);
      console.log(`TOC task ${taskId} completed successfully`);
      stopKeepalive();
      sendResponse({ success: true });
    }).catch((error: Error) => {
      console.error('Failed to process TOC task in offscreen:', error);
      stopKeepalive();
      sendResponse({ success: false, error: error.message });
    });

    // Return true to indicate we'll send response asynchronously
    return true;
  }

  if (message.type === 'VERIFY_TOC_EXISTS') {
    const { docHash } = message.payload;
    console.log(`Verifying TOC exists for document ${docHash}`);

    // Import getTableOfContents dynamically
    import('../db/index.js').then(async (db) => {
      const toc = await db.getTableOfContents(docHash);
      const exists = !!toc;
      console.log(`Document ${docHash} has TOC: ${exists}`);
      sendResponse({ exists });
    }).catch((error: Error) => {
      console.error('Error verifying TOC:', error);
      sendResponse({ exists: false });
    });

    // Return true to indicate we'll send response asynchronously
    return true;
  }
  
  if (message.type === 'CHAT_QUERY') {
    const { query, docHash } = message.payload;
    console.log(`Received CHAT_QUERY request for query: "${query.substring(0, 50)}..."`);
    
    import('./chatbot.js').then(async (chatbot) => {
      const result = await chatbot.generateChatResponse(query, docHash);
      console.log(`Generated chat response (${result.response.length} chars) with ${result.sources.length} sources`);
      sendResponse({ success: true, result });
    }).catch((error: Error) => {
      console.error('Error generating chat response:', error);
      sendResponse({ success: false, error: error.message });
    });
    
    // Return true to indicate we'll send response asynchronously
    return true;
  }
});

