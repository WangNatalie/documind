// Gemini-based chunking operations
import { ChunkRecord, putChunk } from '../db/index';
import { readOPFSFile } from '../db/opfs';
import { pdfjsLib } from '../viewer/pdf';
import { nanoid } from 'nanoid';
import { GoogleGenAI, createPartFromUri } from '@google/genai';

// Gemini configuration for chunking
const GEMINI_API_KEY = ''; // GEMINI_API_KEY HERE
const GEMINI_CHUNKING_MODEL = 'gemini-2.5-pro'; // Multimodal model that can parse PDFs directly
const USE_MULTIMODAL_PDF_PARSING = true; // Set to true to parse PDFs directly (includes images/tables)

// Initialize Google GenAI
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// Cache for uploaded files (in-memory, keyed by docHash)
// Format: { docHash: { uri: string, mimeType: string, uploadedAt: number, fileName: string } }
const uploadedFilesCache = new Map<string, {
  uri: string;
  mimeType: string;
  uploadedAt: number;
  fileName: string;
}>();

const FILE_CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours (Gemini files expire after 48h, so we cache for 24h to be safe)

interface PageTextData {
  pageNumber: number;
  text: string;
  width: number;
  height: number;
}

/**
 * Extract text and metadata from PDF using PDF.js
 */
async function extractPDFText(
  fileUrl?: string,
  uploadId?: string
): Promise<PageTextData[]> {
  console.log('[Gemini Chunker] Extracting PDF text...');
  
  try {
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
      throw new Error('Either fileUrl or uploadId is required');
    }

    const pageCount = pdfDoc.numPages;
    console.log(`[Gemini Chunker] PDF has ${pageCount} pages`);

    const pages: PageTextData[] = [];

    // Extract text from each page
    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent();
      const viewport = page.getViewport({ scale: 1.0 });
      
      // Combine text items into page text
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');

      pages.push({
        pageNumber: pageNum,
        text: pageText,
        width: viewport.width,
        height: viewport.height,
      });

      if (pageNum % 10 === 0) {
        console.log(`[Gemini Chunker] Extracted text from ${pageNum}/${pageCount} pages`);
      }
    }

    console.log(`[Gemini Chunker] Extracted text from all ${pageCount} pages`);
    return pages;
  } catch (error) {
    console.error('[Gemini Chunker] Error extracting PDF text:', error);
    throw error;
  }
}

/**
 * Upload PDF to Gemini File API for multimodal parsing using official SDK
 * Uses caching to avoid reuploading the same file
 */
async function uploadPDFToGemini(
  docHash: string,
  fileUrl?: string,
  uploadId?: string
): Promise<{ uri: string; mimeType: string }> {
  console.log('[Gemini Chunker] Checking if PDF needs to be uploaded...');
  
  try {
    // Check cache first
    const cached = uploadedFilesCache.get(docHash);
    if (cached) {
      const age = Date.now() - cached.uploadedAt;
      
      if (age < FILE_CACHE_EXPIRY) {
        console.log(`[Gemini Chunker] Using cached file (age: ${Math.round(age / 1000 / 60)} minutes)`);
        console.log(`[Gemini Chunker] Cached URI: ${cached.uri}`);
        
        // Optionally verify file still exists in Gemini (comment out if too slow)
        try {
          const fileName = cached.uri.split('/').pop();
          if (fileName) {
            const fileCheck = await ai.files.get({ name: fileName });
            if (fileCheck.state === 'ACTIVE') {
              console.log('[Gemini Chunker] Cached file verified as still active');
              return { uri: cached.uri, mimeType: cached.mimeType };
            } else {
              console.log('[Gemini Chunker] Cached file no longer active, will reupload');
              uploadedFilesCache.delete(docHash);
            }
          }
        } catch (verifyError) {
          console.warn('[Gemini Chunker] Could not verify cached file, will reupload:', verifyError);
          uploadedFilesCache.delete(docHash);
        }
      } else {
        console.log('[Gemini Chunker] Cached file expired, will reupload');
        uploadedFilesCache.delete(docHash);
      }
    }
    
    // Need to upload
    console.log('[Gemini Chunker] Uploading PDF to Gemini File API...');
    
    // Get PDF as blob/arraybuffer
    let pdfBlob: Blob;
    let displayName: string;
    
    if (uploadId) {
      const arrayBuffer = await readOPFSFile(uploadId);
      pdfBlob = new Blob([arrayBuffer], { type: 'application/pdf' });
      displayName = `${uploadId}.pdf`;
    } else if (fileUrl) {
      const response = await fetch(fileUrl, { credentials: 'include' });
      if (!response.ok) {
        throw new Error(`Failed to fetch PDF: ${response.statusText}`);
      }
      pdfBlob = await response.blob();
      // Extract filename from URL
      displayName = fileUrl.split('/').pop() || 'document.pdf';
    } else {
      throw new Error('Either fileUrl or uploadId is required');
    }

    // Upload to Gemini File API using official SDK
    console.log('[Gemini Chunker] Uploading file...');
    const file = await ai.files.upload({
      file: pdfBlob,
      config: {
        displayName: displayName,
      },
    });

    if (!file.name) {
      throw new Error('No file name returned from upload');
    }

    // Wait for the file to be processed
    console.log('[Gemini Chunker] Waiting for file to be processed...');
    let getFile = await ai.files.get({ name: file.name });
    let retries = 0;
    const maxRetries = 60; // 5 minutes maximum wait time
    
    while (getFile.state === 'PROCESSING') {
      if (retries >= maxRetries) {
        throw new Error('File processing timeout after 5 minutes');
      }
      
      console.log(`[Gemini Chunker] File status: ${getFile.state}, waiting...`);
      await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5 seconds
      
      getFile = await ai.files.get({ name: file.name });
      retries++;
    }
    
    if (getFile.state === 'FAILED') {
      throw new Error('File processing failed');
    }

    const result = { 
      uri: file.uri || '', 
      mimeType: file.mimeType || 'application/pdf' 
    };
    
    // Cache the result
    uploadedFilesCache.set(docHash, {
      uri: result.uri,
      mimeType: result.mimeType,
      uploadedAt: Date.now(),
      fileName: file.name,
    });
    
    console.log('[Gemini Chunker] PDF uploaded and processed successfully:', file.uri);
    console.log('[Gemini Chunker] File cached for future use');
    
    return result;
  } catch (error) {
    console.error('[Gemini Chunker] Error uploading PDF to Gemini:', error);
    throw error;
  }
}

/**
 * Parse PDF directly using Gemini's multimodal capabilities (includes images/tables)
 */
async function parseMultimodalPDF(
  fileUri: string,
  mimeType: string,
  docHash: string
): Promise<ChunkRecord[]> {
  console.log('[Gemini Chunker] Parsing PDF with Gemini multimodal model...');
  
  const prompt = `You are an AI assistant helping to chunk a PDF document into meaningful semantic chunks for better search and retrieval.

Analyze this PDF document and split it into meaningful semantic chunks. Each chunk should:
1. Contain related content (e.g., a complete section, paragraph, table, or image with context)
3. Have natural boundaries (don't split in the middle of sentences)
4. Capture the main ideas, key information, tables, charts, and images

For images, tables, and charts:
- Include a description of what they show
- Describe the data or information they contain
- Note their relevance to surrounding text

For each chunk, identify any headers/titles it contains:
- Include the header text and its type ["Title", "SectionHeader","Subsection"]

For each chunk, provide:
- The chunk content (text, table data, or image description)
- A brief description summarizing what the chunk is about
- The approximate page number where the section starts 
- The type of content: "text", "table", "image", "chart", or "mixed"
- Any headers/titles found in the chunk (as an array of objects with "text" and "type")

Return the chunks as a JSON array with this exact structure:
[
  {
    "content": "The full text, table data, or image description",
    "description": "Brief summary of this chunk's content",
    "page": 1,
    "type": "text",
    "headers": [
      {"text": "Chapter 1: Introduction", "type": "SectionHeader"},
      {"text": "Background", "type": "Subsection"}
    ]
  },
  ...
]

If a chunk has no headers, use an empty array: "headers": []

Return ONLY the JSON array, nothing else.`;

  try {
    // Create file part using official SDK helper
    const fileContent = createPartFromUri(fileUri, mimeType);
    
    // Generate content using official SDK
    const response = await ai.models.generateContent({
      model: GEMINI_CHUNKING_MODEL,
      contents: [prompt, fileContent],
      config: {
        temperature: 0.3,
        maxOutputTokens: 32768,
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error('No text in Gemini response');
    }

    console.log('[Gemini Chunker] Raw Gemini multimodal response:', text);

    // Parse JSON from response (may be wrapped in markdown code blocks)
    let jsonText = text.trim();
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    const geminiChunks = JSON.parse(jsonText);
    console.log(`[Gemini Chunker] Gemini created ${geminiChunks.length} multimodal chunks`);

    // Convert to ChunkRecord format
    const chunkRecords: ChunkRecord[] = geminiChunks.map((chunk: any, index: number) => {
      return {
        id: nanoid(),
        docHash,
        chunkIndex: index,
        content: chunk.content || '',
        description: chunk.description,
        page: chunk.page || 1,
        bbox: undefined, // No precise bbox for Gemini chunks
        metadata: {
          source: 'gemini-multimodal',
          model: GEMINI_CHUNKING_MODEL,
          chunk_length: chunk.content?.length || 0,
          content_type: chunk.type || 'text', // text, table, image, chart, mixed
          headers: chunk.headers || [], // Headers/titles found in this chunk
        },
        createdAt: Date.now(),
      };
    });

    return chunkRecords;
  } catch (error) {
    console.error('[Gemini Chunker] Error parsing multimodal PDF:', error);
    throw error;
  }
}

/**
 * Build semantic chunks from the document using Gemini
 */
async function buildSemanticChunks(
  pages: PageTextData[],
  docHash: string
): Promise<ChunkRecord[]> {
  console.log('[Gemini Chunker] Building semantic chunks with Gemini...');
  
  // Combine all pages into document text with page markers
  const documentText = pages
    .map(p => `[PAGE ${p.pageNumber}]\n${p.text}`)
    .join('\n\n');

  const prompt = `You are an AI assistant helping to chunk a PDF document into meaningful semantic chunks for better search and retrieval.

The document text is provided below with page markers [PAGE N] indicating page numbers.

Your task is to analyze this document and split it into meaningful semantic chunks. Each chunk should:
1. Contain related content (e.g., a complete section, paragraph, or concept)
3. Have natural boundaries (don't split in the middle of sentences)
4. Capture the main ideas and key information

For each chunk, identify any headers/titles it contains:
- Look for section headers, chapter titles, subsection headings
- Include the header text and its type (e.g., "SectionHeader", "Title", "PageHeader", "Subsection")
- Headers help with navigation and understanding document structure

For each chunk, provide:
- The chunk content (the actual text)
- A brief description summarizing what the chunk is about
- The primary page number where the chunk appears
- Any headers/titles found in the chunk (as an array of objects with "text" and "type")

Return the chunks as a JSON array with this exact structure:
[
  {
    "content": "The full text of the chunk",
    "description": "Brief summary of this chunk's content",
    "page": 1,
    "headers": [
      {"text": "Section Title", "type": "SectionHeader"}
    ]
  },
  ...
]

If a chunk has no headers, use an empty array: "headers": []

Document text:
${documentText.substring(0, 800000)}

Return ONLY the JSON array, nothing else.`;

  try {
    // Generate content using official SDK
    const response = await ai.models.generateContent({
      model: GEMINI_CHUNKING_MODEL,
      contents: [prompt],
      config: {
        temperature: 0.3,
        maxOutputTokens: 32768,
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error('No text in Gemini response');
    }

    console.log('[Gemini Chunker] Raw Gemini response:', text);

    // Parse JSON from response (may be wrapped in markdown code blocks)
    let jsonText = text.trim();
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    const geminiChunks = JSON.parse(jsonText);
    console.log(`[Gemini Chunker] Gemini created ${geminiChunks.length} chunks`);

    // Convert to ChunkRecord format
    const chunkRecords: ChunkRecord[] = geminiChunks.map((chunk: any, index: number) => {
      const pageData = pages.find(p => p.pageNumber === chunk.page) || pages[0];
      
      return {
        id: nanoid(),
        docHash,
        chunkIndex: index,
        content: chunk.content || '',
        description: chunk.description,
        page: chunk.page || 1,
        // Note: Gemini-based chunks don't have precise bounding boxes
        // but we can estimate based on page dimensions
        bbox: undefined, // No precise bbox for Gemini chunks
        metadata: {
          source: 'gemini',
          model: GEMINI_CHUNKING_MODEL,
          chunk_length: chunk.content?.length || 0,
          headers: chunk.headers || [], // Headers/titles found in this chunk
          page_dimensions: {
            width: pageData.width,
            height: pageData.height,
          },
        },
        createdAt: Date.now(),
      };
    });

    return chunkRecords;
  } catch (error) {
    console.error('[Gemini Chunker] Error creating semantic chunks:', error);
    throw error;
  }
}

/**
 * Fallback: Create simple text-based chunks if Gemini fails
 * This provides a basic chunking strategy that doesn't rely on AI
 */
function createSimpleChunks(
  pages: PageTextData[],
  docHash: string,
  targetSize: number = 1000,
  overlap: number = 200
): ChunkRecord[] {
  console.log('[Gemini Chunker] Creating simple chunks as fallback...');
  
  const chunks: ChunkRecord[] = [];
  let chunkIndex = 0;
  
  for (const page of pages) {
    const text = page.text;
    let startIdx = 0;
    
    while (startIdx < text.length) {
      // Calculate chunk end with target size
      let endIdx = Math.min(startIdx + targetSize, text.length);
      
      // Try to find a natural break (period, newline) near the target size
      if (endIdx < text.length) {
        const searchText = text.substring(endIdx - 100, endIdx + 100);
        const breakChars = ['. ', '.\n', '\n\n', '! ', '? '];
        let bestBreak = -1;
        
        for (const breakChar of breakChars) {
          const breakIdx = searchText.lastIndexOf(breakChar);
          if (breakIdx > 50) { // Make sure we're not too far back
            bestBreak = endIdx - 100 + breakIdx + breakChar.length;
            break;
          }
        }
        
        if (bestBreak > startIdx) {
          endIdx = bestBreak;
        }
      }
      
      const chunkText = text.substring(startIdx, endIdx).trim();
      
      if (chunkText.length > 50) { // Only create chunk if it has meaningful content
        chunks.push({
          id: nanoid(),
          docHash,
          chunkIndex: chunkIndex++,
          content: chunkText,
          page: page.pageNumber,
          bbox: undefined,
          metadata: {
            source: 'simple-fallback',
            chunk_length: chunkText.length,
            page_dimensions: {
              width: page.width,
              height: page.height,
            },
          },
          createdAt: Date.now(),
        });
      }
      
      // Move to next chunk with overlap
      startIdx = endIdx - overlap;
      if (startIdx >= text.length) break;
    }
  }
  
  console.log(`[Gemini Chunker] Created ${chunks.length} simple chunks`);
  return chunks;
}

/**
 * Store chunks in IndexedDB (similar to Chunkr version but for Gemini chunks)
 */
async function storeGeminiChunks(chunks: ChunkRecord[]): Promise<void> {
  console.log(`[Gemini Chunker] Storing ${chunks.length} chunks in IndexedDB...`);

  for (let i = 0; i < chunks.length; i++) {
    try {
      await putChunk(chunks[i]);
      
      if (i % 10 === 0) {
        console.log(`[Gemini Chunker] Stored chunk ${i + 1}/${chunks.length}`);
      }
    } catch (error) {
      console.error(`[Gemini Chunker] Failed to store chunk ${i}:`, error);
      throw error;
    }
  }

  console.log(`[Gemini Chunker] Successfully stored all ${chunks.length} chunks`);
}

/**
 * Clear the uploaded files cache (useful for testing or forcing reupload)
 */
export function clearUploadCache(docHash?: string): void {
  if (docHash) {
    uploadedFilesCache.delete(docHash);
    console.log(`[Gemini Chunker] Cleared cache for document: ${docHash}`);
  } else {
    uploadedFilesCache.clear();
    console.log(`[Gemini Chunker] Cleared entire upload cache`);
  }
}

/**
 * Get cache statistics
 */
export function getCacheStats(): { size: number; entries: Array<{ docHash: string; age: number; fileName: string }> } {
  const entries = Array.from(uploadedFilesCache.entries()).map(([docHash, data]) => ({
    docHash,
    age: Date.now() - data.uploadedAt,
    fileName: data.fileName,
  }));
  
  return {
    size: uploadedFilesCache.size,
    entries,
  };
}

/**
 * Main function: Process PDF with Gemini-based chunking
 * This is the entry point for Gemini chunking workflow
 */
export async function processWithGeminiChunking(
  docHash: string,
  fileUrl?: string,
  uploadId?: string
): Promise<ChunkRecord[]> {
  console.log('[Gemini Chunker] Starting Gemini-based chunking...');
  console.log('[Gemini Chunker] Multimodal parsing enabled:', USE_MULTIMODAL_PDF_PARSING);
  
  try {
    let chunks: ChunkRecord[];

    if (USE_MULTIMODAL_PDF_PARSING) {
      // NEW APPROACH: Use Gemini multimodal to parse PDF directly (includes images/tables)
      console.log('[Gemini Chunker] Using multimodal PDF parsing (includes images/tables)...');
      
      try {
        // Step 1: Upload PDF to Gemini File API (with caching)
        const { uri, mimeType } = await uploadPDFToGemini(docHash, fileUrl, uploadId);
        
        // Step 2: Parse with Gemini multimodal model
        chunks = await parseMultimodalPDF(uri, mimeType, docHash);
      } catch (multimodalError) {
        console.warn('[Gemini Chunker] Multimodal parsing failed, falling back to text-based approach:', multimodalError);
        
        // Fallback to text-based chunking
        const pages = await extractPDFText(fileUrl, uploadId);
        
        try {
          chunks = await buildSemanticChunks(pages, docHash);
        } catch (semanticError) {
          console.warn('[Gemini Chunker] Semantic chunking failed, using simple chunking:', semanticError);
          chunks = createSimpleChunks(pages, docHash);
        }
      }
    } else {
      // OLD APPROACH: Extract text first, then chunk (text only)
      console.log('[Gemini Chunker] Using text-based parsing (text only)...');
      
      // Step 1: Extract text from PDF
      const pages = await extractPDFText(fileUrl, uploadId);
      
      if (pages.length === 0) {
        throw new Error('No pages extracted from PDF');
      }

      // Step 2: Build semantic chunks using Gemini
      try {
        chunks = await buildSemanticChunks(pages, docHash);
      } catch (error) {
        console.warn('[Gemini Chunker] Gemini chunking failed, falling back to simple chunking:', error);
        // Fallback to simple chunking if Gemini fails
        chunks = createSimpleChunks(pages, docHash);
      }
    }

    if (chunks.length === 0) {
      throw new Error('No chunks created');
    }

    // Step 3: Store chunks in IndexedDB
    await storeGeminiChunks(chunks);

    console.log(`[Gemini Chunker] Successfully completed Gemini chunking: ${chunks.length} chunks created`);
    return chunks;
  } catch (error) {
    console.error('[Gemini Chunker] Error in Gemini chunking workflow:', error);
    throw error;
  }
}

