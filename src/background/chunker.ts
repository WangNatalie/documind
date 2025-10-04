import { nanoid } from 'nanoid';

// Import types and functions we need from db (but don't use IndexedDB here)
// IndexedDB operations will be delegated to the offscreen document
interface ChunkTaskRecord {
  taskId: string;
  docHash: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  fileUrl?: string;
  uploadId?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ChunkrTaskOptions {
  docHash: string;
  fileUrl?: string;
  uploadId?: string;
}

// Chrome storage keys
const CHUNK_TASKS_KEY = 'chunkTasks';

// Helper to get tasks from chrome.storage
async function getTasksFromStorage(): Promise<Record<string, ChunkTaskRecord>> {
  const result = await chrome.storage.local.get(CHUNK_TASKS_KEY);
  return result[CHUNK_TASKS_KEY] || {};
}

// Helper to save tasks to chrome.storage
async function saveTasksToStorage(tasks: Record<string, ChunkTaskRecord>): Promise<void> {
  await chrome.storage.local.set({ [CHUNK_TASKS_KEY]: tasks });
}

// Helper to get task by docHash
async function getTaskByDocHash(docHash: string): Promise<ChunkTaskRecord | undefined> {
  const tasks = await getTasksFromStorage();
  return Object.values(tasks).find(task => task.docHash === docHash);
}

// Helper to get task by taskId
async function getTaskById(taskId: string): Promise<ChunkTaskRecord | undefined> {
  const tasks = await getTasksFromStorage();
  return tasks[taskId];
}

// Helper to save a single task
async function saveTask(task: ChunkTaskRecord): Promise<void> {
  const tasks = await getTasksFromStorage();
  tasks[task.taskId] = task;
  await saveTasksToStorage(tasks);
}

// Helper to ensure offscreen document exists
async function ensureOffscreenDocument(): Promise<void> {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType],
  });

  if (existingContexts.length > 0) {
    return; // Offscreen document already exists
  }

  // Create offscreen document
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['DOM_SCRAPING' as chrome.offscreen.Reason], // We need DOM for IndexedDB
    justification: 'Process PDF chunking with IndexedDB access',
  });
  
  console.log('Created offscreen document for chunking');
}

// Helper to verify chunks exist in IndexedDB
async function verifyChunksExist(docHash: string): Promise<boolean> {
  try {
    await ensureOffscreenDocument();
    
    const response = await chrome.runtime.sendMessage({
      type: 'VERIFY_CHUNKS_EXIST',
      payload: { docHash },
    });
    
    return response.exists || false;
  } catch (error) {
    console.error('Error verifying chunks:', error);
    return false;
  }
}

/**
 * Create a new chunking task for a PDF document
 */
export async function createChunkingTask(options: ChunkrTaskOptions): Promise<string> {
  console.log('[background/chunker] createChunkingTask called with:', options);
  const { docHash, fileUrl, uploadId } = options;
  console.log('[background/chunker] Extracted:', { docHash, fileUrl, uploadId });

  // Check if task already exists for this document
  const existingTask = await getTaskByDocHash(docHash);
  
  if (existingTask) {
    // If task is pending or processing, don't create a duplicate
    if (existingTask.status === 'pending' || existingTask.status === 'processing') {
      console.log(`Chunking task already in progress for document ${docHash} (status: ${existingTask.status})`);
      return existingTask.taskId;
    }
    // If task is completed, verify chunks exist in IndexedDB (via offscreen check)
    else if (existingTask.status === 'completed') {
      console.log(`Task marked as completed for document ${docHash}, verifying chunks exist...`);
      const chunksExist = await verifyChunksExist(docHash);
      if (chunksExist) {
        console.log(`Document ${docHash} already chunked with verified chunks`);
        return existingTask.taskId;
      } else {
        console.warn(`Task marked completed but no chunks found. Re-chunking document ${docHash}`);
        // Clean up the invalid task from storage
        const tasks = await getTasksFromStorage();
        delete tasks[existingTask.taskId];
        await saveTasksToStorage(tasks);
        // Fall through to create new task
      }
    }
    // If task failed, we'll create a new one (fall through)
    else if (existingTask.status === 'failed') {
      console.log(`Previous chunking task failed. Creating new task for document ${docHash}`);
      // Clean up the failed task from storage
      const tasks = await getTasksFromStorage();
      delete tasks[existingTask.taskId];
      await saveTasksToStorage(tasks);
    }
  }

  // Create task record
  const taskId = nanoid();
  const task: ChunkTaskRecord = {
    taskId,
    docHash,
    status: 'pending',
    fileUrl,
    uploadId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  console.log('[background/chunker] Created task object:', task);
  await saveTask(task);
  console.log(`Created chunking task ${taskId} for document ${docHash}`);

  // Process the task in offscreen document
  processChunkingTask(taskId).catch((error) => {
    console.error(`Failed to process chunking task ${taskId}:`, error);
  });

  return taskId;
}

/**
 * Process a chunking task by delegating to offscreen document
 */
async function processChunkingTask(taskId: string): Promise<void> {
  try {
    // Get task from storage
    const task = await getTaskById(taskId);
    if (!task) {
      console.error(`Task ${taskId} not found`);
      return;
    }

    // Ensure offscreen document exists
    await ensureOffscreenDocument();

    // Send message to offscreen document with full task data
    const payload = { 
      taskId: task.taskId,
      docHash: task.docHash,
      fileUrl: task.fileUrl,
      uploadId: task.uploadId,
    };
    console.log('[background/chunker] Sending to offscreen with payload:', payload);
    const response = await chrome.runtime.sendMessage({
      type: 'PROCESS_CHUNKING_TASK',
      payload: payload,
    });

    if (!response.success) {
      throw new Error(response.error || 'Unknown error processing task');
    }
    
    // Update task status to completed in storage
    await updateTaskStatus(taskId, 'completed');
  } catch (error) {
    console.error(`Error delegating chunking task ${taskId}:`, error);
    // Update task status to failed
    await updateTaskStatus(taskId, 'failed', error instanceof Error ? error.message : String(error));
  }
}

// Helper to update task status
async function updateTaskStatus(taskId: string, status: 'completed' | 'failed', error?: string): Promise<void> {
  const task = await getTaskById(taskId);
  if (task) {
    task.status = status;
    if (error) {
      task.error = error;
    }
    task.updatedAt = Date.now();
    console.log(`[background/chunker] Task completed at time ${task.updatedAt} with status: ${status}.`);
    await saveTask(task);
  }
}

/**
 * Process all pending chunking tasks
 * This can be called on extension startup to resume interrupted tasks
 */
export async function processPendingTasks(): Promise<void> {
  const tasks = await getTasksFromStorage();
  const pendingTasks = Object.values(tasks).filter(
    task => task.status === 'pending' || task.status === 'processing'
  );
  
  console.log(`Found ${pendingTasks.length} pending chunking tasks`);

  for (const task of pendingTasks) {
    processChunkingTask(task.taskId).catch((error) => {
      console.error(`Failed to process pending task ${task.taskId}:`, error);
    });
  }
}


/**
 * Create a new Gemini-based chunking task for a PDF document
 * This is a new method that uses Gemini instead of Chunkr while maintaining backwards compatibility
 */
export async function createGeminiChunkingTask(options: ChunkrTaskOptions): Promise<string> {
  console.log('[background/chunker] createGeminiChunkingTask called with:', options);
  const { docHash, fileUrl, uploadId } = options;

  // Check if task already exists for this document
  const existingTask = await getTaskByDocHash(docHash);
  
  if (existingTask) {
    // If task is pending or processing, don't create a duplicate
    if (existingTask.status === 'pending' || existingTask.status === 'processing') {
      console.log(`Chunking task already in progress for document ${docHash} (status: ${existingTask.status})`);
      return existingTask.taskId;
    }
    // If task is completed, verify chunks exist in IndexedDB
    else if (existingTask.status === 'completed') {
      console.log(`Task marked as completed for document ${docHash}, verifying chunks exist...`);
      const chunksExist = await verifyChunksExist(docHash);
      if (chunksExist) {
        console.log(`Document ${docHash} already chunked with verified chunks`);
        return existingTask.taskId;
      } else {
        console.warn(`Task marked completed but no chunks found. Re-chunking document ${docHash}`);
        // Clean up the invalid task from storage
        const tasks = await getTasksFromStorage();
        delete tasks[existingTask.taskId];
        await saveTasksToStorage(tasks);
      }
    }
    // If task failed, we'll create a new one
    else if (existingTask.status === 'failed') {
      console.log(`Previous chunking task failed. Creating new Gemini task for document ${docHash}`);
      const tasks = await getTasksFromStorage();
      delete tasks[existingTask.taskId];
      await saveTasksToStorage(tasks);
    }
  }

  // Create task record
  const taskId = nanoid();
  const task: ChunkTaskRecord = {
    taskId,
    docHash,
    status: 'pending',
    fileUrl,
    uploadId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await saveTask(task);
  console.log(`Created Gemini chunking task ${taskId} for document ${docHash}`);

  // Process the task in offscreen document (using Gemini)
  processGeminiChunkingTask(taskId).catch((error) => {
    console.error(`Failed to process Gemini chunking task ${taskId}:`, error);
  });

  return taskId;
}

/**
 * Process a Gemini chunking task by delegating to offscreen document
 */
async function processGeminiChunkingTask(taskId: string): Promise<void> {
  try {
    // Get task from storage
    const task = await getTaskById(taskId);
    if (!task) {
      console.error(`Task ${taskId} not found`);
      return;
    }

    // Ensure offscreen document exists
    await ensureOffscreenDocument();

    // Send message to offscreen document for Gemini processing
    const payload = { 
      taskId: task.taskId,
      docHash: task.docHash,
      fileUrl: task.fileUrl,
      uploadId: task.uploadId,
    };
    console.log('[background/chunker] Sending Gemini chunking to offscreen with payload:', payload);
    const response = await chrome.runtime.sendMessage({
      type: 'PROCESS_CHUNKING_TASK_GEMINI',
      payload: payload,
    });

    if (!response.success) {
      throw new Error(response.error || 'Unknown error processing Gemini task');
    }
    
    // Update task status to completed in storage
    await updateTaskStatus(taskId, 'completed');
  } catch (error) {
    console.error(`Error delegating Gemini chunking task ${taskId}:`, error);
    // Update task status to failed
    await updateTaskStatus(taskId, 'failed', error instanceof Error ? error.message : String(error));
  }
}
