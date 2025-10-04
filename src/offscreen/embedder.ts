// Chunk embedding generation using Google Gemini API
import {
  ChunkRecord,
  ChunkEmbeddingRecord,
  getChunksByDoc,
  getMissingEmbeddings,
  putChunkEmbedding,
} from '../db/index';

  // Configuration
import { GEMINI_API_KEY } from './api_key';
const EMBEDDING_MODEL = 'text-embedding-004'; // Gemini's latest embedding model
const EMBEDDING_DIMENSIONS = 768; // text-embedding-004 produces 768-dimensional vectors
const BATCH_SIZE = 100; // Process in batches for efficiency
const MAX_CHARS_PER_INPUT = 20000; // Gemini's character limit per input

interface GeminiEmbeddingResponse {
  embeddings?: Array<{
    values: number[];
  }>;
  embedding?: {
    values: number[];
  };
}

/**
 * Generate embeddings for all chunks of a document that don't have embeddings yet
 */
export async function generateMissingEmbeddings(docHash: string): Promise<number> {
  console.log(`[Embedder] Checking for missing embeddings for document ${docHash}`);
  
  // Get chunks that need embeddings
  const missingChunkIds = await getMissingEmbeddings(docHash);
  
  if (missingChunkIds.length === 0) {
    console.log(`[Embedder] All chunks already have embeddings for document ${docHash}`);
    return 0;
  }
  
  console.log(`[Embedder] Need to generate embeddings for ${missingChunkIds.length} chunks`);
  
  // Get full chunk data
  const allChunks = await getChunksByDoc(docHash);
  const chunksToEmbed = allChunks.filter(chunk => missingChunkIds.includes(chunk.id));
  
  // Process in batches
  let embeddedCount = 0;
  for (let i = 0; i < chunksToEmbed.length; i += BATCH_SIZE) {
    const batch = chunksToEmbed.slice(i, i + BATCH_SIZE);
    console.log(`[Embedder] Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(chunksToEmbed.length / BATCH_SIZE)}`);
    
    const count = await embedBatch(batch, docHash);
    embeddedCount += count;
  }
  
  console.log(`[Embedder] Successfully generated ${embeddedCount} embeddings for document ${docHash}`);
  return embeddedCount;
}

/**
 * Embed a batch of chunks
 */
async function embedBatch(chunks: ChunkRecord[], docHash: string): Promise<number> {
  try {
    // Prepare input texts (prefer content, fallback to description for non-text)
    const inputs = chunks.map(chunk => {
      const text = chunk.content || chunk.description || '';
      // Truncate if too long
      return text.length > MAX_CHARS_PER_INPUT ? text.substring(0, MAX_CHARS_PER_INPUT) : text;
    });
    
    // Call Gemini API - batch embedding
    const requests = inputs.map(text => ({
      model: `models/${EMBEDDING_MODEL}`,
      content: { parts: [{ text }] }
    }));
    
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:batchEmbedContents?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: requests
        }),
      }
    );
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${error}`);
    }
    
    const data: GeminiEmbeddingResponse = await response.json();
    
    if (!data.embeddings || data.embeddings.length !== chunks.length) {
      throw new Error(`Expected ${chunks.length} embeddings, got ${data.embeddings?.length || 0}`);
    }
    
    console.log(`[Embedder] Generated ${data.embeddings.length} embeddings using Gemini ${EMBEDDING_MODEL}`);
    
    // Store embeddings in IndexedDB
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = data.embeddings[i].values;
      
      const embeddingRecord: ChunkEmbeddingRecord = {
        id: chunk.id,
        chunkId: chunk.id,
        docHash: docHash,
        embedding: embedding,
        model: EMBEDDING_MODEL,
        dimensions: EMBEDDING_DIMENSIONS,
        source: chunk.content ? 'content' : 'description',
        createdAt: Date.now(),
      };
      
      await putChunkEmbedding(embeddingRecord);
    }
    
    return chunks.length;
  } catch (error) {
    console.error('[Embedder] Error generating embeddings:', error);
    throw error;
  }
}

/**
 * Generate embedding for a single text (utility function)
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: `models/${EMBEDDING_MODEL}`,
        content: { parts: [{ text }] }
      }),
    }
  );
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${error}`);
  }
  
  const data: GeminiEmbeddingResponse = await response.json();
  if (!data.embedding?.values) {
    throw new Error('No embedding returned from Gemini API');
  }
  
  return data.embedding.values;
}

