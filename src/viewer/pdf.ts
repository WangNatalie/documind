import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

// Set worker source - will be bundled by vite
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).href;

export { pdfjsLib };
export type { PDFDocumentProxy, PDFPageProxy };

export interface LoadPDFOptions {
  data?: ArrayBuffer;
  url?: string;
  withCredentials?: boolean;
}

export async function loadPDF(options: LoadPDFOptions): Promise<PDFDocumentProxy> {
  try {
    const loadingTask = pdfjsLib.getDocument(options);
    return await loadingTask.promise;
  } catch (error) {
    console.error('Failed to load PDF:', error);
    throw error;
  }
}

export async function getPageViewport(
  page: PDFPageProxy,
  scale: number,
  rotation = 0
) {
  return page.getViewport({ scale, rotation });
}

export function calculateScale(
  page: PDFPageProxy,
  containerWidth: number,
  containerHeight: number,
  mode: 'fitWidth' | 'fitPage' | number
): number {
  const viewport = page.getViewport({ scale: 1 });

  if (mode === 'fitWidth') {
    return containerWidth / viewport.width;
  } else if (mode === 'fitPage') {
    const widthScale = containerWidth / viewport.width;
    const heightScale = containerHeight / viewport.height;
    return Math.min(widthScale, heightScale) * 1.03;
  } else {
    // Fixed percentage - adjust for typical screen DPI (96 DPI vs PDF's 72 DPI)
    // This makes 100% zoom match what users expect in typical PDF viewers
    const dpiAdjustment = 2.1;
    return (mode / 100) * dpiAdjustment;
  }
}

export async function renderPageToCanvas(
  page: PDFPageProxy,
  canvas: HTMLCanvasElement,
  scale: number
): Promise<void> {
  const viewport = await getPageViewport(page, scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas context not available');

  const dpr = window.devicePixelRatio || 1;

  // Set canvas bitmap size (high DPI)
  canvas.width = viewport.width * dpr;
  canvas.height = viewport.height * dpr;

  // Set CSS size (logical pixels)
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;

  // Scale context to match DPI
  context.scale(dpr, dpr);

  const renderContext = {
    canvasContext: context,
    viewport: viewport,
  };

  await page.render(renderContext).promise;
}
