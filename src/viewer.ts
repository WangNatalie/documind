import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdf.worker.mjs');

// Import utilities
import { IndexedDBManager } from './db';
import { ChunkrService } from './services/chunkr';
import { GeminiService } from './services/gemini';
import { EmbeddingService } from './services/embedding';

// State management
let pdfDoc: PDFDocumentProxy | null = null;
let currentPage = 1;
let scale = 1.5;
let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let pdfUrl: string;
let dbManager: IndexedDBManager;
let chunks: any[] = [];
let tocItems: any[] = [];

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Documind viewer initializing...');
  
  // Get elements
  canvas = document.getElementById('pdfCanvas') as HTMLCanvasElement;
  ctx = canvas.getContext('2d')!;
  
  // Initialize DB
  dbManager = new IndexedDBManager();
  await dbManager.init();
  
  // Get PDF URL from query params
  const urlParams = new URLSearchParams(window.location.search);
  pdfUrl = urlParams.get('file') || '';
  
  if (!pdfUrl) {
    showError('No PDF file specified');
    return;
  }
  
  // Load PDF
  await loadPDF(pdfUrl);
  
  // Load last page from DB
  const lastPage = await dbManager.getLastPage(pdfUrl);
  if (lastPage) {
    currentPage = lastPage;
  }
  
  // Render first page
  await renderPage(currentPage);
  
  // Set up event listeners
  setupEventListeners();
  
  // Process PDF for AI features
  await processPDFWithAI();
});

async function loadPDF(url: string) {
  try {
    const loadingTask = pdfjsLib.getDocument(url);
    pdfDoc = await loadingTask.promise;
    document.getElementById('pageCount')!.textContent = pdfDoc.numPages.toString();
    console.log('PDF loaded:', pdfDoc.numPages, 'pages');
  } catch (error) {
    console.error('Error loading PDF:', error);
    showError('Failed to load PDF');
  }
}

async function renderPage(pageNum: number) {
  if (!pdfDoc) return;
  
  try {
    const page: PDFPageProxy = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    
    const renderContext = {
      canvasContext: ctx,
      viewport: viewport
    };
    
    await page.render(renderContext).promise;
    
    // Update page info
    document.getElementById('pageNum')!.textContent = pageNum.toString();
    
    // Save current page to DB
    await dbManager.saveLastPage(pdfUrl, pageNum);
    
    // Update button states
    updateButtons();
    
    console.log('Rendered page:', pageNum);
  } catch (error) {
    console.error('Error rendering page:', error);
  }
}

function updateButtons() {
  const prevBtn = document.getElementById('prevPage') as HTMLButtonElement;
  const nextBtn = document.getElementById('nextPage') as HTMLButtonElement;
  
  prevBtn.disabled = currentPage <= 1;
  nextBtn.disabled = !pdfDoc || currentPage >= pdfDoc.numPages;
}

function setupEventListeners() {
  // Navigation buttons
  document.getElementById('prevPage')!.addEventListener('click', async () => {
    if (currentPage > 1) {
      currentPage--;
      await renderPage(currentPage);
    }
  });
  
  document.getElementById('nextPage')!.addEventListener('click', async () => {
    if (pdfDoc && currentPage < pdfDoc.numPages) {
      currentPage++;
      await renderPage(currentPage);
    }
  });
  
  // Zoom buttons
  document.getElementById('zoomIn')!.addEventListener('click', async () => {
    scale += 0.2;
    updateZoomDisplay();
    await renderPage(currentPage);
  });
  
  document.getElementById('zoomOut')!.addEventListener('click', async () => {
    if (scale > 0.5) {
      scale -= 0.2;
      updateZoomDisplay();
      await renderPage(currentPage);
    }
  });
  
  // Sidebar toggle
  const sidebar = document.getElementById('sidebar')!;
  const sidebarToggle = document.getElementById('sidebarToggle')!;
  const closeSidebar = document.getElementById('closeSidebar')!;
  
  sidebarToggle.addEventListener('click', () => {
    sidebar.classList.toggle('open');
  });
  
  closeSidebar.addEventListener('click', () => {
    sidebar.classList.remove('open');
  });
  
  // Keyboard shortcuts
  document.addEventListener('keydown', async (e) => {
    if (e.key === 'ArrowLeft' && currentPage > 1) {
      currentPage--;
      await renderPage(currentPage);
    } else if (e.key === 'ArrowRight' && pdfDoc && currentPage < pdfDoc.numPages) {
      currentPage++;
      await renderPage(currentPage);
    }
  });
}

function updateZoomDisplay() {
  const zoomPercent = Math.round(scale * 100);
  document.getElementById('zoomLevel')!.textContent = zoomPercent + '%';
}

async function processPDFWithAI() {
  if (!pdfDoc) return;
  
  try {
    // Check if we already have processed this PDF
    const cachedChunks = await dbManager.getChunks(pdfUrl);
    
    if (cachedChunks && cachedChunks.length > 0) {
      chunks = cachedChunks;
      console.log('Loaded cached chunks:', chunks.length);
      await generateTOC();
      return;
    }
    
    // Extract text from PDF
    const fullText = await extractTextFromPDF();
    
    // Process with Chunkr.ai
    console.log('Processing with Chunkr.ai...');
    const chunkrService = new ChunkrService();
    const semanticChunks = await chunkrService.chunkDocument(fullText);
    chunks = semanticChunks;
    
    // Generate embeddings for each chunk
    console.log('Generating embeddings...');
    const embeddingService = new EmbeddingService();
    await embeddingService.init();
    
    for (const chunk of chunks) {
      chunk.embedding = await embeddingService.generateEmbedding(chunk.text);
    }
    
    // Save chunks with embeddings to IndexedDB
    await dbManager.saveChunks(pdfUrl, chunks);
    
    // Generate table of contents
    await generateTOC();
    
    console.log('AI processing complete');
  } catch (error) {
    console.error('Error processing PDF with AI:', error);
    showTOCError('Failed to generate AI features. Check API keys.');
  }
}

async function extractTextFromPDF(): Promise<string> {
  if (!pdfDoc) return '';
  
  const textParts: string[] = [];
  
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(' ');
    textParts.push(pageText);
  }
  
  return textParts.join('\n\n');
}

async function generateTOC() {
  try {
    console.log('Generating table of contents...');
    const geminiService = new GeminiService();
    
    // Create summary of chunks for TOC generation
    const chunkSummaries = chunks.map((chunk, idx) => ({
      index: idx,
      preview: chunk.text.substring(0, 200)
    }));
    
    tocItems = await geminiService.generateTableOfContents(chunkSummaries);
    
    // Display TOC
    displayTOC(tocItems);
  } catch (error) {
    console.error('Error generating TOC:', error);
    showTOCError('Failed to generate table of contents');
  }
}

function displayTOC(items: any[]) {
  const container = document.getElementById('tocContainer')!;
  
  if (!items || items.length === 0) {
    container.innerHTML = '<div class="error">No table of contents available</div>';
    return;
  }
  
  container.innerHTML = '';
  
  items.forEach((item, index) => {
    const div = document.createElement('div');
    div.className = 'toc-item';
    div.innerHTML = `
      <div class="toc-item-title">${escapeHtml(item.title)}</div>
      <div class="toc-item-page">Page ${item.page || '?'}</div>
    `;
    
    div.addEventListener('click', async () => {
      if (item.page) {
        currentPage = item.page;
        await renderPage(currentPage);
        
        // Highlight active item
        document.querySelectorAll('.toc-item').forEach(el => el.classList.remove('active'));
        div.classList.add('active');
      }
    });
    
    container.appendChild(div);
  });
}

function showError(message: string) {
  const container = document.getElementById('viewerContainer')!;
  container.innerHTML = `<div class="error">${escapeHtml(message)}</div>`;
}

function showTOCError(message: string) {
  const container = document.getElementById('tocContainer')!;
  container.innerHTML = `<div class="error">${escapeHtml(message)}</div>`;
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Update zoom display on load
updateZoomDisplay();
