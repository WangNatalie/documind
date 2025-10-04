import React, { useEffect, useState, useRef, useCallback } from "react";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { loadPDF, calculateScale } from "./pdf";
import { Page } from "./Page";
import { Toolbar } from "./Toolbar";
import { useRenderQueue, CanvasCache } from "./useRenderQueue";
import { parseHash, updateHash } from "../utils/hash";
import { generateDocHash } from "../utils/hash";
import {
  getDoc,
  putDoc,
  updateDocState,
  putHighlight,
  getHighlightsByDoc,
  putNote,
  getNotesByDoc,
} from "../db";
import { readOPFSFile } from "../db/opfs";
import ContextMenu from "./ContextMenu";
import { requestChunking } from "../utils/chunker-client";

const ZOOM_LEVELS = [50, 75, 90, 100, 125, 150, 175, 200, 250, 300];

export const ViewerApp: React.FC = () => {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pages, setPages] = useState<(PDFPageProxy | null)[]>([]);
  const [currentPage, setCurrentPage] = useState(1);

  const [zoom, setZoom] = useState<string>("fitPage");
  const [scale, setScale] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [docHash, setDocHash] = useState<string>("");
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  const containerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const renderQueue = useRenderQueue();
  const canvasCacheRef = useRef(new CanvasCache());
  const visiblePagesRef = useRef<Set<number>>(new Set([1]));
  // Context menu state
  const [contextVisible, setContextVisible] = useState(false);
  const [contextPos, setContextPos] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const [highlights, setHighlights] = useState<Array<any>>([]);
  const [notes, setNotes] = useState<Array<any>>([]);
  const [noteInput, setNoteInput] = useState<string>("");
  const [noteAnchor, setNoteAnchor] = useState<{
    x: number;
    y: number;
    page: number;
    range: Range;
  } | null>(null);

  // Parse URL params
  const params = new URLSearchParams(window.location.search);
  const fileUrl = params.get("file");
  const uploadId = params.get("uploadId");
  const fileName = params.get("name") || "document.pdf";

  // Load PDF on mount
  useEffect(() => {
    const loadDocument = async () => {
      try {
        setLoading(true);
        setError(null);

        let pdfDoc: PDFDocumentProxy;
        let source: { type: "url" | "uploadId"; value: string };
        let hash: string;

        if (uploadId) {
          // Load from OPFS
          source = { type: "uploadId", value: uploadId };
          const arrayBuffer = await readOPFSFile(uploadId);

          // Generate hash from file metadata
          const firstBytes = arrayBuffer.slice(0, 64 * 1024);
          const lastBytes = arrayBuffer.slice(-64 * 1024);
          hash = await generateDocHash(source, {
            size: arrayBuffer.byteLength,
            mtime: Date.now(),
            firstBytes,
            lastBytes,
          });

          pdfDoc = await loadPDF({ data: arrayBuffer });
        } else if (fileUrl) {
          // Load from URL
          source = { type: "url", value: fileUrl };

          try {
            pdfDoc = await loadPDF({ url: fileUrl, withCredentials: true });
            // TODO: Extract ETag/Content-Length from response for better hashing
            hash = await generateDocHash(source);
          } catch (err: any) {
            // Show CORS error card
            setError("cors");
            setLoading(false);
            return;
          }
        } else {
          setError("No file specified");
          setLoading(false);
          return;
        }

        setDocHash(hash);
        setPdf(pdfDoc);

        // Load all pages
        const pageCount = pdfDoc.numPages;
        const pagePromises: Promise<PDFPageProxy>[] = [];
        for (let i = 1; i <= pageCount; i++) {
          pagePromises.push(pdfDoc.getPage(i));
        }
        const loadedPages = await Promise.all(pagePromises);
        setPages(loadedPages);

        // Restore last state or use hash
        const existingDoc = await getDoc(hash);
        const hashState = parseHash(window.location.hash);

        let restoredPage = 1;
        let restoredZoom = "fitPage";

        if (hashState.page) {
          restoredPage = hashState.page;
        } else if (existingDoc?.lastPage) {
          restoredPage = existingDoc.lastPage;
        }

        if (hashState.zoom) {
          restoredZoom = hashState.zoom;
        } else if (existingDoc?.lastZoom) {
          restoredZoom = existingDoc.lastZoom;
        }

        setCurrentPage(restoredPage);
        setZoom(restoredZoom);

        // Initialize visible pages with the restored page
        visiblePagesRef.current = new Set([restoredPage]);

        // Scroll to restored page after a brief delay to ensure rendering
        if (restoredPage > 1) {
          setTimeout(() => {
            const pageEl = document.querySelector(
              `[data-page-num="${restoredPage}"]`
            );
            if (pageEl) {
              pageEl.scrollIntoView({ behavior: "auto", block: "start" });
            }
          }, 100);
        }

        // Mark initial load as complete
        setTimeout(() => {
          setIsInitialLoad(false);
        }, 200);

        // Load highlights for this document
        (async () => {
          try {
            const hs = await getHighlightsByDoc(hash);
            setHighlights(hs || []);
          } catch (err) {
            console.error("Failed to load highlights", err);
          }
        })();
        // Load notes for this document
        (async () => {
          try {
            const ns = await getNotesByDoc(hash);
            setNotes(ns || []);
          } catch (err) {
            console.error("Failed to load notes", err);
          }
        })();

        // Create or update doc record
        if (!existingDoc) {
          await putDoc({
            docHash: hash,
            source,
            name: fileName,
            pageCount,
            lastPage: restoredPage,
            lastZoom: restoredZoom,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
        }

        // Pass URL directly for url-based PDFs
        if (fileUrl) {
          requestChunking({
            docHash: hash,
            fileUrl: fileUrl,
          })
            .then((response) => {
              if (response.success) {
                console.log("Chunking task created:", response.taskId);
              } else {
                console.error(
                  "Failed to create chunking task:",
                  response.error
                );
              }
            })
            .catch((err) => {
              console.error("Error starting chunking:", err);
            });
        }

        setLoading(false);
      } catch (err: any) {
        console.error("Failed to load PDF:", err);
        setError(err.message || "Failed to load PDF");
        setLoading(false);
      }
    };

    loadDocument();
  }, [fileUrl, uploadId, fileName]);

  // Right-click to open custom context menu
  useEffect(() => {
    const onContext = (e: MouseEvent) => {
      // Only show when right-clicking inside viewer container
      const container = containerRef.current;
      if (!container) return;
      if (!container.contains(e.target as Node)) return;

      e.preventDefault();
      setContextPos({ x: e.clientX, y: e.clientY });
      setContextVisible(true);
    };

    const onClick = () => setContextVisible(false);

    window.addEventListener("contextmenu", onContext);
    window.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("contextmenu", onContext);
      window.removeEventListener("click", onClick);
    };
  }, []);

  // Handle context menu actions (highlight creation, note, etc.)
  const handleContextAction = async (action: string) => {
    if (action === "note") {
      // Open a small input anchored to the selection
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      const rects = Array.from(range.getClientRects());
      const first = rects[0];
      if (!first) return;
      const pageEl = document
        .elementFromPoint(first.left + 1, first.top + 1)
        ?.closest("[data-page-num]") as HTMLElement | null;
      if (!pageEl) return;
      const pageNum = parseInt(pageEl.getAttribute("data-page-num") || "0", 10);
      setNoteAnchor({ x: first.left, y: first.top - 24, page: pageNum, range });
      setNoteInput("");
      setContextVisible(false);
      return;
    }

    if (!action.startsWith("highlight:")) return;
    const color = action.split(":")[1];
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    const rects = Array.from(range.getClientRects()).map((r) => ({
      top: r.top,
      left: r.left,
      width: r.width,
      height: r.height,
    }));

    // Find which page these rects belong to (use first rect)
    const first = rects[0];
    if (!first) return;

    // Determine page element and compute rects relative to page box
    const pageEl = document
      .elementFromPoint(first.left + 1, first.top + 1)
      ?.closest("[data-page-num]") as HTMLElement | null;
    if (!pageEl) return;
    const pageNum = parseInt(pageEl.getAttribute("data-page-num") || "0", 10);
    const pageBox = pageEl.getBoundingClientRect();

    // Normalize rects to fractions of page width/height so highlights scale with zoom
    const relRects = rects.map((r) => ({
      top: (r.top - pageBox.top) / pageBox.height,
      left: (r.left - pageBox.left) / pageBox.width,
      width: r.width / pageBox.width,
      height: r.height / pageBox.height,
    }));

    // Persist highlight
    const id = `${docHash}:${pageNum}:${Date.now()}`;
    const h = {
      id,
      docHash,
      page: pageNum,
      rects: relRects,
      color,
      createdAt: Date.now(),
    };

    try {
      await putHighlight(h);
      setHighlights((prev) => [...prev, h]);
    } catch (err) {
      console.error("Failed to save highlight", err);
    }

    // Clear selection and close menu
    window.getSelection()?.removeAllRanges();
    setContextVisible(false);
  };

  // Calculate scale when zoom changes or container resizes
  useEffect(() => {
    if (!pages[0] || !containerRef.current) return;

    const updateScale = () => {
      const container = containerRef.current;
      if (!container) return;

      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight - 40; // py-4 padding + small buffer to prevent next page peeking

      const newScale = calculateScale(
        pages[0]!,
        containerWidth,
        containerHeight,
        zoom === "fitWidth" || zoom === "fitPage" ? zoom : parseInt(zoom, 10)
      );
      setScale(newScale);
    };

    updateScale();

    const resizeObserver = new ResizeObserver(updateScale);
    resizeObserver.observe(containerRef.current);

    return () => resizeObserver.disconnect();
  }, [zoom, pages]);

  // Set up IntersectionObserver for virtualization
  useEffect(() => {
    if (!containerRef.current || pages.length === 0) return;

    // Small delay to ensure page elements are in the DOM
    const timeoutId = setTimeout(() => {
      const container = containerRef.current;
      if (!container) return;

      const updateCurrentPage = (pageNum: number) => {
        setCurrentPage(pageNum);
      };

      observerRef.current = new IntersectionObserver(
        (entries) => {
          let mostVisiblePage = 0;
          let maxRatio = 0;

          entries.forEach((entry) => {
            const pageNum = parseInt(
              entry.target.getAttribute("data-page-num") || "0",
              10
            );

            if (entry.isIntersecting) {
              visiblePagesRef.current.add(pageNum);

              // Track most visible page
              if (entry.intersectionRatio > maxRatio) {
                maxRatio = entry.intersectionRatio;
                mostVisiblePage = pageNum;
              }
            } else {
              visiblePagesRef.current.delete(pageNum);
            }
          });

          // Update current page if we found a visible page with decent ratio
          if (mostVisiblePage > 0 && maxRatio >= 0.3) {
            updateCurrentPage(mostVisiblePage);
          }
        },
        {
          root: container,
          threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
          rootMargin: "0px",
        }
      );

      // Observe all pages
      const pageElements = container.querySelectorAll("[data-page-num]");
      pageElements.forEach((el) => observerRef.current?.observe(el));

      // Trigger initial visibility check
      if (pageElements.length > 0) {
        // Small delay to ensure layout is complete
        setTimeout(() => {
          // Force re-observation to trigger initial callbacks
          pageElements.forEach((el) => {
            observerRef.current?.unobserve(el);
            observerRef.current?.observe(el);
          });
        }, 50);
      }
    }, 150);

    return () => {
      clearTimeout(timeoutId);
      observerRef.current?.disconnect();
    };
  }, [pages]);

  // Update hash when page/zoom changes (but not during initial load)
  useEffect(() => {
    if (!isInitialLoad) {
      updateHash({ page: currentPage, zoom });
    }
  }, [currentPage, zoom, isInitialLoad]);

  // Persist state to IndexedDB
  useEffect(() => {
    if (!docHash) return;

    const persistState = async () => {
      await updateDocState(docHash, { lastPage: currentPage, lastZoom: zoom });
    };

    const timeoutId = setTimeout(persistState, 500);
    return () => clearTimeout(timeoutId);
  }, [currentPage, zoom, docHash]);

  // Handler functions
  const handlePrevPage = useCallback(() => {
    if (currentPage > 1) {
      scrollToPage(currentPage - 1);
    }
  }, [currentPage]);

  const handleNextPage = useCallback(() => {
    if (currentPage < pages.length) {
      scrollToPage(currentPage + 1);
    }
  }, [currentPage, pages.length]);

  const scrollToPage = (pageNum: number) => {
    const pageEl = containerRef.current?.querySelector(
      `[data-page-num="${pageNum}"]`
    );
    if (pageEl) {
      pageEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const handleZoomIn = useCallback(() => {
    if (zoom === "fitWidth" || zoom === "fitPage") {
      setZoom("100");
    } else {
      const currentZoom = parseInt(zoom, 10);
      const nextZoom = ZOOM_LEVELS.find((z) => z > currentZoom) || 300;
      setZoom(nextZoom.toString());
    }
  }, [zoom]);

  const handleZoomOut = useCallback(() => {
    if (zoom === "fitWidth" || zoom === "fitPage") {
      setZoom("100");
    } else {
      const currentZoom = parseInt(zoom, 10);
      const prevZoom =
        [...ZOOM_LEVELS].reverse().find((z) => z < currentZoom) || 50;
      setZoom(prevZoom.toString());
    }
  }, [zoom]);

  // Keyboard navigation and ctrl+scroll zoom
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey;

      if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        handlePrevPage();
      } else if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        handleNextPage();
      } else if (isMod && e.key === "+") {
        e.preventDefault();
        handleZoomIn();
      } else if (isMod && e.key === "-") {
        e.preventDefault();
        handleZoomOut();
      } else if (isMod && e.key === "0") {
        e.preventDefault();
        setZoom("fitWidth");
      }
    };

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (e.deltaY < 0) {
          handleZoomIn();
        } else {
          handleZoomOut();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("wheel", handleWheel);
    };
  }, [handlePrevPage, handleNextPage, handleZoomIn, handleZoomOut]);

  const handleRender = useCallback(
    async (
      pageNum: number,
      canvas: HTMLCanvasElement,
      textLayerDiv: HTMLDivElement | null,
      priority: number
    ) => {
      const page = pages[pageNum - 1];
      if (!page) return;

      await renderQueue.enqueue(
        pageNum,
        page,
        canvas,
        textLayerDiv,
        scale,
        priority
      );
      canvasCacheRef.current.add(pageNum, canvas);
    },
    [pages, scale, renderQueue]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-neutral-50 dark:bg-neutral-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-neutral-600 dark:text-neutral-400">
            Loading PDF...
          </p>
        </div>
      </div>
    );
  }

  if (error === "cors") {
    return (
      <div className="flex items-center justify-center h-screen bg-neutral-50 dark:bg-neutral-900 p-4">
        <div className="max-w-md w-full bg-white dark:bg-neutral-800 rounded-lg shadow-lg border border-neutral-200 dark:border-neutral-700 p-6">
          <h2 className="text-xl font-semibold text-red-600 dark:text-red-400 mb-4">
            Unable to Load PDF
          </h2>
          <p className="text-neutral-700 dark:text-neutral-300 mb-6">
            This PDF cannot be loaded due to CORS restrictions or access
            permissions.
          </p>
          <div className="space-y-3">
            <a
              href={fileUrl || "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded text-center transition-colors"
            >
              Open in Native Viewer
            </a>
            <button
              onClick={() => window.close()}
              className="block w-full px-4 py-2 bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 rounded transition-colors"
            >
              Close Tab
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-neutral-50 dark:bg-neutral-900">
        <div className="text-center">
          <p className="text-red-600 dark:text-red-400 font-semibold mb-2">
            Error
          </p>
          <p className="text-neutral-600 dark:text-neutral-400">{error}</p>
        </div>
      </div>
    );
  }

  if (!pdf || pages.length === 0) {
    return null;
  }

  return (
    <div className="h-screen flex flex-col bg-neutral-50 dark:bg-neutral-900">
      <Toolbar
        currentPage={currentPage}
        totalPages={pages.length}
        zoom={zoom}
        onPrevPage={handlePrevPage}
        onNextPage={handleNextPage}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onFitWidth={() => setZoom("fitWidth")}
        onFitPage={() => setZoom("fitPage")}
        onPageChange={(page) => scrollToPage(page)}
      />

      <div ref={containerRef} className="flex-1 overflow-auto">
        <div className="py-4 flex flex-col items-center">
          {pages.map((page, idx) => {
            const pageNum = idx + 1;
            const isVisible = visiblePagesRef.current.has(pageNum);
            // Render visible pages + 2 pages buffer above/below
            const shouldRender =
              isVisible ||
              Array.from(visiblePagesRef.current).some(
                (vp) => Math.abs(vp - pageNum) <= 2
              );

            return (
              <Page
                key={pageNum}
                pageNum={pageNum}
                page={page}
                scale={scale}
                isVisible={isVisible}
                shouldRender={shouldRender}
                onRender={handleRender}
                highlights={highlights.filter((h) => h.page === pageNum)}
                notes={notes.filter((n) => n.page === pageNum)}
              />
            );
          })}
        </div>
      </div>
      {/* Note input floating box */}
      {noteAnchor && (
        <div
          style={{
            position: "fixed",
            left: noteAnchor.x,
            top: noteAnchor.y,
            zIndex: 60,
          }}
        >
          <input
            autoFocus
            value={noteInput}
            onChange={(e) => setNoteInput(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === "Enter") {
                // persist note with normalized rects from selection
                const range = noteAnchor.range;
                const rects = Array.from(range.getClientRects());
                if (rects.length === 0) return;

                const pageEl = document.querySelector(
                  `[data-page-num="${noteAnchor.page}"]`
                ) as HTMLElement;
                if (!pageEl) return;
                const pageBox = pageEl.getBoundingClientRect();

                // Normalize all rects to page dimensions
                const normalizedRects = rects.map((r) => ({
                  top: (r.top - pageBox.top) / pageBox.height,
                  left: (r.left - pageBox.left) / pageBox.width,
                  width: r.width / pageBox.width,
                  height: r.height / pageBox.height,
                }));

                const id = `${docHash}:${noteAnchor.page}:${Date.now()}`;
                const note = {
                  id,
                  docHash,
                  page: noteAnchor.page,
                  rects: normalizedRects,
                  text: noteInput,
                  createdAt: Date.now(),
                };
                try {
                  await putNote(note);
                  setNotes((prev) => [...prev, note]);
                } catch (err) {
                  console.error("Failed to save note", err);
                }
                setNoteAnchor(null);
              } else if (e.key === "Escape") {
                setNoteAnchor(null);
              }
            }}
            placeholder="Type note and press Enter"
            className="px-2 py-1 rounded border"
          />
        </div>
      )}
      <ContextMenu
        visible={contextVisible}
        x={contextPos.x}
        y={contextPos.y}
        onSelect={(a) => handleContextAction(a)}
      />
    </div>
  );
};
