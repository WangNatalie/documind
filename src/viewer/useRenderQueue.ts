import { useRef, useCallback } from 'react';
import type { PDFPageProxy } from 'pdfjs-dist';

export interface RenderTask {
  pageNum: number;
  priority: number;
  page: PDFPageProxy;
  canvas: HTMLCanvasElement;
  scale: number;
  resolve: () => void;
  reject: (error: Error) => void;
}

export interface RenderQueue {
  enqueue: (pageNum: number, page: PDFPageProxy, canvas: HTMLCanvasElement, scale: number, priority: number) => Promise<void>;
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
    (pageNum: number, page: PDFPageProxy, canvas: HTMLCanvasElement, scale: number, priority: number): Promise<void> => {
      return new Promise((resolve, reject) => {
        // Remove existing task for same page
        queueRef.current = queueRef.current.filter(t => t.pageNum !== pageNum);

        queueRef.current.push({
          pageNum,
          priority,
          page,
          canvas,
          scale,
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
