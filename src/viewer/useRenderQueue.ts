import { useRef, useCallback } from 'react';
import type { PDFPageProxy } from 'pdfjs-dist';

export interface RenderTask {
  pageNum: number;
  priority: number;
  page: PDFPageProxy;
  canvas: HTMLCanvasElement;
  textLayerDiv: HTMLDivElement | null;
  scale: number;
  resolve: () => void;
  reject: (error: Error) => void;
}

export interface RenderQueue {
  enqueue: (
    pageNum: number,
    page: PDFPageProxy,
    canvas: HTMLCanvasElement,
    textLayerDiv: HTMLDivElement | null,
    scale: number,
    priority: number
  ) => Promise<void>;
  cancel: () => void;
  clear: () => void;
}

export function useRenderQueue(): RenderQueue {
  const queueRef = useRef<RenderTask[]>([]);
  const currentTaskRef = useRef<{ cancel: () => void } | null>(null);
  const isRenderingRef = useRef(false);

  const processQueue = useCallback(async () => {
    if (isRenderingRef.current || queueRef.current.length === 0) return;

    // Sort by priority (lower number = higher priority)
    queueRef.current.sort((a, b) => a.priority - b.priority);

    const task = queueRef.current.shift();
    if (!task) return;

    isRenderingRef.current = true;

    try {
      const viewport = task.page.getViewport({ scale: task.scale });
      const context = task.canvas.getContext('2d');
      if (!context) throw new Error('Canvas context not available');

      const dpr = window.devicePixelRatio || 1;

      // Set canvas bitmap size
      task.canvas.width = viewport.width * dpr;
      task.canvas.height = viewport.height * dpr;

      // Set CSS size
      task.canvas.style.width = `${viewport.width}px`;
      task.canvas.style.height = `${viewport.height}px`;

      // Scale context
      context.scale(dpr, dpr);

      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      };

      const renderTask = task.page.render(renderContext);
      currentTaskRef.current = { cancel: () => renderTask.cancel() };

      await renderTask.promise;

      // Render text layer for text selection
      if (task.textLayerDiv) {
        try {
          const textContent = await task.page.getTextContent();
          task.textLayerDiv.innerHTML = ''; // Clear previous content

          // Set text layer to match viewport dimensions (CSS pixels, not canvas pixels)
          task.textLayerDiv.style.width = `${viewport.width}px`;
          task.textLayerDiv.style.height = `${viewport.height}px`;

          // Render text items with proper viewport transformation
          textContent.items.forEach((item: any) => {
            const textDiv = document.createElement('span');
            textDiv.textContent = item.str;
            textDiv.style.position = 'absolute';
            textDiv.style.whiteSpace = 'pre';
            textDiv.style.transformOrigin = 'left bottom';

            // Transform matrix: [a, b, c, d, e, f]
            // where: x' = a*x + c*y + e, y' = b*x + d*y + f
            const tx = item.transform;

            // Get the transformed position using viewport transform
            // The viewport already has the scale applied, so we use its transform
            const transform = viewport.transform;

            // Apply viewport transformation to the text position
            // viewport.transform is [scaleX, 0, 0, -scaleY, offsetX, offsetY]
            const x = transform[0] * tx[4] + transform[2] * tx[5] + transform[4];
            const y = transform[1] * tx[4] + transform[3] * tx[5] + transform[5];

            // Calculate font size - use the vertical scale from the transform
            const fontHeight = Math.abs(tx[3]);
            const fontSize = fontHeight * viewport.scale;

            // Calculate width if available
            if (item.width) {
              const width = item.width * viewport.scale;
              textDiv.style.width = `${width}px`;
            }

            // Position the text - adjust for baseline
            textDiv.style.left = `${x}px`;
            // Subtract fontSize to align at baseline (text renders from baseline up)
            textDiv.style.top = `${y - fontSize}px`;
            textDiv.style.fontSize = `${fontSize}px`;
            textDiv.style.fontFamily = item.fontName || 'sans-serif';

            // Handle rotation/skew
            const hasRotation = tx[0] !== 1 || tx[1] !== 0 || tx[2] !== 0 || tx[3] !== 1;
            if (hasRotation) {
              const scaleX = Math.sqrt(tx[0] * tx[0] + tx[1] * tx[1]);
              const scaleY = Math.sqrt(tx[2] * tx[2] + tx[3] * tx[3]);
              const angle = Math.atan2(tx[1], tx[0]);

              textDiv.style.transform = `rotate(${angle}rad) scaleX(${scaleX / scaleY})`;
            }

            task.textLayerDiv!.appendChild(textDiv);
          });
        } catch (err) {
          console.error('Failed to render text layer:', err);
        }
      }

      task.resolve();
    } catch (error: any) {
      if (error?.name !== 'RenderingCancelledException') {
        console.error('Render error:', error);
        task.reject(error);
      }
    } finally {
      isRenderingRef.current = false;
      currentTaskRef.current = null;
      processQueue(); // Process next task
    }
  }, []);

  const enqueue = useCallback(
    (
      pageNum: number,
      page: PDFPageProxy,
      canvas: HTMLCanvasElement,
      textLayerDiv: HTMLDivElement | null,
      scale: number,
      priority: number
    ): Promise<void> => {
      return new Promise((resolve, reject) => {
        // Cancel current task if it's for the same page
        if (currentTaskRef.current && queueRef.current.length === 0) {
          // If we're currently rendering and no queue, the current task is being processed
          // We'll let it finish naturally and the queue will handle the new one
        }

        // Remove existing queued tasks for same page
        const removedTasks = queueRef.current.filter(t => t.pageNum === pageNum);
        queueRef.current = queueRef.current.filter(t => t.pageNum !== pageNum);

        // Silently reject removed tasks (this is expected during rapid zoom)
        removedTasks.forEach(t => {
          const cancelError = new Error('RenderingCancelledException');
          cancelError.name = 'RenderingCancelledException';
          t.reject(cancelError);
        });

        queueRef.current.push({
          pageNum,
          priority,
          page,
          canvas,
          scale,
          textLayerDiv,
          resolve,
          reject,
        });

        processQueue();
      });
    },
    [processQueue]
  );

  const cancel = useCallback(() => {
    if (currentTaskRef.current) {
      currentTaskRef.current.cancel();
      currentTaskRef.current = null;
    }
  }, []);

  const clear = useCallback(() => {
    cancel();
    queueRef.current = [];
  }, [cancel]);

  return { enqueue, cancel, clear };
}

// Memory management: keep track of rendered canvases
const MAX_RENDERED_PAGES = 10;

export class CanvasCache {
  private cache = new Map<number, { canvas: HTMLCanvasElement; lastUsed: number }>();

  add(pageNum: number, canvas: HTMLCanvasElement) {
    this.cache.set(pageNum, { canvas, lastUsed: Date.now() });
    this.evict();
  }

  get(pageNum: number): HTMLCanvasElement | undefined {
    const entry = this.cache.get(pageNum);
    if (entry) {
      entry.lastUsed = Date.now();
      return entry.canvas;
    }
    return undefined;
  }

  has(pageNum: number): boolean {
    return this.cache.has(pageNum);
  }

  private evict() {
    if (this.cache.size <= MAX_RENDERED_PAGES) return;

    // Sort by last used, remove oldest
    const entries = Array.from(this.cache.entries()).sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    const toRemove = entries.slice(0, this.cache.size - MAX_RENDERED_PAGES);

    toRemove.forEach(([pageNum, entry]) => {
      // Clear canvas to free memory
      const ctx = entry.canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, entry.canvas.width, entry.canvas.height);
      }
      entry.canvas.width = 0;
      entry.canvas.height = 0;
      this.cache.delete(pageNum);
      console.log(`Evicted page ${pageNum} from canvas cache`);
    });
  }

  clear() {
    this.cache.forEach((entry) => {
      const ctx = entry.canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, entry.canvas.width, entry.canvas.height);
      }
      entry.canvas.width = 0;
      entry.canvas.height = 0;
    });
    this.cache.clear();
  }
}
