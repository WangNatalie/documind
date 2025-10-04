// Term Extractor - extracts important technical terms from visible text using Gemini
import { GoogleGenAI } from '@google/genai';
import { GEMINI_API_KEY } from './api_key';
import { getTableOfContents, TableOfContentsRecord, getChunksByDoc, TOCItem } from '../db/index';

// Configuration
const GEMINI_MODEL = 'gemini-2.5-flash-lite';

// Initialize Google GenAI client
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

export interface TermExtractionResult {
  terms: string[];
  passage: string;
  timestamp: number;
}

export interface TermWithSection {
  term: string;
  tocItem: TOCItem | null;
}

export interface TermSummary {
  term: string;
  definition: string;
  explanation1: string;
  explanation2: string;
  explanation3: string;
  tocItem: TOCItem | null;
}

/**
 * Extract important technical terms from a passage using Gemini
 */
export async function extractTerms(passage: string): Promise<TermExtractionResult> {
  console.log('[TermExtractor] Extracting terms from passage:', passage.substring(0, 100) + '...');

  if (!passage || passage.trim().length === 0) {
    console.log('[TermExtractor] Empty passage, returning empty result');
    return {
      terms: [],
      passage: '',
      timestamp: Date.now()
    };
  }

  try {
    const prompt = `Extract up to 10 important technical terms, keywords, or phrases from this passage.
${passage}
Prioritize terms that may need clarification as someone reads through this passage for understanding. Return only the list of terms separated by commas.`;

    console.log('[TermExtractor] Sending request to Gemini...');
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        temperature: 0.3,
        maxOutputTokens: 500,
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
        maxOutputTokens: 500,
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
 * Find sections for all extracted terms
 */
export async function findSectionsForTerms(
  terms: string[],
  docHash: string
): Promise<TermWithSection[]> {
  console.log(`[SectionFinder] Finding sections for ${terms.length} terms`);

  // Get table of contents for this document
  const toc = await getTableOfContents(docHash);
  
  if (!toc) {
    console.log('[SectionFinder] No table of contents found for document');
    return terms.map(term => ({ term, tocItem: null }));
  }

  console.log(`[SectionFinder] Found TOC with ${toc.items.length} items`);

  // Find section for each term
  const results: TermWithSection[] = [];
  for (const term of terms) {
    const result = await findSectionForTerm(term, toc);
    results.push(result);
  }

  return results;
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
        maxOutputTokens: 1000,
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
    };
  }
}

/**
 * Generate summaries for all terms with their sections
 */
export async function summarizeTerms(
  termsWithSections: TermWithSection[],
  docHash: string
): Promise<TermSummary[]> {
  console.log(`[Summarizer] Generating summaries for ${termsWithSections.length} terms`);

  const summaries: TermSummary[] = [];
  
  for (const termWithSection of termsWithSections) {
    const summary = await summarizeTerm(termWithSection.term, termWithSection, docHash);
    summaries.push(summary);
  }

  console.log(`[Summarizer] Generated ${summaries.length} summaries`);
  return summaries;
}

