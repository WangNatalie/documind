# Document Chunking with Chunkr AI

This extension includes background processing capabilities for chunking PDF documents using [Chunkr AI](https://chunkr.ai/).

## Setup

### 1. Set Your API Key

Before using the chunking feature, you need to set your Chunkr AI API key. Open `src/background/chunker.ts` and replace `'your_api_key'` with your actual API key:

```typescript
const CHUNKR_API_KEY = 'your_actual_api_key_here';
```

Alternatively, you can set it via environment variables during build time.

### 2. How It Works

The chunking system consists of three main components:

1. **Database Schema** (`src/db/index.ts`): Stores chunks and chunking tasks in IndexedDB
2. **Background Worker** (`src/background/chunker.ts`): Processes documents using Chunkr AI
3. **Client API** (`src/utils/chunker-client.ts`): Helper to trigger chunking from UI components

## Usage

### Triggering a Chunking Task

From any component in your extension (viewer, popup, etc.), you can request document chunking:

```typescript
import { requestChunking } from '../utils/chunker-client';

// Trigger chunking for a PDF
const response = await requestChunking({
  docHash: 'document-hash-123',
  fileUrl: 'https://example.com/document.pdf'
});

if (response.success) {
  console.log('Chunking task created:', response.taskId);
} else {
  console.error('Failed to create task:', response.error);
}
```

### Retrieving Chunks

Once chunks are processed, you can retrieve them from IndexedDB:

```typescript
import { getChunksByDoc } from '../db/index';

// Get all chunks for a document
const chunks = await getChunksByDoc('document-hash-123');

chunks.forEach(chunk => {
  console.log('Chunk', chunk.chunkIndex, ':', chunk.content);
  console.log('Page:', chunk.page);
  console.log('Bounding box:', chunk.bbox);
});
```

### Monitoring Task Status

Check the status of a chunking task:

```typescript
import { getChunkTask, getChunkTaskByDoc } from '../db/index';

// Get task by ID
const task = await getChunkTask('task-id-123');

// Or get task by document hash
const taskByDoc = await getChunkTaskByDoc('document-hash-123');

console.log('Task status:', task.status); // 'pending' | 'processing' | 'completed' | 'failed'
```

## Data Structure

### ChunkRecord

Each chunk is stored with the following structure:

```typescript
{
  id: string;              // Unique chunk ID
  docHash: string;         // Document identifier
  chunkIndex: number;      // Position in the document
  content: string;         // Chunk text content
  page?: number;           // Page number (if available)
  bbox?: {                 // Bounding box coordinates
    x: number;
    y: number;
    width: number;
    height: number;
  };
  metadata?: {             // Additional Chunkr AI metadata
    type: string;
    confidence: number;
    // ... other fields
  };
  createdAt: number;       // Timestamp
}
```

### ChunkTaskRecord

Task status tracking:

```typescript
{
  taskId: string;          // Unique task ID
  docHash: string;         // Document identifier
  status: 'pending' | 'processing' | 'completed' | 'failed';
  fileUrl?: string;        // Source PDF URL
  error?: string;          // Error message (if failed)
  createdAt: number;       // Created timestamp
  updatedAt: number;       // Last updated timestamp
}
```

## Background Processing

- Tasks are processed automatically in the background service worker
- Pending tasks are resumed when the extension restarts
- Chunkr AI task polling happens every 2 seconds with a 60-attempt limit (2 minutes)
- All chunks are stored in IndexedDB for offline access

## Example Integration

Here's an example of integrating chunking into your viewer:

```typescript
// In src/viewer/App.tsx or similar
import { requestChunking } from '../utils/chunker-client';
import { getChunksByDoc, getChunkTaskByDoc } from '../db/index';
import { useEffect, useState } from 'react';

function PDFViewer({ docHash, pdfUrl }: Props) {
  const [chunks, setChunks] = useState([]);
  const [isChunking, setIsChunking] = useState(false);

  // Start chunking on mount
  useEffect(() => {
    const startChunking = async () => {
      // Check if already chunked
      const existingTask = await getChunkTaskByDoc(docHash);
      
      if (!existingTask || existingTask.status === 'failed') {
        setIsChunking(true);
        await requestChunking({ docHash, fileUrl: pdfUrl });
      }
    };

    startChunking();
  }, [docHash, pdfUrl]);

  // Load chunks when available
  useEffect(() => {
    const loadChunks = async () => {
      const task = await getChunkTaskByDoc(docHash);
      
      if (task?.status === 'completed') {
        const docChunks = await getChunksByDoc(docHash);
        setChunks(docChunks);
        setIsChunking(false);
      }
    };

    const interval = setInterval(loadChunks, 5000); // Poll every 5 seconds
    loadChunks();

    return () => clearInterval(interval);
  }, [docHash]);

  return (
    <div>
      {isChunking && <div>Processing document chunks...</div>}
      {chunks.length > 0 && <div>{chunks.length} chunks loaded</div>}
      {/* Your PDF viewer UI */}
    </div>
  );
}
```

## Notes

- Chunking happens asynchronously and doesn't block the UI
- The Chunkr AI API key should be kept secure
- Consider implementing error handling and retry logic for production use
- Monitor IndexedDB storage usage as chunks can take significant space

