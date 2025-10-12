// Chatbot backend - handles chat queries with document context using RAG
import { GoogleGenAI } from '@google/genai';
import { getGeminiApiKey } from './gemini-config';
import { getChunksByDoc, getChunkEmbeddingsByDoc } from '../db/index';
import { generateEmbedding } from './embedder';

// Configuration
const GEMINI_MODEL = 'gemini-2.5-pro';
const TOP_K_CHUNKS = 3;

// Initialize Google GenAI client
const ai = new GoogleGenAI({ apiKey: getGeminiApiKey() });

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }
  
  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    magnitudeA += a[i] * a[i];
    magnitudeB += b[i] * b[i];
  }
  
  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);
  
  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }
  
  return dotProduct / (magnitudeA * magnitudeB);
}

/**
 * Find the most similar chunks using vector similarity search
 */
async function findSimilarChunks(
  query: string,
  docHash: string,
  topK: number = TOP_K_CHUNKS
): Promise<Array<{ chunkId: string; similarity: number; content: string; page: number }>> {
  try {
    console.log(`[Chatbot] Searching for similar chunks for query: "${query.substring(0, 50)}..."`);
    
    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(query);
    
    // Get all chunk embeddings for this document
    const chunkEmbeddings = await getChunkEmbeddingsByDoc(docHash);
    
    if (chunkEmbeddings.length === 0) {
      console.log(`[Chatbot] No embeddings found for document ${docHash}`);
      return [];
    }
    
    // Calculate similarity scores
    const similarities = chunkEmbeddings.map(chunkEmb => ({
      chunkId: chunkEmb.chunkId,
      similarity: cosineSimilarity(queryEmbedding, chunkEmb.embedding)
    }));
    
    // Sort by similarity (highest first)
    similarities.sort((a, b) => b.similarity - a.similarity);
    
    // Get top K chunks
    const topChunks = similarities.slice(0, topK);
    
    // Get the actual chunk data
    const chunks = await getChunksByDoc(docHash);
    const chunkMap = new Map(chunks.map(c => [c.id, c]));
    
    const results = topChunks
      .map(({ chunkId, similarity }) => {
        const chunk = chunkMap.get(chunkId);
        if (!chunk || chunk.page === undefined) return null;
        
        return {
          chunkId,
          similarity,
          content: chunk.content,
          page: chunk.page
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    
    console.log(`[Chatbot] Found ${results.length} similar chunks with similarities:`, 
      results.map(r => `${r.similarity.toFixed(3)} (page ${r.page})`));
    
    return results;
  } catch (error) {
    console.error(`[Chatbot] Error finding similar chunks:`, error);
    return [];
  }
}

/**
 * Generate a response to a user query using relevant document chunks as context
 */
export async function generateChatResponse(
  query: string,
  docHash: string,
  bookmarksContext?: string
): Promise<{ response: string; sources: Array<{ page: number; similarity: number }> }> {
  console.log(`[Chatbot] Generating response for query: "${query.substring(0, 50)}..."`);

  try {
    const { getAISettings } = await import('./ai-settings.js');
    const settings = await getAISettings();
    if (!settings.gemini?.chatEnabled) {
      console.log('[Chatbot] Gemini/chat disabled by settings');
      return { response: 'AI chat disabled in settings', sources: [] };
    }
  } catch (e) {
    // ignore settings errors and proceed
  }

  try {
    // Find relevant chunks
    const similarChunks = await findSimilarChunks(query, docHash);
    
    // Build context from chunks
    let chunkContext = '';
    if (similarChunks.length > 0) {
      chunkContext = similarChunks
        .map((chunk, idx) => `[Context ${idx + 1} - Page ${chunk.page}]\n${chunk.content}`)
        .join('\n\n---\n\n');
    }

    // Compose prompt with bookmarks context (if any) and chunk context
    let prompt = `You are a helpful AI assistant. Use the provided context from the document to answer the user's question. If the context doesn't contain enough information to fully answer the question, use critical thinking to supplement the context and indicate that they are your own reasoning.\n\n`;
    if (bookmarksContext && bookmarksContext.trim()) {
      prompt += `\n${bookmarksContext}\n\n`;
    }
    if (chunkContext) {
      prompt += `\n${chunkContext}\n\n`;
    }
    prompt += `User question: ${query}\n\nPlease provide a clear and concise answer based on the context above. If you reference specific information, mention which page it comes from.`;

    // Generate response using Gemini
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        temperature: 0.7,
        maxOutputTokens: 10000,
      }
    });

    const responseText = response.text;
    if (!responseText) {
      throw new Error('No text in Gemini response');
    }

    return {
      response: responseText,
      sources: similarChunks.map(chunk => ({
        page: chunk.page,
        similarity: chunk.similarity
      }))
    };
  } catch (error) {
    console.error(`[Chatbot] Error generating response:`, error);
    return {
      response: "I encountered an error while processing your question. Please try again.",
      sources: []
    };
  }
}
