import { nanoid } from 'nanoid';

// TOC task record (stored in chrome.storage)
interface TOCTaskRecord {
  taskId: string;
  docHash: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  fileUrl?: string;
  uploadId?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface TOCTaskOptions {
  docHash: string;
  fileUrl?: string;
  uploadId?: string;
}

// Chrome storage keys
const TOC_TASKS_KEY = 'tocTasks';

// Helper to get tasks from chrome.storage
async function getTasksFromStorage(): Promise<Record<string, TOCTaskRecord>> {
  const result = await chrome.storage.local.get(TOC_TASKS_KEY);
  return result[TOC_TASKS_KEY] || {};
}

// Helper to save tasks to chrome.storage
async function saveTasksToStorage(tasks: Record<string, TOCTaskRecord>): Promise<void> {
  await chrome.storage.local.set({ [TOC_TASKS_KEY]: tasks });
}

// Helper to get task by docHash
async function getTaskByDocHash(docHash: string): Promise<TOCTaskRecord | undefined> {
  const tasks = await getTasksFromStorage();
  return Object.values(tasks).find(task => task.docHash === docHash);
}

// Helper to get task by taskId
async function getTaskById(taskId: string): Promise<TOCTaskRecord | undefined> {
  const tasks = await getTasksFromStorage();
  return tasks[taskId];
}

// Helper to save a single task
async function saveTask(task: TOCTaskRecord): Promise<void> {
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
    reasons: ['DOM_SCRAPING' as chrome.offscreen.Reason], // We need DOM for IndexedDB and pdf.js
    justification: 'Generate table of contents with IndexedDB and pdf.js access',
  });
  
  console.log('[TOC] Created offscreen document for TOC generation');
}

// Helper to verify TOC exists in IndexedDB
async function verifyTOCExists(docHash: string): Promise<boolean> {
  try {
    await ensureOffscreenDocument();
    
    const response = await chrome.runtime.sendMessage({
      type: 'VERIFY_TOC_EXISTS',
      payload: { docHash },
    });
    
    return response.exists || false;
  } catch (error) {
    console.error('[TOC] Error verifying TOC:', error);
    return false;
  }
}

/**
 * Create a new TOC generation task for a PDF document
 */
export async function createTOCTask(options: TOCTaskOptions): Promise<string> {
  console.log('[background/toc] createTOCTask called with:', options);
  const { docHash, fileUrl, uploadId } = options;

  // Check if task already exists for this document
  const existingTask = await getTaskByDocHash(docHash);
  
  if (existingTask) {
    // If task is pending or processing, don't create a duplicate
    if (existingTask.status === 'pending' || existingTask.status === 'processing') {
      console.log(`[TOC] Task already in progress for document ${docHash} (status: ${existingTask.status})`);
      return existingTask.taskId;
    }
    // If task is completed, verify TOC exists in IndexedDB
    else if (existingTask.status === 'completed') {
      console.log(`[TOC] Task marked as completed for document ${docHash}, verifying TOC exists...`);
      const tocExists = await verifyTOCExists(docHash);
      if (tocExists) {
        console.log(`[TOC] Document ${docHash} already has TOC`);
        return existingTask.taskId;
      } else {
        console.warn(`[TOC] Task marked completed but no TOC found. Re-generating for document ${docHash}`);
        // Clean up the invalid task from storage
        const tasks = await getTasksFromStorage();
        delete tasks[existingTask.taskId];
        await saveTasksToStorage(tasks);
        // Fall through to create new task
      }
    }
    // If task failed, we'll create a new one (fall through)
    else if (existingTask.status === 'failed') {
      console.log(`[TOC] Previous task failed. Creating new task for document ${docHash}`);
      // Clean up the failed task from storage
      const tasks = await getTasksFromStorage();
      delete tasks[existingTask.taskId];
      await saveTasksToStorage(tasks);
    }
  }

  // Create task record
  const taskId = nanoid();
  const task: TOCTaskRecord = {
    taskId,
    docHash,
    status: 'pending',
    fileUrl,
    uploadId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  console.log('[background/toc] Created task object:', task);
  await saveTask(task);
  console.log(`[TOC] Created TOC task ${taskId} for document ${docHash}`);

  // Process the task in offscreen document
  processTOCTask(taskId).catch((error) => {
    console.error(`[TOC] Failed to process TOC task ${taskId}:`, error);
  });

  return taskId;
}

/**
 * Process a TOC task by delegating to offscreen document
 */
async function processTOCTask(taskId: string): Promise<void> {
  try {
    // Get task from storage
    const task = await getTaskById(taskId);
    if (!task) {
      console.error(`[TOC] Task ${taskId} not found`);
      return;
    }

    // Update status to processing
    task.status = 'processing';
    task.updatedAt = Date.now();
    await saveTask(task);

    // Ensure offscreen document exists
    await ensureOffscreenDocument();

    // Send message to offscreen document with full task data
    const payload = { 
      taskId: task.taskId,
      docHash: task.docHash,
      fileUrl: task.fileUrl,
      uploadId: task.uploadId,
    };
    console.log('[background/toc] Sending to offscreen with payload:', payload);
    const response = await chrome.runtime.sendMessage({
      type: 'PROCESS_TOC_TASK',
      payload: payload,
    });

    if (!response.success) {
      throw new Error(response.error || 'Unknown error processing TOC task');
    }
    
    // Update task status to completed in storage
    await updateTaskStatus(taskId, 'completed');
  } catch (error) {
    console.error(`[TOC] Error delegating TOC task ${taskId}:`, error);
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
    console.log(`[background/toc] Task completed at time ${task.updatedAt} with status: ${status}.`);
    await saveTask(task);
  }
}

/**
 * Process all pending TOC tasks
 * This can be called on extension startup to resume interrupted tasks
 */
export async function processPendingTOCTasks(): Promise<void> {
  const tasks = await getTasksFromStorage();
  const pendingTasks = Object.values(tasks).filter(
    task => task.status === 'pending' || task.status === 'processing'
  );
  
  console.log(`[TOC] Found ${pendingTasks.length} pending TOC tasks`);

  for (const task of pendingTasks) {
    processTOCTask(task.taskId).catch((error) => {
      console.error(`[TOC] Failed to process pending task ${task.taskId}:`, error);
    });
  }
}

