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
  onNoteDelete?: (id: string) => void;
  onNoteEdit?: (id: string, newText: string) => void;
  onCommentDelete?: (id: string) => void;
  onCommentEdit?: (id: string, newText: string) => void;
}

const ZOOM_DEBOUNCE_MS = 75;

const ZOOM_DEBOUNCE_MS = 75;

export const Page: React.FC<PageProps> = ({
  pageNum,
  page,
  scale,
  isVisible,
  shouldRender,
  onRender,
  notes = [],
  comments = [],
  onNoteDelete,
  onNoteEdit,
  onCommentDelete,
  onCommentEdit,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const renderedScaleRef = useRef<number>(0);
  const targetScaleRef = useRef<number>(0);
  const renderTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastCSSScaleRef = useRef<number>(0);

  // Rendering page component

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
        // Page moved outside render buffer, reset state
        renderedScaleRef.current = 0;
        targetScaleRef.current = 0;
        // Clear any pending render timeouts
        if (renderTimeoutRef.current) {
          clearTimeout(renderTimeoutRef.current);
          renderTimeoutRef.current = null;
        }
        // also reset any css scaling
        if (canvasRef.current) {
          canvasRef.current.style.transform = "";
          canvasRef.current.style.transformOrigin = "";
        }
      }
      return;
    }

    const canvas = canvasRef.current!;

    // If we've never rendered this page, do a full render
    if (!renderedScaleRef.current || renderedScaleRef.current === 0) {
      const doFullRender = async () => {
        try {
          setIsLoading(true);
          setError(null);

          const priority = isVisible ? 1 : 10;
          await onRender(pageNum, canvas, textLayerRef.current, priority);

          renderedScaleRef.current = scale;
          // ensure any CSS transform is reset after drawing
          canvas.style.transform = "";
          canvas.style.transformOrigin = "top left";
          setIsLoading(false);
        } catch (err: any) {
          if (err?.name !== "RenderingCancelledException") {
            console.error(`[Page ${pageNum}] Render error:`, err);
            setError(err.message || "Failed to render page");
            setIsLoading(false);
          }
        }
      };

      doFullRender();
      return;
    }

    // If we already have a rendered canvas at a previous scale, use progressive rendering:
    // 1. Immediately CSS-scale the existing canvas (instant feedback, may be blurry)
    // 2. Debounce and trigger a background re-render at the new scale for crisp quality
    // This matches PDF.js behavior where zoom is instant but quality improves after a moment
    const prevScale = renderedScaleRef.current;
    if (Math.abs(prevScale - scale) < 0.01) {
      // effectively same, no-op
      setIsLoading(false);
      return;
    }

    try {
      // Compute new viewport at the requested scale
      const newViewport = page.getViewport({ scale });

      // STEP 1: Immediately CSS-scale the existing canvas for instant visual feedback
      // This stretches the existing bitmap, which may look blurry but responds instantly
      canvas.style.width = `${newViewport.width}px`;
      canvas.style.height = `${newViewport.height}px`;
      canvas.style.transform = "";
      canvas.style.transformOrigin = "top left";

      setIsLoading(false);

      // Update target scale and track CSS scale
      targetScaleRef.current = scale;
      lastCSSScaleRef.current = scale;

      // STEP 2: Debounce the high-quality re-render to avoid multiple renders during rapid zooming
      // Clear any pending render
      if (renderTimeoutRef.current) {
        clearTimeout(renderTimeoutRef.current);
      }

      // Capture the current scale for the timeout closure
      const scaleToRender = scale;

      // Queue a high-quality re-render after a short delay (debounced)
      renderTimeoutRef.current = setTimeout(async () => {
        // Skip if target scale has changed since this timeout was set
        if (Math.abs(targetScaleRef.current - scaleToRender) > 0.01) {
          return;
        }

        // Skip if we've already rendered at this exact scale
        if (Math.abs(renderedScaleRef.current - scaleToRender) < 0.01) {
          return;
        }

        try {
          await onRender(pageNum, canvas, textLayerRef.current, isVisible ? 1 : 10);

          // Only update renderedScaleRef if we're still at the same target scale
          if (Math.abs(targetScaleRef.current - scaleToRender) < 0.01) {
            renderedScaleRef.current = scaleToRender;
            canvas.style.transform = "";
            canvas.style.transformOrigin = "top left";
          }
        } catch (err: any) {
          if (err?.name !== "RenderingCancelledException") {
            console.error(`[Page ${pageNum}] Render error:`, err);
            // Don't set error state since we already have a (scaled) version showing
          }
        }
      }, ZOOM_DEBOUNCE_MS); // debounce - wait for rapid zoom gestures to finish
    } catch (err: any) {
      console.error(`[Page ${pageNum}] Failed to CSS-scale canvas, falling back to full render:`, err);
      // Fallback: perform a full render
      const fallback = async () => {
        try {
          setIsLoading(true);
          await onRender(pageNum, canvas, textLayerRef.current, isVisible ? 1 : 10);
          renderedScaleRef.current = scale;
          canvas.style.transform = "";
          canvas.style.transformOrigin = "top left";
          setIsLoading(false);
        } catch (e: any) {
          console.error(`[Page ${pageNum}] Fallback render failed:`, e);
          setIsLoading(false);
        }
      };

      fallback();
    }
  }, [page, scale, pageNum, onRender, isVisible, shouldRender]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (renderTimeoutRef.current) {
        clearTimeout(renderTimeoutRef.current);
      }
    };
  }, []);

  // Get approximate dimensions for skeleton
  const viewport = page?.getViewport({ scale: scale || 1 });
  const width = viewport?.width || 800;
  const height = viewport?.height || 1000;

  if (!shouldRender) {
    // Render placeholder for pages outside buffer
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
          const isEditing = editingNoteId === n.id;

          return (
            <div key={n.id} className="group">
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
                    pointerEvents: "auto",
                  }}
                />
              ))}
              {/* Invisible bridge to connect highlight to tooltip - prevents gap */}
              <div
                className="absolute z-40 pointer-events-auto"
                style={{
                  top: mergedLines[0].top - 40,
                  left: mergedLines[0].left,
                  width: Math.max(mergedLines[0].width, 200),
                  height: 40 + mergedLines[0].height,
                }}
              />
              {/* Show tooltip/edit interface on hover if note has text or when editing */}
              {isEditing ? (
                <div
                  className="absolute bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 rounded-md p-1 shadow-lg z-40 flex gap-2"
                  style={{
                    top: mergedLines[0].top - 30,
                    left: mergedLines[0].left,
                    minWidth: "200px",
                  }}
                >
                  <input
                    autoFocus
                    type="text"
                    value={editingNoteText}
                    onChange={(e) => setEditingNoteText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && onNoteEdit) {
                        onNoteEdit(n.id, editingNoteText);
                        setEditingNoteId(null);
                      } else if (e.key === "Escape") {
                        setEditingNoteId(null);
                      }
                    }}
                    className="flex-1 px-2 py-1 text-xs bg-white dark:bg-neutral-700 border border-neutral-300 dark:border-neutral-600 rounded text-neutral-900 dark:text-neutral-100"
                  />
                  <button
                    onClick={() => {
                      if (onNoteEdit) {
                        onNoteEdit(n.id, editingNoteText);
                      }
                      setEditingNoteId(null);
                    }}
                    className="px-2 py-1 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded"
                    title="Save"
                  >
                    ✓
                  </button>
                  <button
                    onClick={() => setEditingNoteId(null)}
                    className="px-2 py-1 text-xs bg-neutral-200 hover:bg-neutral-300 dark:bg-neutral-700 dark:hover:bg-neutral-600 rounded"
                    title="Cancel"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div
                  className="invisible group-hover:visible absolute bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 rounded-md shadow-lg z-40 flex items-center gap-2 pointer-events-auto p-1"
                  style={{
                    top: mergedLines[0].top - 25,
                    left: mergedLines[0].left,
                  }}
                >
                  {hasText && (
                    <span className="p-0.5 text-xs text-neutral-900 dark:text-neutral-100 whitespace-nowrap">
                      {n.text}
                    </span>
                  )}
                  <button
                    onClick={() => {
                      setEditingNoteId(n.id);
                      setEditingNoteText(n.text || "");
                    }}
                    className="p-0.5 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded"
                    title="Edit note"
                  >
                    ✎
                  </button>
                  {onNoteDelete && (
                    <button
                      onClick={() => onNoteDelete(n.id)}
                      className="px-2 py-1 text-xs bg-red-500 hover:bg-red-600 text-white rounded mr-1"
                      title="Delete note"
                    >
                      🗑
                    </button>
                  )}
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
          const isEditing = editingCommentId === c.id;

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
                {isEditing ? (
                  <div className="flex flex-col gap-2">
                    <textarea
                      autoFocus
                      value={editingCommentText}
                      onChange={(e) => setEditingCommentText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && e.ctrlKey && onCommentEdit) {
                          onCommentEdit(c.id, editingCommentText);
                          setEditingCommentId(null);
                        } else if (e.key === "Escape") {
                          setEditingCommentId(null);
                        }
                      }}
                      className="w-full px-2 py-1 text-xs bg-white dark:bg-neutral-700 border border-neutral-300 dark:border-neutral-600 rounded text-neutral-900 dark:text-neutral-100 resize-y"
                      rows={5}
                    />
                    <div className="flex gap-1">
                      <button
                        onClick={() => {
                          if (onCommentEdit) {
                            onCommentEdit(c.id, editingCommentText);
                          }
                          setEditingCommentId(null);
                        }}
                        className="flex-1 px-2 py-1 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded"
                        title="Save (Ctrl+Enter)"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingCommentId(null)}
                        className="flex-1 px-2 py-1 text-xs bg-neutral-200 hover:bg-neutral-300 dark:bg-neutral-700 dark:hover:bg-neutral-600 rounded"
                        title="Cancel (Esc)"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="break-words mb-2">{c.text}</div>
                    <div className="flex gap-1 border-t border-yellow-200 dark:border-yellow-800 pt-2">
                      <button
                        onClick={() => {
                          setEditingCommentId(c.id);
                          setEditingCommentText(c.text);
                        }}
                        className="flex-1 px-2 py-1 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded"
                        title="Edit comment"
                      >
                        Edit
                      </button>
                      {onCommentDelete && (
                        <button
                          onClick={() => onCommentDelete(c.id)}
                          className="flex-1 px-2 py-1 text-xs bg-red-500 hover:bg-red-600 text-white rounded"
                          title="Delete comment"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};