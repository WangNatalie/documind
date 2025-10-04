import { useRef, useCallback } from "react";
import type { PDFPageProxy } from "pdfjs-dist";

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
  touch?: (pageNum: number) => void; // optional; only available if caller supplies CanvasCache instance
}

export function useRenderQueue(): RenderQueue {
  const queueRef = useRef<RenderTask[]>([]);
  const currentTaskRef = useRef<{ cancel: () => void; pageNum: number } | null>(
    null
  );
  const isRenderingRef = useRef(false);
  const renderingPagesRef = useRef<Set<number>>(new Set());

  const processQueue = useCallback(async () => {
    if (isRenderingRef.current || queueRef.current.length === 0) return;

    // Sort by priority (lower number = higher priority)
    queueRef.current.sort((a, b) => a.priority - b.priority);

    const task = queueRef.current.shift();
    if (!task) return;

    // Skip if this page is already being rendered (shouldn't happen but extra safety)
    if (renderingPagesRef.current.has(task.pageNum)) {
      console.warn(`Page ${task.pageNum} is already being rendered, skipping`);
      task.reject(new Error("Page already rendering"));
      processQueue(); // Try next task
      return;
    }

    isRenderingRef.current = true;
    renderingPagesRef.current.add(task.pageNum);

    try {
      const viewport = task.page.getViewport({ scale: task.scale });
      const context = task.canvas.getContext("2d");
      if (!context) throw new Error("Canvas context not available");

      const dpr = window.devicePixelRatio || 1;
      const newWidth = viewport.width * dpr;
      const newHeight = viewport.height * dpr;

      // Check if we need to resize the canvas
      const needsResize =
        task.canvas.width !== newWidth || task.canvas.height !== newHeight;

      if (needsResize) {
        // For resize, we need to save the old content to avoid flash
        // Create temporary canvas to preserve old content
        const tempCanvas = document.createElement("canvas");
        const tempContext = tempCanvas.getContext("2d");

        // Guard: Only copy old content if canvas has non-zero dimensions
        if (tempContext && task.canvas.width > 0 && task.canvas.height > 0) {
          // Copy old content
          tempCanvas.width = task.canvas.width;
          tempCanvas.height = task.canvas.height;
          tempContext.drawImage(task.canvas, 0, 0);

          // Resize main canvas (this clears it)
          task.canvas.width = newWidth;
          task.canvas.height = newHeight;
          task.canvas.style.width = `${viewport.width}px`;
          task.canvas.style.height = `${viewport.height}px`;

          // Draw old content back (scaled to fill) as placeholder
          // This prevents the flash by keeping something visible
          context.drawImage(
            tempCanvas,
            0,
            0,
            tempCanvas.width,
            tempCanvas.height,
            0,
            0,
            newWidth,
            newHeight
          );
        } else {
          // Fallback if we can't create temp canvas or canvas has zero dimensions
          task.canvas.width = newWidth;
          task.canvas.height = newHeight;
          task.canvas.style.width = `${viewport.width}px`;
          task.canvas.style.height = `${viewport.height}px`;
        }
      } else {
        // Same size, just clear and re-render
        context.clearRect(0, 0, task.canvas.width, task.canvas.height);
      }

      // Scale context for DPI
      context.save();
      context.scale(dpr, dpr);

      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      };

      const renderTask = task.page.render(renderContext);
      currentTaskRef.current = {
        cancel: () => renderTask.cancel(),
        pageNum: task.pageNum,
      };

      await renderTask.promise;

      // Restore context state
      context.restore();

      // Render text layer for text selection
      if (task.textLayerDiv) {
        try {
          const textContent = await task.page.getTextContent();
          task.textLayerDiv.innerHTML = ""; // Clear previous content

          // Set text layer to match viewport dimensions (CSS pixels, not canvas pixels)
          task.textLayerDiv.style.width = `${viewport.width}px`;
          task.textLayerDiv.style.height = `${viewport.height}px`;

          // Render text items with proper viewport transformation
          textContent.items.forEach((item: any) => {
            const textDiv = document.createElement("span");
            textDiv.textContent = item.str;
            textDiv.style.position = "absolute";
            textDiv.style.whiteSpace = "pre";
            textDiv.style.transformOrigin = "left bottom";

            // Transform matrix: [a, b, c, d, e, f]
            // where: x' = a*x + c*y + e, y' = b*x + d*y + f
            const tx = item.transform;

            // Get the transformed position using viewport transform
            // The viewport already has the scale applied, so we use its transform
            const transform = viewport.transform;

            // Apply viewport transformation to the text position
            // viewport.transform is [scaleX, 0, 0, -scaleY, offsetX, offsetY]
            const x =
              transform[0] * tx[4] + transform[2] * tx[5] + transform[4];
            const y =
              transform[1] * tx[4] + transform[3] * tx[5] + transform[5];

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
            textDiv.style.fontFamily = item.fontName || "sans-serif";

            // Handle rotation/skew
            const hasRotation =
              tx[0] !== 1 || tx[1] !== 0 || tx[2] !== 0 || tx[3] !== 1;
            if (hasRotation) {
              const scaleX = Math.sqrt(tx[0] * tx[0] + tx[1] * tx[1]);
              const scaleY = Math.sqrt(tx[2] * tx[2] + tx[3] * tx[3]);
              const angle = Math.atan2(tx[1], tx[0]);

              textDiv.style.transform = `rotate(${angle}rad) scaleX(${scaleX / scaleY})`;
            }

            task.textLayerDiv!.appendChild(textDiv);
          });
        } catch (err) {
          console.error("Failed to render text layer:", err);
        }
      }

      task.resolve();
    } catch (error: any) {
      if (error?.name !== "RenderingCancelledException") {
        console.error("Render error:", error);
        task.reject(error);
      } else {
        // Silently reject cancelled renders
        task.reject(error);
      }
    } finally {
      isRenderingRef.current = false;
      renderingPagesRef.current.delete(task.pageNum);
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
        // If we're currently rendering this same page, we need to cancel it and wait
        if (renderingPagesRef.current.has(pageNum)) {
          // This page is currently being rendered, cancel it
          if (
            currentTaskRef.current &&
            currentTaskRef.current.pageNum === pageNum
          ) {
            try {
              currentTaskRef.current.cancel();
            } catch (e) {
              // Cancellation might throw, ignore it
            }
          }
          // The finally block in processQueue will clean up renderingPagesRef
        }

        // Remove existing queued tasks for same page
        const removedTasks = queueRef.current.filter(
          (t) => t.pageNum === pageNum
        );
        queueRef.current = queueRef.current.filter(
          (t) => t.pageNum !== pageNum
        );

        // Silently reject removed tasks (this is expected during rapid zoom)
        removedTasks.forEach((t) => {
          const cancelError = new Error("RenderingCancelledException");
          cancelError.name = "RenderingCancelledException";
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

// isProtected: a predicate that returns true if a page should *not* be evicted right now
export class CanvasCache {
  private cache = new Map<
    number,
    { canvas: HTMLCanvasElement; lastUsed: number }
  >();
  private isProtected: (pageNum: number) => boolean;

  constructor(isProtected?: (pageNum: number) => boolean) {
    this.isProtected = isProtected || (() => false);
  }

  add(pageNum: number, canvas: HTMLCanvasElement) {
    this.cache.set(pageNum, { canvas, lastUsed: Date.now() });
    // Debug: log current cache keys before eviction
    if (typeof window !== "undefined") {
      console.log(
        "[CanvasCache] add page",
        pageNum,
        "cache size ->",
        this.cache.size,
        "keys:",
        Array.from(this.cache.keys())
      );
    }
    this.evict();
  }

  touch(pageNum: number): void {
    const entry = this.cache.get(pageNum);
    if (entry) {
      entry.lastUsed = Date.now();
    }
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

    // Separate protected vs evictable entries
    const evictableEntries = Array.from(this.cache.entries()).filter(
      ([pageNum]) => !this.isProtected(pageNum)
    );

    // If nothing we can evict (all protected), skip
    if (evictableEntries.length === 0) return;

    // Sort evictable pages by last used (LRU)
    evictableEntries.sort((a, b) => a[1].lastUsed - b[1].lastUsed);

    // Number of pages we need to remove based on total size beyond limit
    const excess = this.cache.size - MAX_RENDERED_PAGES;
    const toRemove = evictableEntries.slice(0, excess);

    toRemove.forEach(([pageNum]) => {
      // DON'T zero out width/height if the canvas is still currently displayed.
      // Just drop our reference; React virtualization will unmount stale pages.
      this.cache.delete(pageNum);
      console.log(`Evicted page ${pageNum} from canvas cache (non-visible)`);
    });
    if (toRemove.length > 0) {
      console.log(
        "[CanvasCache] post-evict keys:",
        Array.from(this.cache.keys())
      );
    }
  }

  clear() {
    this.cache.clear();
  }
}
