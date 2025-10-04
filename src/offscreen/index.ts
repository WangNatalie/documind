// Offscreen document for chunking operations
// This runs in a DOM context where IndexedDB is available
import { processChunkingTaskInOffscreen } from './chunker-offscreen.js';

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
});

