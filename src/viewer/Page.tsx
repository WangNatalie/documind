import React, { useEffect, useRef, useState } from 'react';
import type { PDFPageProxy } from 'pdfjs-dist';

interface PageProps {
  pageNum: number;
  page: PDFPageProxy | null;
  scale: number;
  isVisible: boolean;
  onRender: (pageNum: number, canvas: HTMLCanvasElement, priority: number) => Promise<void>;
}

export const Page: React.FC<PageProps> = ({ pageNum, page, scale, isVisible, onRender }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasRenderedRef = useRef(false);

  useEffect(() => {
    if (!page || !canvasRef.current) return;

    const render = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const priority = isVisible ? 1 : 10;
        await onRender(pageNum, canvasRef.current!, priority);

        hasRenderedRef.current = true;
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
  }, [page, scale, pageNum, onRender, isVisible]);

  // Get approximate dimensions for skeleton
  const viewport = page?.getViewport({ scale: scale || 1 });
  const width = viewport?.width || 800;
  const height = viewport?.height || 1000;

  return (
    <div
      data-page-num={pageNum}
      className="relative mx-auto my-4 shadow-lg"
      style={{ width: `${width}px`, minHeight: `${height}px` }}
    >
      {isLoading && (
        <div
          className="absolute inset-0 bg-neutral-100 dark:bg-neutral-800 animate-pulse flex items-center justify-center"
          style={{ width: `${width}px`, height: `${height}px` }}
        >
          <span className="text-neutral-400 dark:text-neutral-600">Loading page {pageNum}...</span>
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

      <canvas
        ref={canvasRef}
        className={`block ${isLoading || error ? 'invisible' : 'visible'}`}
      />
    </div>
  );
};
