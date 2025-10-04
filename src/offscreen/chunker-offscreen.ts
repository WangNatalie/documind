// Chunking operations that run in offscreen document context
import ChunkrAI from 'chunkr-ai';
import {
  ChunkRecord,
  putChunk,
  putChunkTask,
  updateChunkTask,
} from '../db/index';

const CHUNKR_API_KEY = ''; // CHUNKR_API_KEY HERE
const chunkr = new ChunkrAI({ apiKey: CHUNKR_API_KEY });

interface ChunkingTaskData {
  taskId: string;
  docHash: string;
  fileUrl: string;
}

/**
 * Process a chunking task using Chunkr AI (runs in offscreen document)
 */
export async function processChunkingTaskInOffscreen(taskData: ChunkingTaskData): Promise<void> {
  const { taskId, docHash, fileUrl } = taskData;
  
  try {
    if (!fileUrl) {
      throw new Error('File URL is required');
    }

    // Store task record in IndexedDB
    await putChunkTask({
      taskId,
      docHash,
      status: 'processing',
      fileUrl,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    console.log(`Processing chunking task ${taskId} for file: ${fileUrl}`);

    // Call Chunkr AI to parse the document
    console.log(`Calling Chunkr AI to create parsing task...`);
    const task = await chunkr.tasks.parse.create({
      file: fileUrl,
    });

    console.log(`Chunkr AI task created with ID: ${task.task_id}`, task);

    // Wait for the task to complete (poll for status)
    console.log(`Starting to poll Chunkr AI task...`);
    const result = await pollChunkrTask(task.task_id);
    console.log(`Polling completed!`);
    console.log(`Result has chunks?`, !!result.output?.chunks);
    console.log(`Chunks length:`, result.output?.chunks?.length || 0);
    
    if (result.output?.chunks && Array.isArray(result.output.chunks)) {
      console.log(`First chunk preview: ${result.output.chunks[0]?.chunk_id}`);
    }

    // Store chunks in IndexedDB
    if (result.output?.chunks && result.output.chunks.length > 0) {
      console.log(`Calling storeChunks with ${result.output.chunks.length} chunks...`);
      await storeChunks(docHash, result.output.chunks);
      console.log(`storeChunks completed successfully`);
      // Update task status to completed
      await updateChunkTask(taskId, { status: 'completed' });
      console.log(`Chunking task ${taskId} completed successfully`);
    } else {
      console.warn(`No chunks returned from Chunkr AI! Status: ${result.status}, Message: ${result.message}`);
      await updateChunkTask(taskId, { 
        status: 'failed',
        error: 'No chunks returned from Chunkr AI'
      });
    }

  


  } catch (error) {
    console.error(`Error processing chunking task ${taskId}:`, error);
    await updateChunkTask(taskId, {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    });
    throw error; // Re-throw to send error back to service worker
  }
}

/**
 * Poll Chunkr AI task until completion
 */
async function pollChunkrTask(taskId: string, maxAttempts = 60, interval = 2000): Promise<any> {
  console.log(`Starting to poll Chunkr AI task ${taskId}, max attempts: ${maxAttempts}`);
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const task = await chunkr.tasks.get(taskId);
      console.log(`Poll attempt ${attempt + 1}/${maxAttempts} - Chunkr task status:`, task.status);

      if (task.status === 'Succeeded') {
        console.log(`Chunkr AI task ${taskId} succeeded!`);
        return task;
      }

      if (task.status === 'Failed') {
        console.error(`Chunkr AI task ${taskId} failed:`, task.message);
        throw new Error(`Chunkr AI task failed: ${task.message || 'Unknown error'}`);
      }

      // Log current status
      console.log(`Chunkr task ${taskId} still processing (${task.status}), waiting ${interval}ms...`);
      
      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, interval));
    } catch (error) {
      console.error(`Error polling Chunkr AI task ${taskId} at attempt ${attempt + 1}:`, error);
      throw error;
    }
  }

  console.error(`Chunkr AI task ${taskId} timed out after ${maxAttempts} attempts (${maxAttempts * interval / 1000}s)`);
  throw new Error(`Chunkr AI task ${taskId} timed out after ${maxAttempts} attempts`);
}

/**
 * Store chunks in IndexedDB
 */
async function storeChunks(docHash: string, chunks: any[]): Promise<void> {
  console.log(`storeChunks called with ${chunks.length} chunks for document ${docHash}`);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    
    // Extract content from segments
    const content = chunk.segments
      .map((seg: any) => seg.markdown || seg.content || seg.text || '')
      .join('\n');
    
    // Get first segment for page/bbox info (for quick access)
    const firstSegment = chunk.segments?.[0];
    
    // Store all segment locations 
    const segmentLocations = chunk.segments?.map((seg: any) => ({
      segment_id: seg.segment_id,
      segment_type: seg.segment_type,
      page_number: seg.page_number,
      bbox: seg.bbox ? {
        left: seg.bbox.left || 0,
        top: seg.bbox.top || 0,
        width: seg.bbox.width || 0,
        height: seg.bbox.height || 0,
      } : null,
      // Store additional useful data
      image: seg.image || undefined, // Image URL for Picture segments
      html: seg.html || undefined, // HTML for Table segments
      text: seg.text || undefined, // Plain text fallback
      page_dimensions: seg.page_width && seg.page_height ? {
        width: seg.page_width,
        height: seg.page_height,
      } : undefined,
    })) || [];
    
    const chunkRecord: ChunkRecord = {
      id: chunk.chunk_id,
      docHash,
      chunkIndex: i,
      content: content,
      description: firstSegment?.description || undefined,
      page: firstSegment?.page_number, // Primary page (first segment)
      bbox: firstSegment?.bbox
        ? {
            x: firstSegment.bbox.left || 0,
            y: firstSegment.bbox.top || 0,
            width: firstSegment.bbox.width || 0,
            height: firstSegment.bbox.height || 0,
          }
        : undefined,
      metadata: {
        chunk_length: chunk.chunk_length,
        segment_count: chunk.segments?.length || 0,
        segment_types: chunk.segments?.map((s: any) => s.segment_type).join(', '),
        segments: segmentLocations, // Full location data for all segments
      },
      createdAt: Date.now(),
    };

    try {
      await putChunk(chunkRecord);
      if (i % 10 === 0) { // Log every 10th chunk to avoid spam
        console.log(`Stored chunk ${i + 1}/${chunks.length}`);
      }
    } catch (error) {
      console.error(`Failed to store chunk ${i}:`, error);
      throw error;
    }
  }

  console.log(`Successfully stored all ${chunks.length} chunks for document ${docHash}`);
}

