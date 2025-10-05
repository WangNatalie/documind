// Table of Contents generation using PDF outline or AI
import {
  ChunkRecord,
  TableOfContentsRecord,
  TOCItem,
  getChunksByDoc,
  putTableOfContents,
  getTableOfContents,
} from '../db/index';
// import { readOPFSFile } from '../db/opfs';
// import { pdfjsLib } from '../viewer/pdf';
import { GoogleGenAI } from '@google/genai';
import { getGeminiApiKey } from './gemini-config';

// Configuration
const GEMINI_MODEL = 'gemini-2.5-flash'; // Fast model for TOC generation
const MAX_FIRST_CHUNKS = 5; // Number of first chunks to include in AI prompt

// Initialize Google GenAI client lazily; fail fast if no API key configured
let ai: any = null;
const geminiKey = getGeminiApiKey();
if (geminiKey) {
  ai = new GoogleGenAI({ apiKey: geminiKey });
} else {
  console.warn('[TOC] No Gemini API key configured; AI TOC generation will be disabled');
}

/**
 * Extract PDF outline from PDF.js if it exists
 */
/*
async function extractPDFOutline(
  fileUrl?: string,
  uploadId?: string
): Promise<TOCItem[] | null> {
  try {
    console.log('[TOC] Attempting to extract PDF outline...');

    // Load PDF document
    let pdfDoc: any;
    if (uploadId) {
      const arrayBuffer = await readOPFSFile(uploadId);
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      pdfDoc = await loadingTask.promise;
    } else if (fileUrl) {
      const loadingTask = pdfjsLib.getDocument({ url: fileUrl, withCredentials: true });
      pdfDoc = await loadingTask.promise;
    } else {
      return null;
    }

    // Get outline
    const outline = await pdfDoc.getOutline();
    if (!outline || outline.length === 0) {
      console.log('[TOC] No PDF outline found');
      return null;
    }

    console.log('[TOC] PDF outline found with', outline.length, 'items');

    // Convert outline to TOC items
    const tocItems: TOCItem[] = [];

    async function processOutlineItem(item: any, level: number = 0): Promise<void> {
      try {
        // Get destination (page number and positioning)
        let pageNum = 1;
        let bbox: { x: number; y: number; width: number; height: number } | undefined;

        console.log('[TOC] Processing outline item:', item);
        if (item.dest) {
          try {
            // item.dest can be either a string (named destination) or an array (direct destination)
            let dest: any;
            if (typeof item.dest === 'string') {
              // Named destination - need to resolve it
              dest = await pdfDoc.getDestination(item.dest);
            } else if (Array.isArray(item.dest)) {
              // Direct destination - use as is
              dest = item.dest;
            }

            if (dest && dest[0]) {
              const pageRef = dest[0];
              pageNum = await pdfDoc.getPageIndex(pageRef) + 1; // Convert to 1-indexed

              // Extract positioning information from destination
              // Destination format: [pageRef, {name: fitType}, ...coordinates]
              // Common types: FitH (top), FitV (left), XYZ (left, top, zoom), Fit, FitB, etc.
              if (dest[1] && dest[1].name) {
                const fitType = dest[1].name;

                // Get page dimensions for coordinate conversion
                const page = await pdfDoc.getPage(pageNum);
                const viewport = page.getViewport({ scale: 1.0 });
                const pageHeight = viewport.height;
                const pageWidth = viewport.width;

                let x = 0, y = 0;

                // Extract coordinates based on fit type
                if (fitType === 'XYZ' && dest.length >= 4) {
                  // XYZ: [pageRef, {name: 'XYZ'}, left, top, zoom]
                  x = dest[2] !== null ? dest[2] : 0;
                  y = dest[3] !== null ? dest[3] : 0;
                } else if (fitType === 'FitH' && dest.length >= 3) {
                  // FitH: [pageRef, {name: 'FitH'}, top]
                  x = 0;
                  y = dest[2] !== null ? dest[2] : 0;
                } else if (fitType === 'FitV' && dest.length >= 3) {
                  // FitV: [pageRef, {name: 'FitV'}, left]
                  x = dest[2] !== null ? dest[2] : 0;
                  y = 0;
                } else if (fitType === 'FitBH' && dest.length >= 3) {
                  // FitBH: [pageRef, {name: 'FitBH'}, top]
                  x = 0;
                  y = dest[2] !== null ? dest[2] : 0;
                } else if (fitType === 'FitBV' && dest.length >= 3) {
                  // FitBV: [pageRef, {name: 'FitBV'}, left]
                  x = dest[2] !== null ? dest[2] : 0;
                  y = 0;
                }

                // Convert PDF coordinates (bottom-left origin) to top-left origin
                // PDF coordinates have (0,0) at bottom-left, we want top-left
                const yFromTop = pageHeight - y;

                // Create a bounding box with small width/height around the destination point
                // This represents the approximate location of the TOC entry
                bbox = {
                  x: Math.max(0, x),
                  y: Math.max(0, yFromTop),
                  width: Math.min(100, pageWidth), // Reasonable default width
                  height: 20, // Reasonable default height for a text line
                };

                console.log(`[TOC] Extracted bbox for "${item.title}":`, bbox);
              }
            }
          } catch (e) {
            console.warn('[TOC] Could not resolve destination for item:', item.title);
            console.warn('[TOC] Error:', e);
          }
        }

        tocItems.push({
          title: item.title || 'Untitled',
          page: pageNum,
          level: level,
          bbox: bbox,
        });

        // Process children recursively
        if (item.items && item.items.length > 0) {
          for (const child of item.items) {
            await processOutlineItem(child, level + 1);
          }
        }
      } catch (error) {
        console.warn('[TOC] Error processing outline item:', error);
      }
    }

    // Process all outline items
    for (const item of outline) {
      await processOutlineItem(item, 0);
    }

    console.log('[TOC] Extracted', tocItems.length, 'TOC items from PDF outline');
    return tocItems;
  } catch (error) {
    console.error('[TOC] Error extracting PDF outline:', error);
    return null;
  }
}*/

/**
 * Extract segment headers from chunks
 */
function extractSegmentHeaders(chunks: ChunkRecord[]): Array<{ header: string; page: number; chunkId: string; bbox?: any }> {
  const headers: Array<{ header: string; page: number; chunkId: string; bbox?: any }> = [];
  const chunksWithHeaders = new Set<string>(); // Track which chunks have explicit headers

  for (const chunk of chunks) {
    let foundHeaders = false;

    // First, check for Gemini-style headers in metadata
    const geminiHeaders = chunk.metadata?.headers || [];
    if (Array.isArray(geminiHeaders) && geminiHeaders.length > 0) {
      for (const header of geminiHeaders) {
        if (header.text && header.text.trim()) {
          headers.push({
            header: header.text.trim(),
            page: chunk.page || 1,
            chunkId: chunk.id,
            bbox: chunk.bbox, // Use chunk bbox if available
          });
          foundHeaders = true;
          chunksWithHeaders.add(chunk.id);
        }
      }
    }

    // Also look for segment headers in metadata (from Chunkr/other processors)
    const segments = chunk.metadata?.segments || [];
    for (const segment of segments) {
      // Check if segment type is a header (e.g., "SectionHeader", "Title", etc.)
      if (segment.segment_type &&
          (segment.segment_type.includes('SectionHeader') ||
           segment.segment_type.includes('Title') ||
           segment.segment_type.includes('PageHeader'))) {

        // Extract text from the segment
        const text = segment.text || segment.markdown || '';
        if (text.trim()) {
          headers.push({
            header: text.trim(),
            page: segment.page_number || chunk.page || 1,
            chunkId: chunk.id,
            bbox: segment.bbox,
          });
          foundHeaders = true;
          chunksWithHeaders.add(chunk.id);
        }
      }
    }

    // If no headers found, create a fallback header from the first few words
    if (!foundHeaders && chunk.content && chunk.content.trim()) {
      const words = chunk.content.trim().split(/\s+/);
      const firstWords = words.slice(0, 8).join(' '); // First 8 words
      const fallbackHeader = firstWords + (words.length > 8 ? '...' : '');

      headers.push({
        header: fallbackHeader,
        page: chunk.page || 1,
        chunkId: chunk.id,
        bbox: chunk.bbox,
      });
    }
  }

  console.log('[TOC] Extracted', headers.length, 'headers from chunks');
  console.log('[TOC] Header sources:', {
    explicit: chunksWithHeaders.size,
    fallback: headers.length - chunksWithHeaders.size,
    gemini: headers.filter(h => chunks.find(c => c.id === h.chunkId)?.metadata?.source?.includes('gemini')).length,
    segments: headers.filter(h => chunks.find(c => c.id === h.chunkId)?.metadata?.segments).length,
  });
  return headers;
}

/**
 * Generate TOC using AI (Gemini)
 */
async function generateAITableOfContents(
  chunks: ChunkRecord[]
): Promise<TOCItem[]> {
  console.log('[TOC] Generating table of contents using AI...');

  if (!ai) {
    const msg = 'Gemini API key not configured; AI TOC generation is disabled.';
    console.warn('[TOC] ' + msg);
    // Return a minimal empty TOC so caller can continue without throwing
    return [];
  }

  // Get first N chunks
  const firstChunks = chunks.slice(0, MAX_FIRST_CHUNKS);

  // Get all segment headers
  const headers = extractSegmentHeaders(chunks);

  // Build prompt
  const firstChunksText = firstChunks
    .map((chunk, idx) => `[Chunk ${idx + 1}, Page ${chunk.page || '?'}]\n${chunk.content}`)
    .join('\n\n');

  const headersText = headers
    .map(h => `- "${h.header}" (Page ${h.page})`)
    .join('\n');

  const prompt = `You are analyzing a PDF document to create a table of contents.

Here are the first ${firstChunks.length} chunks from the document that may or may not already contain the table of contents:

${firstChunksText}

${headers.length > 0 ? `\nHere are all the section headers found in the document:\n${headersText}\n` : ''}

Based on this information, please generate a well-structured table of contents for this document.
Each entry should have:
- A clear, descriptive title
- The page number where it appears
- A hierarchy level (0 = top level, 1 = subsection, etc.)

Return the table of contents as a JSON array with this exact structure:
[
  {"title": "Chapter Title", "page": 1, "level": 0},
  {"title": "Section Title", "page": 3, "level": 1},
  ...
]

Only return the JSON array, nothing else.`;

  try {
    // Use Google GenAI SDK
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        temperature: 0.2,
        maxOutputTokens: 10000,
      }
    });

    console.log('[TOC] Gemini response:', response);
    const text = response.text;
    if (!text) {
      throw new Error('No text in Gemini response');
    }

    console.log('[TOC] Raw Gemini response:', text);

    // Parse JSON from response (may be wrapped in markdown code blocks)
    let jsonText = text.trim();
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/^```json\s*/,'').replace(/\s*```$/,'');
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```\s*/,'').replace(/\s*```$/,'');
    }

    const tocItems: TOCItem[] = JSON.parse(jsonText);

    console.log('[TOC] Generated', tocItems.length, 'TOC items using AI');
    return tocItems;
  } catch (error) {
    console.error('[TOC] Error generating AI table of contents:', error);
    throw error;
  }
}

/**
 * Link TOC items to chunks with bounding boxes
 */
function linkTOCToChunks(tocItems: TOCItem[], chunks: ChunkRecord[]): TOCItem[] {
  // Extract all headers from chunks with their bounding boxes
  const allHeaders = extractSegmentHeaders(chunks);

  // Create a map for faster lookup: page -> headers on that page
  const pageToHeaders = new Map<number, typeof allHeaders>();
  for (const header of allHeaders) {
    if (!pageToHeaders.has(header.page)) {
      pageToHeaders.set(header.page, []);
    }
    pageToHeaders.get(header.page)!.push(header);
  }

  // Try to link each TOC item to a header (and thus chunk)
  return tocItems.map(item => {
    // Skip if already has bbox (e.g., from PDF outline)
    if (item.bbox) {
      return item;
    }

    const headersOnPage = pageToHeaders.get(item.page) || [];

    // Try to find a header that matches the TOC title
    // Use fuzzy matching: check if header contains title or title contains header
    let bestMatch: typeof allHeaders[0] | undefined;
    let bestScore = 0;

    for (const header of headersOnPage) {
      const headerText = header.header.toLowerCase().trim();
      const titleText = item.title.toLowerCase().trim();

      // Exact match (best)
      if (headerText === titleText) {
        bestMatch = header;
        break;
      }

      // Calculate match score
      let score = 0;
      if (headerText.includes(titleText)) {
        score = titleText.length / headerText.length; // Longer match = better
      } else if (titleText.includes(headerText)) {
        score = headerText.length / titleText.length * 0.9; // Slightly lower score
      }

      if (score > bestScore && score > 0.5) { // Require at least 50% match
        bestScore = score;
        bestMatch = header;
      }
    }

    // If we found a matching header, link it with its bbox
    if (bestMatch) {
      return {
        ...item,
        chunkId: bestMatch.chunkId,
        bbox: bestMatch.bbox, // Use segment-level bbox from header
      };
    }

    // Otherwise, just return the item as-is
    return item;
  });
}

/**
 * Generate table of contents for a document
 * First tries to extract PDF outline, falls back to AI generation
 */
export async function generateTableOfContents(
  docHash: string,
  _fileUrl?: string,
  _uploadId?: string
): Promise<void> {
  console.log('[TOC] Generating table of contents for document', docHash);

  try {
    // Check if TOC already exists
    const existingTOC = await getTableOfContents(docHash);
    if (existingTOC) {
      console.log('[TOC] Table of contents already exists, skipping generation');
      return;
    }

    // Get chunks for this document
    const chunks = await getChunksByDoc(docHash);
    if (chunks.length === 0) {
      console.warn('[TOC] No chunks found for document, cannot generate TOC');
      return;
    }

    // Try to extract PDF outline first
    let tocItems = null; // await extractPDFOutline(fileUrl, uploadId);
    let source: 'pdf-outline' | 'ai-generated' = 'pdf-outline';
    let model: string | undefined;

    // If no outline, generate using AI
    // if (!tocItems || tocItems.length === 0) {
    console.log('[TOC] No PDF outline, generating with AI...');
    tocItems = await generateAITableOfContents(chunks);
    source = 'ai-generated';
    model = GEMINI_MODEL;
    // }

    // Link TOC items to chunks with bounding boxes
    tocItems = linkTOCToChunks(tocItems, chunks);

    // Store in IndexedDB
    const tocRecord: TableOfContentsRecord = {
      docHash,
      items: tocItems,
      source,
      model,
      createdAt: Date.now(),
    };

    await putTableOfContents(tocRecord);

    // Log statistics
    const itemsWithBbox = tocItems.filter(item => item.bbox).length;
    const itemsWithChunkId = tocItems.filter(item => item.chunkId).length;
    console.log(`[TOC] Successfully generated and stored table of contents:`);
    console.log(`  - Total items: ${tocItems.length}`);
    console.log(`  - Source: ${source}`);
    console.log(`  - Items with bbox: ${itemsWithBbox}/${tocItems.length}`);
    console.log(`  - Items with chunkId: ${itemsWithChunkId}/${tocItems.length}`);
    if (itemsWithBbox < tocItems.length) {
      console.warn(`[TOC] ${tocItems.length - itemsWithBbox} items missing bounding boxes`);
    }
  } catch (error) {
    console.error('[TOC] Error generating table of contents:', error);
    throw error;
  }
}

