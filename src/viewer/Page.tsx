import React, { useEffect, useRef, useState, useCallback } from "react";
import type { PDFPageProxy } from "pdfjs-dist";

interface PageProps {
  pageNum: number;
  page: PDFPageProxy | null;
  scale: number;
  isVisible: boolean;
  shouldRender: boolean;
  onRender: (
    pageNum: number,
    canvas: HTMLCanvasElement,
    textLayerDiv: HTMLDivElement | null,
    priority: number
  ) => Promise<void>;
  notes?: Array<{
    id: string;
    rects: { top: number; left: number; width: number; height: number }[];
    color: string;
    text?: string;
  }>;
  comments?: Array<{
    id: string;
    rects: { top: number; left: number; width: number; height: number }[];
    text: string;
    page: number;
  }>;
}

export const Page: React.FC<PageProps> = ({
  pageNum,
  page,
  scale,
  isVisible,
  shouldRender,
  onRender,
  notes = [],
  comments = [],
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const renderedScaleRef = useRef<number>(0);

  // Helper function to merge rects into contiguous lines
  const mergeRectsIntoLines = useCallback(
    (
      rects: Array<{
        top: number;
        left: number;
        width: number;
        height: number;
      }>,
      pageWidth: number,
      pageHeight: number
    ) => {
      if (!rects || rects.length === 0) return [];

      // Convert to pixel coordinates if normalized
      const pixelRects = rects.map((r) => {
        const isNormalized =
          Math.abs(r.top) <= 1 &&
          Math.abs(r.left) <= 1 &&
          Math.abs(r.width) <= 1 &&
          Math.abs(r.height) <= 1;
        return {
          top: isNormalized ? r.top * pageHeight : r.top,
          left: isNormalized ? r.left * pageWidth : r.left,
          width: isNormalized ? r.width * pageWidth : r.width,
          height: isNormalized ? r.height * pageHeight : r.height,
        };
      });

      // Group rects by line using midpoint Y position
      const mergedLines: Array<{
        top: number;
        left: number;
        width: number;
        height: number;
      }> = [];
      const lineThreshold = 5; // pixels - if midpoints are within this, consider same line

      pixelRects.forEach((rect) => {
        const rectMidY = rect.top + rect.height / 2;

        // Find if this rect belongs to an existing line based on Y midpoint
        const existingLine = mergedLines.find((line) => {
          const lineMidY = line.top + line.height / 2;
          return Math.abs(rectMidY - lineMidY) < lineThreshold;
        });

        if (existingLine) {
          // Merge: extend horizontally to create one contiguous block
          const leftmost = Math.min(existingLine.left, rect.left);
          const rightmost = Math.max(
            existingLine.left + existingLine.width,
            rect.left + rect.width
          );
          const topmost = Math.min(existingLine.top, rect.top);
          const bottommost = Math.max(
            existingLine.top + existingLine.height,
            rect.top + rect.height
          );
          existingLine.left = leftmost;
          existingLine.width = rightmost - leftmost;
          existingLine.top = topmost;
          existingLine.height = bottommost - topmost;
        } else {
          // New line
          mergedLines.push({ ...rect });
        }
      });

      return mergedLines;
    },
    []
  );

  useEffect(() => {
    if (!page || !canvasRef.current || !shouldRender) {
      // Reset rendered scale when page is not being rendered
      if (!shouldRender) {
        console.log(`[Page ${pageNum}] Unrendering - outside buffer`);
        renderedScaleRef.current = 0;
      }
      return;
    }

    // Skip re-render if scale hasn't changed significantly (avoid flashing)
    if (
      renderedScaleRef.current > 0 &&
      Math.abs(renderedScaleRef.current - scale) < 0.01
    ) {
      setIsLoading(false);
      return;
    }

    const render = async () => {
      try {
        console.log(
          `[Page ${pageNum}] Starting render - visible: ${isVisible}, priority: ${isVisible ? 1 : 10}`
        );
        setIsLoading(true);
        setError(null);

        const priority = isVisible ? 1 : 10;
        await onRender(
          pageNum,
          canvasRef.current!,
          textLayerRef.current,
          priority
        );

        renderedScaleRef.current = scale;
        setIsLoading(false);
        console.log(`[Page ${pageNum}] Render complete`);
      } catch (err: any) {
        if (err?.name !== "RenderingCancelledException") {
          console.error(`[Page ${pageNum}] Render error:`, err);
          setError(err.message || "Failed to render page");
          setIsLoading(false);
        } else {
          console.log(`[Page ${pageNum}] Render cancelled`);
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
    console.log(
      `[Page ${pageNum}] Rendering placeholder - outside buffer zone`
    );
    return (
      <div
        data-page-num={pageNum}
        className="relative mb-1 shadow-lg bg-neutral-100 dark:bg-neutral-800"
        style={{ width: `${width}px`, height: `${height}px` }}
      />
    );
  }

  return (
    <div
      data-page-num={pageNum}
      className="relative mb-1 shadow-lg transition-opacity duration-200"
      style={{ width: `${width}px`, minHeight: `${height}px` }}
    >
      {isLoading && (
        <div
          className="absolute inset-0 bg-neutral-100 dark:bg-neutral-800 animate-pulse flex items-center justify-center"
          style={{ width: `${width}px`, height: `${height}px` }}
        >
          <span className="text-neutral-400 dark:text-neutral-600 text-sm">
            Loading page {pageNum}...
          </span>
        </div>
      )}

      {error && (
        <div
          className="absolute inset-0 bg-red-50 dark:bg-red-900/20 border-2 border-red-300 dark:border-red-700 flex items-center justify-center"
          style={{ width: `${width}px`, height: `${height}px` }}
        >
          <div className="text-center p-4">
            <p className="text-red-700 dark:text-red-400 font-semibold mb-2">
              Error loading page {pageNum}
            </p>
            <p className="text-red-600 dark:text-red-500 text-sm">{error}</p>
          </div>
        </div>
      )}

      <div className="relative">
        <canvas
          ref={canvasRef}
          className={`block ${isLoading || error ? "invisible" : "visible"}`}
        />
        {/* Text layer for text selection (hidden visually but present for selection) */}
        <div
          ref={textLayerRef}
          className="absolute top-0 left-0 text-layer z-10 text-transparent"
          style={{ width: `${width}px`, height: `${height}px` }}
        />
        {/* Notes overlays - just colored highlights with hover tooltips */}
        {notes.map((n) => {
          const mergedLines = mergeRectsIntoLines(n.rects, width, height);
          const hasText = n.text && n.text.trim().length > 0;

          return (
            <div key={n.id} className={hasText ? "group" : ""}>
              {mergedLines.map((line, i) => (
                <div
                  key={`${n.id}-${i}`}
                  className={`absolute rounded-md z-20 ${
                    n.color === "yellow"
                      ? "bg-yellow-300/30"
                      : n.color === "green"
                        ? "bg-emerald-200/30"
                        : "bg-sky-200/30"
                  }`}
                  style={{
                    top: line.top,
                    left: line.left,
                    width: line.width,
                    height: line.height,
                    pointerEvents: hasText ? "auto" : "none",
                  }}
                />
              ))}
              {/* Show tooltip on hover if note has text */}
              {hasText && (
                <div
                  className="invisible group-hover:visible absolute bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 rounded-md px-2 py-1 text-xs text-neutral-900 dark:text-neutral-100 shadow-lg whitespace-nowrap z-40"
                  style={{
                    top: mergedLines[0].top - 28,
                    left: mergedLines[0].left,
                  }}
                >
                  {n.text}
                </div>
              )}
            </div>
          );
        })}

        {/* Comments: render overline and permanently visible side comment like Google Docs */}
        {comments.map((c) => {
          // Skip comments without rects array (data migration issue)
          if (!c.rects || !Array.isArray(c.rects) || c.rects.length === 0) {
            console.warn("Comment missing rects array:", c.id);
            return null;
          }

          const mergedLines = mergeRectsIntoLines(c.rects, width, height);

          return (
            <div key={c.id}>
              {/* Overline on text with edge brackets */}
              {mergedLines.map((line, i) => (
                <React.Fragment key={`${c.id}-overline-${i}`}>
                  {/* Horizontal overline bar */}
                  <div
                    className="absolute h-0.5 bg-yellow-500 z-30"
                    style={{
                      top: line.top + 3,
                      left: line.left,
                      width: line.width,
                    }}
                  />
                  {/* Left edge border - extends down halfway */}
                  <div
                    className="absolute w-0.5 bg-yellow-500 z-30"
                    style={{
                      top: line.top + 3,
                      left: line.left,
                      height: `${line.height / 2}px`,
                    }}
                  />
                  {/* Right edge border - extends down halfway */}
                  <div
                    className="absolute w-0.5 bg-yellow-500 z-30"
                    style={{
                      top: line.top + 3,
                      left: line.left + line.width,
                      height: `${line.height / 2}px`,
                    }}
                  />
                </React.Fragment>
              ))}
              {/* Permanently visible side comment (Google Docs style) */}
              <div
                className="absolute bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 rounded-md p-2 text-xs text-neutral-900 dark:text-neutral-100 shadow-md z-40"
                style={{
                  top: mergedLines[0].top,
                  left: width + 16,
                  width: "200px",
                  maxWidth: "200px",
                }}
              >
                <div className="break-words">{c.text}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
