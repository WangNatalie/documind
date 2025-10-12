// Term Extractor - extracts important technical terms from visible text using Gemini
import { GoogleGenAI } from '@google/genai';
import { getGeminiApiKey } from './gemini-config';
import { getTableOfContents, TableOfContentsRecord, getChunksByDoc, TOCItem, getChunkEmbeddingsByDoc } from '../db/index';
import { generateEmbedding } from './embedder';

// Configuration
const GEMINI_MODEL = 'gemini-2.0-flash-lite';

// Initialize Google GenAI client
const ai = new GoogleGenAI({ apiKey: getGeminiApiKey() });

export interface TermExtractionResult {
  terms: string[];
  passage: string;
  timestamp: number;
}

export interface TermWithSection {
  term: string;
  tocItem: TOCItem | null;
  matchedChunkId?: string; // The chunk ID that was matched for this term
}

export interface TermSummary {
  term: string;
  definition: string;
  explanation1: string;
  explanation2: string;
  explanation3: string;
  tocItem: TOCItem | null;
  matchedChunkId?: string; // The chunk ID used for context
}

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
 * Find most similar chunk using vector similarity search
 */
async function findMostSimilarChunk(
  term: string,
  docHash: string
): Promise<{ chunkId: string; similarity: number; chunk: any } | null> {
  try {
    console.log(`[VectorSearch] Searching for similar chunks for term: "${term}"`);

    // Generate embedding for the term
    const termEmbedding = await generateEmbedding(term);

    // Get all chunk embeddings for this document
    const chunkEmbeddings = await getChunkEmbeddingsByDoc(docHash);

    if (chunkEmbeddings.length === 0) {
      console.log(`[VectorSearch] No embeddings found for document ${docHash}`);
      return null;
    }

    // Calculate similarity scores
    const similarities = chunkEmbeddings.map(chunkEmb => ({
      chunkId: chunkEmb.chunkId,
      similarity: cosineSimilarity(termEmbedding, chunkEmb.embedding)
    }));

    // Sort by similarity (highest first)
    similarities.sort((a, b) => b.similarity - a.similarity);

    // Get the most similar chunk
    const bestMatch = similarities[0];

    if (bestMatch.similarity < 0.5) {
      console.log(`[VectorSearch] Best similarity (${bestMatch.similarity.toFixed(3)}) below threshold for term "${term}"`);
      return null;
    }

    console.log(`[VectorSearch] Found similar chunk for "${term}": ${bestMatch.chunkId} (similarity: ${bestMatch.similarity.toFixed(3)})`);

    // Get the actual chunk data
    const chunks = await getChunksByDoc(docHash);
    const chunk = chunks.find(c => c.id === bestMatch.chunkId);

    return {
      chunkId: bestMatch.chunkId,
      similarity: bestMatch.similarity,
      chunk: chunk || null
    };
  } catch (error) {
    console.error(`[VectorSearch] Error finding similar chunk for "${term}":`, error);
    return null;
  }
}

/**
 * Extract important technical terms from a passage using Gemini
 */
export async function extractTerms(passage: string): Promise<TermExtractionResult> {
  console.log('[TermExtractor] Extracting terms from passage:', passage.substring(0, 100) + '...');

  try {
    const { getAISettings } = await import('./ai-settings.js');
    const settings = await getAISettings();
    if (!settings.gemini?.termsEnabled) {
      console.log('[TermExtractor] Gemini term extraction disabled by settings');
      return { terms: [], passage: passage.substring(0, 500), timestamp: Date.now() };
    }
  } catch (e) {
    // ignore
  }

  if (!passage || passage.trim().length === 0) {
    console.log('[TermExtractor] Empty passage, returning empty result');
    return {
      terms: [],
      passage: '',
      timestamp: Date.now()
    };
  }

  try {
    const prompt = `Extract 5-10 important technical terms, keywords, or phrases from this passage.
${passage}
Prioritize terms that may need clarification as someone reads through this passage for understanding. Return only the list of terms separated by commas.`;

    console.log('[TermExtractor] Sending request to Gemini...');
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        temperature: 0.3,
        maxOutputTokens: 10000,
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error('No text in Gemini response');
    }

    console.log('[TermExtractor] Received response:', text);

    // Parse the comma-separated terms
    const terms = text
      .split(',')
      .map(term => term.trim())
      .filter(term => term.length > 0);

    console.log('[TermExtractor] Extracted terms:', terms);

    return {
      terms,
      passage: passage.substring(0, 500), // Store first 500 chars for reference
      timestamp: Date.now()
    };
  } catch (error) {
    console.error('[TermExtractor] Error extracting terms:', error);
    return {
      terms: [],
      passage: passage.substring(0, 500),
      timestamp: Date.now()
    };
  }
}

/**
 * Find the relevant section for a term using the table of contents
 */
export async function findSectionForTerm(
  term: string,
  tableOfContents: TableOfContentsRecord
): Promise<TermWithSection> {
  console.log(`[SectionFinder] Finding section for term: "${term}"`);

  if (!tableOfContents || !tableOfContents.items || tableOfContents.items.length === 0) {
    console.log('[SectionFinder] No table of contents available');
    return {
      term,
      tocItem: null
    };
  }

  try {
    // Convert TOC to JSON string
    const tocJson = JSON.stringify(tableOfContents.items, null, 2);

    const prompt = `Given the following JSON object representing the table of contents of a document, return only the section (if it exists) that is the introduction/explanation for this term: ${term}.
${tocJson}

Return the matching TOC item as JSON in the exact format it was given in.

Or return "None" if no relevant section exists.`;

    console.log('[SectionFinder] Sending request to Gemini...');
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        temperature: 0.2,
        maxOutputTokens: 10000,
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error('No text in Gemini response');
    }

    console.log(`[SectionFinder] Received response for "${term}":`, text);

    // Parse the response
    const trimmedText = text.trim();

    if (trimmedText.toLowerCase() === 'none' || trimmedText.toLowerCase().includes('no relevant section')) {
      return {
        term,
        tocItem: null
      };
    }

    // Parse JSON from response (may be wrapped in markdown or other text)
    // Find the JSON object by locating the opening and closing braces
    const startIdx = trimmedText.indexOf('{');
    const endIdx = trimmedText.lastIndexOf('}');

    if (startIdx === -1 || endIdx === -1 || startIdx >= endIdx) {
      throw new Error('No valid JSON object found in response');
    }

    const jsonText = trimmedText.substring(startIdx, endIdx + 1);
    const tocItem: TOCItem = JSON.parse(jsonText);

    return {
      term,
      tocItem
    };
  } catch (error) {
    console.error(`[SectionFinder] Error finding section for term "${term}":`, error);
    return {
      term,
      tocItem: null
    };
  }
}

/**
 * Find sections for all extracted terms (batch version - single API call)
 */
export async function findSectionsForTerms(
  terms: string[],
  docHash: string
): Promise<TermWithSection[]> {
  console.log(`[SectionFinder] Finding sections for ${terms.length} terms`);

  try {
    const { getAISettings } = await import('./ai-settings.js');
    const settings = await getAISettings();
    if (!settings.gemini?.termsEnabled) {
      console.log('[SectionFinder] Gemini term-section matching disabled by settings; returning null toc items');
      return terms.map(term => ({ term, tocItem: null }));
    }
  } catch (e) {}

  // Get table of contents for this document
  const toc = await getTableOfContents(docHash);

  if (!toc) {
    console.log('[SectionFinder] No table of contents found for document');
    return terms.map(term => ({ term, tocItem: null }));
  }

  console.log(`[SectionFinder] Found TOC with ${toc.items.length} items`);

  // Batch process all terms in a single API call
  try {
    const tocJson = JSON.stringify(toc.items, null, 2);
    const termsJson = JSON.stringify(terms);

    const prompt = `Given the following JSON array of terms and the JSON table of contents of a document, find the most relevant section (if it exists) that introduces or explains each term.

Terms: ${termsJson}

Table of Contents:
${tocJson}

For each term, return the matching TOC item in the exact format it was given, or null if no relevant section exists.

Return your response as a JSON array where each element has:
{
  "term": "the term",
  "tocItem": <the matching TOC item object or null>
}

Return ONLY the JSON array, no additional text.`;

    console.log('[SectionFinder] Sending batch request to Gemini...');
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        temperature: 0.2,
        maxOutputTokens: 10000,
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error('No text in Gemini response');
    }

    console.log('[SectionFinder] Received batch response:', text.substring(0, 200) + '...');

    // Parse JSON array from response (may be wrapped in markdown code blocks)
    const trimmedText = text.trim();

    // Remove markdown code blocks if present
    let jsonText = trimmedText;
    if (trimmedText.startsWith('```')) {
      const firstNewline = trimmedText.indexOf('\n');
      const lastBackticks = trimmedText.lastIndexOf('```');
      if (firstNewline !== -1 && lastBackticks > firstNewline) {
        jsonText = trimmedText.substring(firstNewline + 1, lastBackticks).trim();
      }
    }

    // Find the JSON array by locating the opening and closing brackets
    const startIdx = jsonText.indexOf('[');
    const endIdx = jsonText.lastIndexOf(']');

    if (startIdx === -1 || endIdx === -1 || startIdx >= endIdx) {
      throw new Error('No valid JSON array found in response');
    }

    const arrayText = jsonText.substring(startIdx, endIdx + 1);
    const results: TermWithSection[] = JSON.parse(arrayText);

    console.log(`[SectionFinder] Successfully parsed ${results.length} results`);

    // Ensure all terms are present in results (fill in missing ones)
    const resultMap = new Map(results.map(r => [r.term, r.tocItem]));
    const completeResults: TermWithSection[] = terms.map(term => {
      const tocItem = resultMap.get(term) ?? null;
      return {
        term,
        tocItem,
        // Store chunk ID if the TOC item has one
        matchedChunkId: tocItem?.chunkId
      };
    });

    // Find unmatched terms (those with null tocItem)
    const unmatchedTerms = completeResults.filter(r => r.tocItem === null);

    if (unmatchedTerms.length > 0) {
      console.log(`[SectionFinder] ${unmatchedTerms.length} terms without TOC matches, trying vector similarity search...`);

      // Try vector similarity search for unmatched terms
      for (const result of unmatchedTerms) {
        try {
          const similarChunk = await findMostSimilarChunk(result.term, docHash);

          if (similarChunk && similarChunk.chunk) {
            // Create a synthetic TOC item from the chunk
            result.tocItem = {
              title: `Related: ${similarChunk.chunk.sectionHeader || 'Content'}`,
              page: similarChunk.chunk.page,
              chunkId: similarChunk.chunkId
            };
            // Store the matched chunk ID
            result.matchedChunkId = similarChunk.chunkId;
          }
        } catch (error) {
          console.error(`[SectionFinder] Error in vector search for "${result.term}":`, error);
        }
      }

      const matchedByVector = completeResults.filter(r => r.matchedChunkId && !resultMap.has(r.term)).length;
      console.log(`[SectionFinder] Vector search found matches for ${matchedByVector}/${unmatchedTerms.length} unmatched terms`);
    }

    return completeResults;
  } catch (error) {
    console.error('[SectionFinder] Error in batch section finding:', error);
    console.log('[SectionFinder] Falling back to individual term processing...');

    // Fallback to individual processing if batch fails
    const results: TermWithSection[] = [];
    for (const term of terms) {
      const result = await findSectionForTerm(term, toc);
      results.push(result);
    }
    return results;
  }
}

/**
 * Get context from chunks for a term based on its section
 */
async function getContextForTerm(
  term: string,
  termWithSection: TermWithSection,
  docHash: string
): Promise<string> {
  try {
    // Get all chunks for the document
    const chunks = await getChunksByDoc(docHash);

    if (chunks.length === 0) {
      console.log(`[ContextGetter] No chunks found for document ${docHash}`);
      return '';
    }

    // Priority 1: If we have a chunk ID in the TOC item, return that specific chunk
    if (termWithSection.tocItem && termWithSection.tocItem.chunkId) {
      const specificChunk = chunks.find(chunk => chunk.id === termWithSection.tocItem!.chunkId);
      if (specificChunk) {
        console.log(`[ContextGetter] Found specific chunk ${specificChunk.id} for term "${term}"`);
        return specificChunk.content.substring(0, 2000);
      }
    }

    // Priority 2: If we have a page, return chunks from that page
    if (termWithSection.tocItem && termWithSection.tocItem.page) {
      const pageChunks = chunks.filter(chunk => chunk.page === termWithSection.tocItem!.page);

      if (pageChunks.length > 0) {
        console.log(`[ContextGetter] Found ${pageChunks.length} chunks on page ${termWithSection.tocItem.page} for term "${term}"`);
        // Combine text from chunks on the page (limit to ~2000 chars)
        const context = pageChunks
          .slice(0, 3) // Take up to 3 chunks
          .map(chunk => chunk.content)
          .join('\n\n');
        return context.substring(0, 2000);
      }
    }

    // Fallback: search for term in all chunks
    const chunksWithTerm = chunks.filter(chunk =>
      chunk.content.toLowerCase().includes(term.toLowerCase())
    );

    if (chunksWithTerm.length > 0) {
      console.log(`[ContextGetter] Found ${chunksWithTerm.length} chunks containing term "${term}"`);
      // Take the first chunk that mentions the term
      return chunksWithTerm[0].content.substring(0, 2000);
    }

    // Last fallback: use first few chunks
    console.log(`[ContextGetter] Using fallback chunks for term "${term}"`);
    return chunks.slice(0, 2).map(c => c.content).join('\n\n').substring(0, 2000);
  } catch (error) {
    console.error('[ContextGetter] Error getting context:', error);
    return '';
  }
}

/**
 * Generate summary (definition + 3 explanations) for a term
 */
export async function summarizeTerm(
  term: string,
  termWithSection: TermWithSection,
  docHash: string
): Promise<TermSummary> {
  console.log(`[Summarizer] Generating summary for term: "${term}"`);

  try {
    // Get context from document chunks
    const context = await getContextForTerm(term, termWithSection, docHash);

    if (!context) {
      console.log(`[Summarizer] No context found for term "${term}"`);
    }

    const prompt = `Write a concise definition of the given term (${term}) in one sentence as well as an explanation/summary of the term in 3 key points. Prioritize the given context over your own knowledge to provide the definition and explanation. Here is context for the term from another part of the document: ${context}. Return your response in json-parsable format:
{
  "definition": "",
  "explanation1": "",
  "explanation2": "",
  "explanation3": ""
}`;

    console.log(`[Summarizer] Sending request to Gemini for "${term}"...`);
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        temperature: 0.3,
        maxOutputTokens: 10000,
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error('No text in Gemini response');
    }

    console.log(`[Summarizer] Received response for "${term}":`, text.substring(0, 200) + '...');

    // Parse JSON from response (may be wrapped in markdown or other text)
    // Find the JSON object by locating the opening and closing braces
    const trimmedResponse = text.trim();
    const startIdx = trimmedResponse.indexOf('{');
    const endIdx = trimmedResponse.lastIndexOf('}');

    if (startIdx === -1 || endIdx === -1 || startIdx >= endIdx) {
      throw new Error('No valid JSON object found in response');
    }

    const jsonText = trimmedResponse.substring(startIdx, endIdx + 1);
    const parsed = JSON.parse(jsonText);

    return {
      term,
      definition: parsed.definition || '',
      explanation1: parsed.explanation1 || '',
      explanation2: parsed.explanation2 || '',
      explanation3: parsed.explanation3 || '',
      tocItem: termWithSection.tocItem,
      matchedChunkId: termWithSection.matchedChunkId,
    };
  } catch (error) {
    console.error(`[Summarizer] Error summarizing term "${term}":`, error);
    return {
      term,
      definition: 'Error generating definition',
      explanation1: '',
      explanation2: '',
      explanation3: '',
      tocItem: termWithSection.tocItem,
      matchedChunkId: termWithSection.matchedChunkId,
    };
  }
}

/**
 * Generate summaries for all terms with their sections (batch version - single API call)
 */
export async function summarizeTerms(
  termsWithSections: TermWithSection[],
  docHash: string
): Promise<TermSummary[]> {
  console.log(`[Summarizer] Generating summaries for ${termsWithSections.length} terms`);

  try {
    const { getAISettings } = await import('./ai-settings.js');
    const settings = await getAISettings();
    if (!settings.gemini?.termsEnabled) {
      console.log('[Summarizer] Gemini summarization disabled by settings');
      return termsWithSections.map(t => ({ term: t.term, definition: 'Disabled', explanation1: '', explanation2: '', explanation3: '', tocItem: t.tocItem, matchedChunkId: t.matchedChunkId }));
    }
  } catch (e) {}

  if (termsWithSections.length === 0) {
    return [];
  }

  try {
    // Gather context for all terms in parallel
    const termsWithContext = await Promise.all(
      termsWithSections.map(async (termWithSection) => {
        const context = await getContextForTerm(termWithSection.term, termWithSection, docHash);
        return {
          term: termWithSection.term,
          context: context || 'No specific context found',
          tocItem: termWithSection.tocItem,
          matchedChunkId: termWithSection.matchedChunkId
        };
      })
    );

    console.log('[Summarizer] Gathered context for all terms, sending batch request to Gemini...');

    // Create batch prompt with all terms and their contexts
    const termsJson = JSON.stringify(
      termsWithContext.map(t => ({
        term: t.term,
        context: t.context.substring(0, 10000), // Limit context per term to avoid token limits
        section: t.tocItem ? `${t.tocItem.title} (Page ${t.tocItem.page})` : 'No specific section'
      })),
      null,
      2
    );

    const prompt = `For each term in the following JSON array, write a concise definition (one sentence) and 3 key points of explanation/summary. If context is available and sufficient, only use the provided context from the document over your own knowledge.
    If context is not sufficient to generate a definition and explanation, supplement with general knowledge.

Terms with context:
${termsJson}

Return your response as a JSON array where each element has:
{
  "term": "the term name",
  "definition": "one sentence definition",
  "explanation1": "first key point",
  "explanation2": "second key point",
  "explanation3": "third key point"
}

Return ONLY the JSON array, no additional text or markdown.`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        temperature: 0.3,
        maxOutputTokens: 10000,
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error('No text in Gemini response');
    }

    console.log('[Summarizer] Received batch response:', text.substring(0, 200) + '...');

    // Parse JSON array from response (may be wrapped in markdown code blocks)
    const trimmedText = text.trim();

    // Remove markdown code blocks if present
    let jsonText = trimmedText;
    if (trimmedText.startsWith('```')) {
      const firstNewline = trimmedText.indexOf('\n');
      const lastBackticks = trimmedText.lastIndexOf('```');
      if (firstNewline !== -1 && lastBackticks > firstNewline) {
        jsonText = trimmedText.substring(firstNewline + 1, lastBackticks).trim();
      }
    }

    // Find the JSON array by locating the opening and closing brackets
    const startIdx = jsonText.indexOf('[');
    const endIdx = jsonText.lastIndexOf(']');

    if (startIdx === -1 || endIdx === -1 || startIdx >= endIdx) {
      throw new Error('No valid JSON array found in response');
    }

    const arrayText = jsonText.substring(startIdx, endIdx + 1);
    const parsedResults = JSON.parse(arrayText);

    console.log(`[Summarizer] Successfully parsed ${parsedResults.length} summaries`);

    // Map results back to TermSummary objects with tocItems and chunk IDs
    const resultMap = new Map<string, any>(
      parsedResults.map((r: any) => [r.term, r])
    );

    const summaries: TermSummary[] = termsWithContext.map(({ term, tocItem, matchedChunkId }) => {
      const parsed: any = resultMap.get(term);
      if (parsed) {
        return {
          term,
          definition: (parsed.definition as string) || '',
          explanation1: (parsed.explanation1 as string) || '',
          explanation2: (parsed.explanation2 as string) || '',
          explanation3: (parsed.explanation3 as string) || '',
          tocItem,
          matchedChunkId,
        };
      } else {
        // Fallback if term not found in response
        return {
          term,
          definition: 'Summary not available',
          explanation1: '',
          explanation2: '',
          explanation3: '',
          tocItem,
          matchedChunkId,
        };
      }
    });

    console.log(`[Summarizer] Generated ${summaries.length} summaries`);
    return summaries;
  } catch (error) {
    console.error('[Summarizer] Error in batch summarization:', error);
    console.log('[Summarizer] Falling back to individual term processing...');

    // Fallback to individual processing if batch fails
    const summaries: TermSummary[] = [];
    for (const termWithSection of termsWithSections) {
      const summary = await summarizeTerm(termWithSection.term, termWithSection, docHash);
      summaries.push(summary);
    }

    console.log(`[Summarizer] Generated ${summaries.length} summaries (fallback)`);
    return summaries;
  }
}

/**
 * Summarize arbitrary selected text (could be a term, phrase, or sentence)
 * Uses vector similarity to find relevant context from the document
 */
export async function explainSelectedText(
  text: string,
  docHash: string
): Promise<TermSummary> {
  console.log(`[ExplainSelection] Generating summary for selected text: "${text.substring(0, 50)}..."`);

  try {
    // Try to find relevant context using vector similarity
    const similarChunk = await findMostSimilarChunk(text, docHash);

    let context = '';
    let tocItem: TOCItem | null = null;
    let matchedChunkId: string | undefined = undefined;

    if (similarChunk && similarChunk.chunk) {
      console.log(`[ExplainSelection] Found similar chunk with similarity ${similarChunk.similarity.toFixed(3)}`);
      console.log(`[ExplainSelection] Chunk info:`, {
        page: similarChunk.chunk.page,
        sectionHeader: similarChunk.chunk.sectionHeader,
        chunkId: similarChunk.chunkId
      });
      context = similarChunk.chunk.content.substring(0, 2000);
      matchedChunkId = similarChunk.chunkId;

      // Always create a TOC item from the chunk so "Go to Context" works
      tocItem = {
        title: similarChunk.chunk.sectionHeader || '',
        page: similarChunk.chunk.page,
        chunkId: similarChunk.chunkId
      };

      console.log(`[ExplainSelection] Created tocItem:`, tocItem);
    } else {
      console.log(`[ExplainSelection] No similar chunk found, using text itself as context`);
      // If no similar chunk found, use the text itself as context
      context = text;
    }

    // Generate summary using Gemini
    const prompt = `Write a concise definition/explanation of the following text in one sentence, as well as a summary in 3 key points. If context is available and sufficient, only use the provided context from the document over your own knowledge.
    If context is not sufficient to generate a definition and explanation, supplement with general knowledge.

Text to summarize: "${text}"

Context from document: ${context}

Return your response in json-parsable format:
{
  "definition": "",
  "explanation1": "",
  "explanation2": "",
  "explanation3": ""
}`;

    console.log(`[ExplainSelection] Sending request to Gemini...`);
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        temperature: 0.3,
        maxOutputTokens: 10000,
      }
    });

    const responseText = response.text;
    if (!responseText) {
      throw new Error('No text in Gemini response');
    }

    console.log(`[ExplainSelection] Received response:`, responseText.substring(0, 200) + '...');

    // Parse JSON from response
    const trimmedResponse = responseText.trim();
    const startIdx = trimmedResponse.indexOf('{');
    const endIdx = trimmedResponse.lastIndexOf('}');

    if (startIdx === -1 || endIdx === -1 || startIdx >= endIdx) {
      throw new Error('No valid JSON object found in response');
    }

    const jsonText = trimmedResponse.substring(startIdx, endIdx + 1);
    const parsed = JSON.parse(jsonText);

    return {
      term: text,
      definition: parsed.definition || '',
      explanation1: parsed.explanation1 || '',
      explanation2: parsed.explanation2 || '',
      explanation3: parsed.explanation3 || '',
      tocItem,
      matchedChunkId,
    };
  } catch (error) {
    console.error(`[ExplainSelection] Error summarizing text:`, error);
    return {
      term: text,
      definition: 'Error generating summary',
      explanation1: '',
      explanation2: '',
      explanation3: '',
      tocItem: null,
      matchedChunkId: undefined,
    };
  }
}

