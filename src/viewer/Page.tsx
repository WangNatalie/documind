import React, { useEffect, useRef, useState } from 'react';
import type { PDFPageProxy } from 'pdfjs-dist';

interface PageProps {
  pageNum: number;
  page: PDFPageProxy | null;
  scale: number;
  isVisible: boolean;
  shouldRender: boolean;
  onRender: (pageNum: number, canvas: HTMLCanvasElement, textLayerDiv: HTMLDivElement | null, priority: number) => Promise<void>;
}

export const Page: React.FC<PageProps> = ({ pageNum, page, scale, isVisible, shouldRender, onRender }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const renderedScaleRef = useRef<number>(0);

  useEffect(() => {
    if (!page || !canvasRef.current || !shouldRender) return;

    // Skip re-render if scale hasn't changed significantly (avoid flashing)
    if (Math.abs(renderedScaleRef.current - scale) < 0.01) {
      setIsLoading(false);
      return;
    }

    const render = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const priority = isVisible ? 1 : 10;
        await onRender(pageNum, canvasRef.current!, textLayerRef.current, priority);

        renderedScaleRef.current = scale;
        setIsLoading(false);
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.error(`Error rendering page ${pageNum}:`, err);
          setError(err.message || 'Failed to render page');
          setIsLoading(false);
        }
      }
    };

    render();
  }, [page, scale, pageNum, onRender, isVisible, shouldRender]);

  // Get approximate dimensions for skeleton
  const viewport = page?.getViewport({ scale: scale || 1 });
  const width = viewport?.width || 800;
  const height = viewport?.height || 1000;

  if (!shouldRender) {
    // Render placeholder for pages outside buffer
    return (
      <div
        data-page-num={pageNum}
        className="relative my-4 shadow-lg bg-neutral-100 dark:bg-neutral-800"
        style={{ width: `${width}px`, height: `${height}px` }}
      />
    );
  }

  return (
    <div
      data-page-num={pageNum}
      className="relative my-4 shadow-lg transition-opacity duration-200"
      style={{ width: `${width}px`, minHeight: `${height}px` }}
    >
      {isLoading && (
        <div
          className="absolute inset-0 bg-neutral-100 dark:bg-neutral-800 animate-pulse flex items-center justify-center"
          style={{ width: `${width}px`, height: `${height}px` }}
        >
          <span className="text-neutral-400 dark:text-neutral-600 text-sm">Loading page {pageNum}...</span>
        </div>
      )}

      {error && (
        <div
          className="absolute inset-0 bg-red-50 dark:bg-red-900/20 border-2 border-red-300 dark:border-red-700 flex items-center justify-center"
          style={{ width: `${width}px`, height: `${height}px` }}
        >
          <div className="text-center p-4">
            <p className="text-red-700 dark:text-red-400 font-semibold mb-2">Error loading page {pageNum}</p>
            <p className="text-red-600 dark:text-red-500 text-sm">{error}</p>
          </div>
        </div>
      )}

      <div className="relative">
        <canvas
          ref={canvasRef}
          className={`block ${isLoading || error ? 'invisible' : 'visible'}`}
        />
        {/* Text layer for text selection */}
        <div
          ref={textLayerRef}
          className="absolute top-0 left-0 text-layer"
          style={{ width: `${width}px`, height: `${height}px` }}
        />
      </div>
    </div>
  );
};
