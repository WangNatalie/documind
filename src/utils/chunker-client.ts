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
 * const response = await requestChunking({
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
export async function requestChunking(
  params: CreateChunkingTaskParams
): Promise<CreateChunkingTaskResponse> {
  console.log('[chunker-client] Sending message with params:', params);
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        type: 'CREATE_CHUNKING_TASK',
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

