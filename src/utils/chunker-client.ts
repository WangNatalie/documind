/**
 * Client-side utilities for interacting with the background chunking service
 */

export interface CreateChunkingTaskParams {
  docHash: string;
  fileUrl?: string;
  uploadId?: string;
}

export interface CreateChunkingTaskResponse {
  success: boolean;
  taskId?: string;
  error?: string;
}

/**
 * Request the background service to create a chunking task for a document
 * 
 * @param params - Document hash and file URL
 * @returns Promise with task ID or error
 * 
 * @example
 * ```typescript
 * const response = await requestChunkrChunking({
 *   docHash: 'abc123',
 *   fileUrl: 'https://example.com/document.pdf'
 * });
 * 
 * if (response.success) {
 *   console.log('Chunking task created:', response.taskId);
 * } else {
 *   console.error('Failed to create task:', response.error);
 * }
 * ```
 */
export async function requestChunkrChunking(
  params: CreateChunkingTaskParams
): Promise<CreateChunkingTaskResponse> {
  console.log('[chunker-client] Sending message with params:', params);
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        type: 'CREATE_CHUNKING_TASK_CHUNKR',
        payload: params,
      },
      (response: CreateChunkingTaskResponse) => {
        resolve(response);
      }
    );
  });
}

/**
 * Request embedding generation for a document's chunks
 * This will only generate embeddings for chunks that don't have them yet
 * 
 * @param docHash - Document hash identifier
 * @returns Promise with count of embeddings generated or error
 * 
 * @example
 * ```typescript
 * const response = await requestEmbeddings('abc123');
 * 
 * if (response.success) {
 *   console.log(`Generated ${response.count} new embeddings`);
 * } else {
 *   console.error('Failed to generate embeddings:', response.error);
 * }
 * ```
 */
export async function requestEmbeddings(docHash: string): Promise<{ success: boolean; count?: number; error?: string }> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        type: 'GENERATE_EMBEDDINGS',
        payload: { docHash },
      },
      (response: { success: boolean; count?: number; error?: string }) => {
        resolve(response);
      }
    );
  });
}

/**
 * Request table of contents generation for a document
 * This will generate TOC from PDF outline or AI if it doesn't exist yet
 * 
 * @param params - Document hash and file URL/uploadId
 * @returns Promise with task ID or error
 * 
 * @example
 * ```typescript
 * const response = await requestTOC({
 *   docHash: 'abc123',
 *   fileUrl: 'https://example.com/document.pdf'
 * });
 * 
 * if (response.success) {
 *   console.log('TOC generation task created:', response.taskId);
 * } else {
 *   console.error('Failed to create TOC task:', response.error);
 * }
 * ```
 */
export async function requestTOC(
  params: CreateChunkingTaskParams
): Promise<CreateChunkingTaskResponse> {
  console.log('[chunker-client] Sending TOC request with params:', params);
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        type: 'CREATE_TOC_TASK',
        payload: params,
      },
      (response: CreateChunkingTaskResponse) => {
        resolve(response);
      }
    );
  });
}


/**
 * Request Gemini-based chunking for a document
 * This is a new method that uses Gemini AI instead of Chunkr
 * 
 * @param params - Document hash and file URL/uploadId
 * @returns Promise with task ID or error
 * 
 * @example
 * ```typescript
 * const response = await requestGeminiChunking({
 *   docHash: 'abc123',
 *   fileUrl: 'https://example.com/document.pdf'
 * });
 * 
 * if (response.success) {
 *   console.log('Gemini chunking task created:', response.taskId);
 * } else {
 *   console.error('Failed to create task:', response.error);
 * }
 * ```
 */
export async function requestGeminiChunking(
  params: CreateChunkingTaskParams
): Promise<CreateChunkingTaskResponse> {
  console.log('[chunker-client] Sending Gemini chunking message with params:', params);
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        type: 'CREATE_CHUNKING_TASK_GEMINI',
        payload: params,
      },
      (response: CreateChunkingTaskResponse) => {
        resolve(response);
      }
    );
  });
}
