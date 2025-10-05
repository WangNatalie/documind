import React, { useEffect, useState, useRef, useCallback } from "react";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { loadPDF, calculateScale, DPI_ADJUSTMENT } from "./pdf";
import { Page } from "./Page";
import { Toolbar } from "./Toolbar";
import { useRenderQueue, CanvasCache } from "./useRenderQueue";
import { parseHash, updateHash } from "../utils/hash";
import { generateDocHash } from "../utils/hash";
import {
  getDoc,
  putDoc,
  updateDocState,
  resetDB,
  putNote,
  getNotesByDoc,
  putComment,
  getCommentsByDoc,
  deleteNote,
  deleteComment,
  getTableOfContents,
  getChunksByDoc,
  getDrawingsByDoc,
  putDrawing,
  type TableOfContentsRecord,
  type DrawingStroke,
  type DrawingRecord,
  type NoteRecord,
  type CommentRecord,
} from "../db";
import { readOPFSFile } from "../db/opfs";
import ContextMenu from "./ContextMenu";
import { requestGeminiChunking, requestEmbeddings, requestTOC } from "../utils/chunker-client";
import { Chatbot } from './Chatbot';
import { buildTOCTree } from "../utils/toc";
import { TOC } from "./TOC";
import { DrawingToolbar } from "./DrawingToolbar";
import { mergeAnnotationsIntoPdf } from "../export/annotationsToPdf";
import DocumentProperties from './DocumentProperties.tsx';
import SaveAsModal from './SaveAsModal';
import { getAudio } from "../utils/narrator-client";
import { Volume2, BrainCircuit, Book, BookOpen } from "lucide-react";
import type { BookmarkItem } from "./TOC";

const ZOOM_LEVELS = [
  50, 75, 90, 100, 125, 150, 175, 200, 250, 300, 350, 400, 500,
];

export const ViewerApp: React.FC = () => {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pages, setPages] = useState<(PDFPageProxy | null)[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [visiblePages, setVisiblePages] = useState<Set<number>>(new Set([1]));

  const [zoom, setZoom] = useState<string>("fitPage");
  const [scale, setScale] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [docHash, setDocHash] = useState<string>("");
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [tableOfContents, setTableOfContents] =
    useState<TableOfContentsRecord | null>(null);

  // (nestedTOCNodes computed later for use in render)

  const containerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const renderQueue = useRenderQueue();
  // Protect pages currently in or near viewport from cache eviction
  const canvasCacheRef = useRef(
    new CanvasCache((pageNum: number) => {
      // visiblePages state may lag slightly; combine both refs for safety
      if (visiblePagesRef.current.has(pageNum)) return true;
      if ((intersectionVisiblePagesRef.current || new Set()).has(pageNum))
        return true;
      // Also protect small buffer (+/-2) around any currently visible page to reduce thrash
      for (const vp of visiblePagesRef.current) {
        if (Math.abs(vp - pageNum) <= 2) return true;
      }
      return false;
    })
  );
  const visiblePagesRef = useRef<Set<number>>(new Set([1]));
  const intersectionVisiblePagesRef = useRef<Set<number>>(new Set([1]));
  const pendingZoomRef = useRef<number | null>(null);
  // Context menu state
  const [contextVisible, setContextVisible] = useState(false);
  const [contextPos, setContextPos] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const [notes, setNotes] = useState<NoteRecord[]>([]);
  const [comments, setComments] = useState<CommentRecord[]>([]);

  const [commentInput, setCommentInput] = useState<string>("");
  const [commentAnchor, setCommentAnchor] = useState<{
    x: number;
    y: number;
    page: number;
    range: Range;
  } | null>(null);
  const [noteInput, setNoteInput] = useState<string>("");
  const [noteAnchor, setNoteAnchor] = useState<{
    x: number;
    y: number;
    page: number;
    color: string;
    rects: Array<{ top: number; left: number; width: number; height: number }>;
  } | null>(null);
  const [tocOpen, setTocOpen] = useState(false);
  const [tocPinned, setTocPinned] = useState(false);
  // Toolbar ref so we can measure its height and avoid covering it with the TOC drawer
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const [toolbarHeight, setToolbarHeight] = useState(0);
  // Highlights visibility toggle
  const [highlightsVisible, setHighlightsVisible] = useState(false);
  // Toast notification for highlights toggle
  const [showHighlightsToast, setShowHighlightsToast] = useState(false);
  const highlightsToastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Drawing state - all in memory, no database
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [drawingColor, setDrawingColor] = useState('#000000');
  const [drawingStrokeWidth] = useState(2);
  const [isEraserMode, setIsEraserMode] = useState(false);
  const [pageDrawings, setPageDrawings] = useState<Map<number, DrawingStroke[]>>(new Map());
  const [drawingHistory, setDrawingHistory] = useState<Map<number, DrawingStroke[][]>>(new Map());
  const [drawingHistoryIndex, setDrawingHistoryIndex] = useState<Map<number, number>>(new Map());
  // Term summaries state
  interface TermSummary {
    term: string;
    definition: string;
    explanation1: string;
    explanation2: string;
    explanation3: string;
    tocItem: { title: string; page: number; chunkId?: string } | null;
    matchedChunkId?: string;
  }
  // Cache term summaries for current, prev, and next pages
  interface PageTermCache {
    page: number;
    summaries: TermSummary[];
  }
  const [termCache, setTermCache] = useState<Map<number, PageTermCache>>(
    new Map()
  );
  const [selectedTerm, setSelectedTerm] = useState<TermSummary | null>(null);
  const [termPopupPosition, setTermPopupPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [termSourceRects, setTermSourceRects] = useState<
    Array<{ top: number; left: number; width: number; height: number }>
  >([]);
  const [termSourcePage, setTermSourcePage] = useState<number>(1);
  const [termReturnPage, setTermReturnPage] = useState<number | null>(null); // Track page to return to after "Go to Context"
  const [savedTerms, setSavedTerms] = useState<Set<string>>(new Set()); // Track terms that have been saved as notes
  const [isNarratingTerm, setIsNarratingTerm] = useState(false); // Track if term is being narrated
  const currentAudioRef = useRef<HTMLAudioElement | null>(null); // Reference to current audio element

  // Two-page mode state
  const [isTwoPageMode, setIsTwoPageMode] = useState(false);
  // Incremented to force highlight recompute when layout toggles
  const [layoutVersion, setLayoutVersion] = useState(0);
  // Wheel navigation control for two-page mode
  const wheelAccumXRef = useRef(0);
  const wheelAccumYRef = useRef(0);
  const wheelCooldownRef = useRef(false);
  // Bottom hover reveal for two-page toggle (match TOC hover behavior)
  const [bottomControlVisible, setBottomControlVisible] = useState(false);
  const bottomHoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Track last visible page for recaching logic
  const lastVisiblePageRef = useRef<number>(1);
  const recacheTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Parse URL params
  const params = new URLSearchParams(window.location.search);
  const fileUrl = params.get("file");
  const uploadId = params.get("uploadId");
  // Keep filename in state so we can update it after reading PDF metadata
  const [fileName, setFileName] = useState<string>(
    params.get("name") || "document.pdf"
  );

  const [contextBookmarks, setContextBookmarks] = useState<BookmarkItem[]>([]);
  const [chatbotOpenTick, setChatbotOpenTick] = useState(0);

  const handleAddContextBookmark = (bookmark: BookmarkItem) => {
    setContextBookmarks((prev) => {
      if (prev.find((b) => b.id === bookmark.id)) return prev;
      return [...prev, bookmark];
    });
    setChatbotOpenTick((t) => t + 1);
  };
  const handleRemoveContextBookmark = (id: string) => {
    setContextBookmarks((prev) => prev.filter((b) => b.id !== id));
  };

  const handleAddNoteContextFromPage = useCallback((note: { id: string; rects: { top: number; left: number; width: number; height: number }[]; color: string; text?: string }, page: number) => {
    const b: BookmarkItem = {
      id: note.id,
      page,
      text: note.text,
      createdAt: Date.now(),
      __type: "note",
      original: { id: note.id, docHash, page, rects: note.rects, color: note.color, text: note.text, createdAt: Date.now() } as any,
    };
    handleAddContextBookmark(b);
  }, [docHash]);

  const handleAddCommentContextFromPage = useCallback((comment: { id: string; rects: { top: number; left: number; width: number; height: number }[]; text: string; page: number }) => {
    const b: BookmarkItem = {
      id: comment.id,
      page: comment.page,
      text: comment.text,
      createdAt: Date.now(),
      __type: "comment",
      original: { id: comment.id, docHash, page: comment.page, rects: comment.rects, text: comment.text, createdAt: Date.now() } as any,
    };
    handleAddContextBookmark(b);
  }, [docHash]);

  // Listen for state requests and term summaries from background
  useEffect(() => {
    const handleMessage = (message: any) => {
      if (message.type === "TERM_SUMMARIES_READY") {
        // Received term summaries from background script
        const { summaries, currentPage: summariesPage } = message.payload;
        console.log('[VIEWER] Received term summaries:', summaries);
        console.log('[VIEWER] Caching term summaries, count:', summaries?.length || 0, 'for page:', summariesPage);
        
        // Add to cache
        setTermCache(prev => {
          const newCache = new Map(prev);
          newCache.set(summariesPage, {
            page: summariesPage,
            summaries: summaries || [],
          });
          return newCache;
        });
        return;
      }

      if (message.type === "REQUEST_VIEWER_STATE") {
        // Extract text from visible pages
        let visibleText = "";
        const visibleTextByPage: Record<number, string> = {};
        const visiblePages = Array.from(visiblePagesRef.current).sort(
          (a, b) => a - b
        );

        console.log(
          "[VIEWER] Processing state request for visible pages:",
          visiblePages
        );

        for (const pageNum of visiblePages) {
          const pageEl = document.querySelector(`[data-page-num="${pageNum}"]`);
          if (pageEl) {
            // Try both possible class names for text layer
            const textLayer =
              pageEl.querySelector(".text-layer") ||
              pageEl.querySelector(".textLayer");
            if (textLayer) {
              const pageText = textLayer.textContent || "";
              if (pageText.trim()) {
                visibleText += `\n=== Page ${pageNum} ===\n${pageText}\n`;
                visibleTextByPage[pageNum] = pageText;
              }
            } else {
              console.log(`[VIEWER] No text layer found for page ${pageNum}`);
            }
          } else {
            console.log(`[VIEWER] Page element not found for page ${pageNum}`);
          }
        }

        console.log("[VIEWER] Sending state to background:", {
          fileName,
          currentPage,
          totalPages: pages.length,
          visiblePages,
          textLength: visibleText.length,
        });

        // Send current state to background
        // Determine current pages (single or two-page spread)
        let currentPages: number[] = [];
        if (isTwoPageMode) {
          const left = currentPage % 2 === 0 ? currentPage - 1 : currentPage;
          const right = Math.min(pages.length, left + 1);
          currentPages = right !== left ? [left, right] : [left];
        } else {
          currentPages = [currentPage];
        }

        chrome.runtime.sendMessage({
          type: 'UPDATE_VIEWER_STATE',
          payload: {
            docHash,
            fileName,
            currentPage,
            currentPages,
            totalPages: pages.length,
            zoom,
            visibleText: visibleText.trim(),
            visibleTextByPage,
          }
        }).catch((error) => {
          // Suppress "message port closed" errors - these are normal when extension reloads
          if (!error.message?.includes('message port closed')) {
            console.error('Failed to send viewer state:', error);
          }
        });
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, [docHash, fileName, currentPage, pages.length, zoom]);

  // Helper to get summaries for a specific page from cache
  const getSummariesForPage = useCallback((pageNum: number): TermSummary[] => {
    const cached = termCache.get(pageNum);
    const summaries = cached?.summaries || [];
    // Filter out terms that have been saved as notes
    return summaries.filter(summary => !savedTerms.has(summary.term));
  }, [termCache, savedTerms]);

  // Cache management: maintain current ±10 pages in cache (21 pages total)
  // When current page changes, wait 15 seconds before recaching if it becomes completely invisible
  useEffect(() => {
    if (visiblePages.size === 0) return;
    
    // Find the "current" page (the first visible page in order)
    const sortedVisible = Array.from(visiblePages).sort((a, b) => a - b);
    const newCurrentPage = sortedVisible[0];
    
    // Check if the previous "current" page is now completely invisible
    const previousPage = lastVisiblePageRef.current;
    const previousPageNowInvisible = !visiblePages.has(previousPage);
    
    if (previousPageNowInvisible && previousPage !== newCurrentPage) {
      console.log(`[VIEWER] Previous page ${previousPage} is now invisible, scheduling recache in 15s`);
      
      // Clear any existing timeout
      if (recacheTimeoutRef.current) {
        clearTimeout(recacheTimeoutRef.current);
      }
      
      // Wait 15 seconds before recaching
      recacheTimeoutRef.current = setTimeout(() => {
        console.log(`[VIEWER] Recaching for new current page: ${newCurrentPage}`);
        requestCacheForPage(newCurrentPage);
        recacheTimeoutRef.current = null;
      }, 15000);
    } else if (newCurrentPage !== previousPage) {
      // Current page changed to a different visible page
      console.log(`[VIEWER] Current page changed from ${previousPage} to ${newCurrentPage}`);
      
      // Clear any pending recache timeout
      if (recacheTimeoutRef.current) {
        clearTimeout(recacheTimeoutRef.current);
        recacheTimeoutRef.current = null;
      }
      
      // Request cache for new current page (function will check what's already cached)
      requestCacheForPage(newCurrentPage);
    }
    
    // Update the last visible page ref
    lastVisiblePageRef.current = newCurrentPage;
    
    return () => {
      if (recacheTimeoutRef.current) {
        clearTimeout(recacheTimeoutRef.current);
      }
    };
  }, [visiblePages, docHash, pages.length]);
  
  // Helper function to request cache for current ±10 pages
  const requestCacheForPage = useCallback((pageNum: number) => {
    const totalPages = pages.length;
    const CACHE_RANGE = 10; // Cache ±10 pages around current
    
    const pagesToCache: number[] = [];
    for (let offset = -CACHE_RANGE; offset <= CACHE_RANGE; offset++) {
      const p = pageNum + offset;
      if (p >= 1 && p <= totalPages) {
        pagesToCache.push(p);
      }
    }
    
    console.log(`[VIEWER] Requesting cache for pages:`, pagesToCache);
    
    // Check which pages are not in cache and request them
    const missingPages = pagesToCache.filter(p => !termCache.has(p));
    
    if (missingPages.length > 0) {
      console.log(`[VIEWER] Cache misses for pages:`, missingPages, '- requesting from background');
      missingPages.forEach(p => {
        // Extract text from the specific page
        const pageEl = document.querySelector(`[data-page-num="${p}"]`);
        let pageText = '';
        
        if (pageEl) {
          const textLayer = pageEl.querySelector('.text-layer') || pageEl.querySelector('.textLayer');
          if (textLayer) {
            pageText = textLayer.textContent || '';
          }
        }
        
        console.log(`[VIEWER] Sending request for page ${p} with text length:`, pageText.length);
        
        chrome.runtime.sendMessage({
          type: 'REQUEST_PAGE_TERMS',
          payload: { 
            page: p, 
            docHash,
            pageText: pageText.trim()
          }
        }).catch(err => console.error('Failed to request page terms:', err));
      });
    } else {
      console.log(`[VIEWER] All required pages already in cache`);
    }
    
    // Clean up cache: remove pages that are not in the ±10 range
    setTermCache(prev => {
      const newCache = new Map(prev);
      let cleaned = false;
      
      for (const [cachedPage] of newCache) {
        if (!pagesToCache.includes(cachedPage)) {
          console.log(`[VIEWER] Removing page ${cachedPage} from cache (outside ±${CACHE_RANGE} range)`);
          newCache.delete(cachedPage);
          cleaned = true;
        }
      }
      
      return cleaned ? new Map(newCache) : prev;
    });
  }, [pages.length, termCache, docHash]);

  // Separate visibility check for highlights - refresh every 0.5 seconds
  // This ensures highlights appear/disappear based on actual page visibility
  useEffect(() => {
    const checkHighlightVisibility = () => {
      const container = containerRef.current;
      if (!container) return;
      
      const containerRect = container.getBoundingClientRect();
      const containerTop = containerRect.top;
      const containerBottom = containerRect.bottom;
      
      // Update visible pages based on actual intersection
      const newVisiblePages = new Set<number>();
      const pageElements = container.querySelectorAll('[data-page-num]');
      
      pageElements.forEach((el) => {
        const pageNum = parseInt(el.getAttribute('data-page-num') || '0', 10);
        if (pageNum === 0) return;
        
        const rect = el.getBoundingClientRect();
        // Check if page is visible in viewport at all (any part of it)
        const isVisible = rect.bottom > containerTop && rect.top < containerBottom;
        if (isVisible) {
          newVisiblePages.add(pageNum);
        }
      });
      
      // Always compare with current ref value to avoid stale closures
      const oldVisible = Array.from(visiblePagesRef.current).sort();
      const newVisible = Array.from(newVisiblePages).sort();
      const changed = oldVisible.length !== newVisible.length ||
        oldVisible.some((p, i) => p !== newVisible[i]);
      
      if (changed) {
        console.log(`[Highlight Visibility] Pages changed:`, oldVisible, '->', newVisible);
        visiblePagesRef.current = newVisiblePages;
        setVisiblePages(newVisiblePages);
      }
    };
    
    // Check every 0.5 seconds
    const intervalId = setInterval(checkHighlightVisibility, 500);
    
    // Also check immediately
    checkHighlightVisibility();
    
    return () => clearInterval(intervalId);
  }, []); // No dependencies - runs independently

  // Helper function to calculate popup position - always snaps to right edge
  const calculatePopupPosition = useCallback(
    (_x: number, _y: number): { x: number; y: number } => {
      // Estimated popup dimensions (max-w-md = 448px, approximate height)
      const POPUP_WIDTH = 448;
      const POPUP_HEIGHT = 300; // Approximate based on content
      const MARGIN = 16; // Margin from viewport edge

      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // Always snap to right edge
      const adjustedX = viewportWidth - POPUP_WIDTH - MARGIN;

      // Center vertically in viewport
      let adjustedY = (viewportHeight - POPUP_HEIGHT) / 2;

      // Make sure it doesn't go off top or bottom
      if (adjustedY < MARGIN) {
        adjustedY = MARGIN;
      } else if (adjustedY + POPUP_HEIGHT + MARGIN > viewportHeight) {
        adjustedY = viewportHeight - POPUP_HEIGHT - MARGIN;
      }

      console.log(
        "[calculatePopupPosition] Snapping to right edge:",
        { adjustedX, adjustedY },
        "Viewport:",
        { viewportWidth, viewportHeight }
      );

      return { x: adjustedX, y: adjustedY };
    },
    []
  );

  // Close popup when clicking outside
  useEffect(() => {
    if (!selectedTerm) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Check if click is outside the popup and not on a term highlight
      if (
        !target.closest("[data-term-popup]") &&
        !target.closest("[data-term-highlight]")
      ) {
        console.log("[App] Clicking outside popup, closing");
        setSelectedTerm(null);
        setTermPopupPosition(null);
        setTermReturnPage(null);
      }
    };

    // Use timeout to avoid catching the same click that opened the popup
    const timeoutId = setTimeout(() => {
      document.addEventListener("click", handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("click", handleClickOutside);
    };
  }, [selectedTerm]);

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

          // Generate content-only hash from file metadata
          const firstBytes = arrayBuffer.slice(0, 64 * 1024);
          const lastBytes = arrayBuffer.slice(-64 * 1024);
          const newHash = await generateDocHash(source, {
            size: arrayBuffer.byteLength,
            firstBytes,
            lastBytes,
          });

          // Try to find an existing doc under the new (content-only) hash
          let existing = await getDoc(newHash);

          if (!existing) {
            // Fallback: attempt legacy uploadId-including hash for compatibility
            try {
              // import helper at top-level: generateLegacyUploadHash
              // (we import it below where needed)
              // eslint-disable-next-line @typescript-eslint/no-var-requires
              const { generateLegacyUploadHash } = await import(
                "../utils/hash"
              );
              const legacyHash = await generateLegacyUploadHash(source, {
                size: arrayBuffer.byteLength,
                firstBytes,
                lastBytes,
              });

              const legacyDoc = await getDoc(legacyHash);
              if (legacyDoc) {
                console.log(
                  "[App] Found existing doc under legacy hash, reusing it:",
                  legacyHash
                );
                // Use legacy hash so existing notes/TOC/chunks are found
                hash = legacyHash;
                existing = legacyDoc;

                // Optionally create a doc record under the new hash to migrate forward
                try {
                  await putDoc({
                    docHash: newHash,
                    source,
                    name: legacyDoc.name,
                    pageCount: legacyDoc.pageCount,
                    lastPage: legacyDoc.lastPage,
                    lastZoom: legacyDoc.lastZoom,
                    createdAt: legacyDoc.createdAt,
                    updatedAt: Date.now(),
                  });
                  console.log(
                    "[App] Migrated doc record to new content-only hash:",
                    newHash
                  );
                } catch (mErr) {
                  console.warn(
                    "[App] Migration to new hash failed (non-fatal):",
                    mErr
                  );
                }
              } else {
                // No legacy record found; use newHash
                hash = newHash;
              }
            } catch (err) {
              console.warn("[App] Legacy hash fallback failed:", err);
              hash = newHash;
            }
          } else {
            hash = newHash;
          }

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
        // Update the browser tab title to the document name
        try {
          document.title = fileName || "document.pdf";
        } catch (e) {
          // ignore in non-browser environments
        }

        // Derive a better filename synchronously (await metadata) so we can use it when persisting
        let derivedName: string | undefined = params.get("name") || undefined;
        if (!derivedName) {
          try {
            const meta = await (pdfDoc as any).getMetadata?.();
            const title =
              meta?.info?.Title ||
              meta?.info?.title ||
              (meta?.metadata && typeof meta.metadata.get === "function"
                ? meta.metadata.get("dc:title")
                : undefined);
            if (title && typeof title === "string" && title.trim().length > 0) {
              derivedName = title.trim();
            }
          } catch (e) {
            // ignore metadata errors
          }
        }

        if (!derivedName && fileUrl) {
          try {
            const u = new URL(fileUrl);
            const parts = u.pathname.split("/").filter(Boolean);
            const last = parts[parts.length - 1] || "";
            if (last) {
              derivedName = decodeURIComponent(last.split("?")[0]) || undefined;
            }
          } catch (e) {
            // ignore
          }
        }

        if (!derivedName) derivedName = "document.pdf";
        setFileName(derivedName);
        try {
          document.title = derivedName;
        } catch (e) {}

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

        // Initialize visible pages with the restored page (both ref and state)
        visiblePagesRef.current = new Set([restoredPage]);
        setVisiblePages(new Set([restoredPage]));

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

        // Load notes for this document (non-fatal)
        (async () => {
          try {
            const ns = await getNotesByDoc(hash);
            setNotes(ns || []);
            
            // Extract saved term names from notes using full metadata to hide their highlights
            const termNames = new Set<string>();
            (ns || []).forEach(note => {
              if (note.termSummary) {
                termNames.add(note.termSummary.term);
              }
            });
            setSavedTerms(termNames);
          } catch (err) {
            console.error("Failed to load notes (non-fatal)", err);
            try {
              // reset DB connection in case it is stale or deleted
              resetDB();
            } catch (resetErr) {
              console.warn("resetDB failed while loading notes:", resetErr);
            }
            setNotes([]);
            setSavedTerms(new Set());
          }
        })();
        // Load comments for this document (non-fatal)
        (async () => {
          try {
            const cs = await getCommentsByDoc(hash);
            setComments(cs || []);
          } catch (err) {
            console.error("Failed to load comments (non-fatal)", err);
            try {
              resetDB();
            } catch (resetErr) {
              console.warn("resetDB failed while loading comments:", resetErr);
            }
            setComments([]);
          }
        })();

        // Load drawings for this document (non-fatal)
        (async () => {
          try {
            const drawings = await getDrawingsByDoc(hash);
            console.log('[App] Loaded drawings:', drawings.length);

            // Convert array of DrawingRecords to Map<pageNum, strokes[]>
            const drawingsMap = new Map<number, DrawingStroke[]>();
            const historyMap = new Map<number, DrawingStroke[][]>();
            const historyIndexMap = new Map<number, number>();

            drawings.forEach((drawing) => {
              drawingsMap.set(drawing.pageNum, drawing.strokes);
              // Initialize history with current state
              historyMap.set(drawing.pageNum, [drawing.strokes]);
              historyIndexMap.set(drawing.pageNum, 0);
            });

            setPageDrawings(drawingsMap);
            setDrawingHistory(historyMap);
            setDrawingHistoryIndex(historyIndexMap);
          } catch (err) {
            console.error("Failed to load drawings (non-fatal)", err);
            try {
              resetDB();
            } catch (resetErr) {
              console.warn('resetDB failed while loading drawings:', resetErr);
            }
            // Keep empty maps on error
          }
        })();

        // Create or update doc record — make DB errors non-fatal so viewer still loads
        try {
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
        } catch (err) {
          console.error("Failed to create/update doc record (non-fatal):", err);
          // If the DB is in a bad state, reset the connection so subsequent operations can retry
          try {
            resetDB();
            // a future operation (highlights/notes) will attempt to open the DB again
          } catch (resetErr) {
            console.warn("resetDB failed:", resetErr);
          }
        }

        // Helper: check DB for chunks/TOC and generate TOC when appropriate.
        const checkAndGenerateTOC = async () => {
          console.log("[App] checkAndGenerateTOC called for document:", hash);
          try {
            const [chunks, toc] = await Promise.all([
              getChunksByDoc(hash),
              getTableOfContents(hash),
            ]);

            console.log("[App] TOC check results:", {
              chunksCount: chunks.length,
              hasTOC: !!toc,
              tocItemsCount: toc?.items?.length || 0,
            });

            if (toc) {
              setTableOfContents(toc);
              console.log("[App] TOC already present, skipping generation");
              return;
            }

            if (chunks.length === 0) {
              console.log("[App] No chunks found, skipping TOC generation");
              return;
            }

            // There are chunks but no TOC — request TOC generation
            console.log(
              "[App] Document has chunks but no TOC, requesting TOC generation"
            );
            const tocResponse = await requestTOC({
              docHash: hash,
              fileUrl: fileUrl || undefined,
              uploadId: uploadId || undefined,
            });

            if (!tocResponse.success) {
              console.warn(
                "[App] Failed to create TOC task:",
                tocResponse.error
              );
              return;
            }

            console.log(
              "[App] TOC generation task created:",
              tocResponse.taskId
            );

            // Poll for TOC to appear in DB (bounded retries)
            const maxAttempts = 15;
            const baseDelayMs = 1000;
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
              try {
                await new Promise((res) => setTimeout(res, baseDelayMs));
                const newTOC = await getTableOfContents(hash);
                if (newTOC) {
                  console.log(
                    `[App] TOC ready after ${attempt} ${attempt === 1 ? "attempt" : "attempts"}`
                  );
                  setTableOfContents(newTOC);
                  break;
                }
              } catch (pollErr) {
                console.warn(
                  "[App] Error while polling for TOC (non-fatal):",
                  pollErr
                );
              }
            }
          } catch (err) {
            console.error(
              "[App] Error checking/creating TOC (non-fatal):",
              err
            );
          }
        };

        // Kick off initial check
        console.log("[App] Starting initial TOC check...");
        checkAndGenerateTOC();

        // Start chunking+embedding workflow (for URL or OPFS uploadId)
        if (fileUrl) {
          requestGeminiChunking({ docHash: hash, fileUrl })
            .then((response) => {
              if (response.success)
                console.log("Chunking task created:", response.taskId);
              else
                console.error(
                  "Failed to create chunking task:",
                  response.error
                );
              return requestEmbeddings(hash);
            })
            .then((embeddingResponse) => {
              if (embeddingResponse?.success) {
                console.log(
                  `Embeddings generated: ${embeddingResponse.count} new embeddings`
                );
              } else if (embeddingResponse?.error) {
                console.warn(
                  "Failed to generate embeddings:",
                  embeddingResponse.error
                );
              }
              console.log(
                "[App] Checking for TOC after embeddings complete..."
              );
              return checkAndGenerateTOC();
            })
            .catch((err) => {
              console.error("Error in chunking/embedding workflow:", err);
            });
        } else if (uploadId) {
          console.log("[App.tsx] Requesting chunking with uploadId:", uploadId);
          requestGeminiChunking({ docHash: hash, uploadId })
            .then((response) => {
              if (response.success)
                console.log("Chunking task created:", response.taskId);
              else
                console.error(
                  "Failed to create chunking task:",
                  response.error
                );
              return requestEmbeddings(hash);
            })
            .then((embeddingResponse) => {
              if (embeddingResponse?.success) {
                console.log(
                  `Embeddings generated: ${embeddingResponse.count} new embeddings`
                );
              } else if (embeddingResponse?.error) {
                console.warn(
                  "Failed to generate embeddings:",
                  embeddingResponse.error
                );
              }
              console.log(
                "[App] Checking for TOC after embeddings complete..."
              );
              return checkAndGenerateTOC();
            })
            .catch((err) => {
              console.error("Error in chunking/embedding workflow:", err);
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
  }, [fileUrl, uploadId]);

  // Keep track of TOC state changes for debugging and to ensure the value is used
  useEffect(() => {
    if (tableOfContents) {
      console.log("[App] Table of Contents updated:", tableOfContents);
    }
  }, [tableOfContents]);

  const handleToggleTOC = useCallback(() => {
    // Treat the toolbar hamburger as the "pin" toggle: clicking it toggles pinned state
    setTocPinned((prev) => {
      const next = !prev;
      if (next)
        setTocOpen(true); // when pinned, ensure the TOC is open
      else setTocOpen(false); // when unpinned, close the TOC
      return next;
    });
  }, []);

  const handleToggleHighlights = useCallback(() => {
    setHighlightsVisible((prev) => {
      const newValue = !prev;
      
      // Show toast notification
      setShowHighlightsToast(true);
      
      // Clear any existing timeout
      if (highlightsToastTimeoutRef.current) {
        clearTimeout(highlightsToastTimeoutRef.current);
      }
      
      // Hide toast after 1.5 seconds
      highlightsToastTimeoutRef.current = setTimeout(() => {
        setShowHighlightsToast(false);
        highlightsToastTimeoutRef.current = null;
      }, 1500);
      
      return newValue;
    });
  }, []);

  const handleTOCSelect = useCallback((item: any) => {
    // scroll to page when TOC entry clicked
    if (typeof item.page === 'number') {
      scrollToPage(item.page);
      if (!tocPinned) setTocOpen(false);
    }
  }, [tocPinned]);

  // Measure toolbar height so the TOC drawer doesn't cover it
  useEffect(() => {
    const el = toolbarRef.current;
    if (!el) return;

    const update = () =>
      setToolbarHeight(el.getBoundingClientRect().height || 0);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [toolbarRef.current]);

  // Hover behavior: auto-open when cursor hits left edge; auto-close when leaving unless pinned
  const hoverCloseTimeout = useRef<number | null>(null);

  const openFromHover = useCallback(() => {
    if (hoverCloseTimeout.current) {
      window.clearTimeout(hoverCloseTimeout.current);
      hoverCloseTimeout.current = null;
    }
    setTocOpen(true);
  }, []);

  const scheduleCloseFromHover = useCallback(() => {
    if (tocPinned) return; // don't auto-close when pinned
    if (hoverCloseTimeout.current)
      window.clearTimeout(hoverCloseTimeout.current);
    hoverCloseTimeout.current = window.setTimeout(() => {
      setTocOpen(false);
      hoverCloseTimeout.current = null;
    }, 200); // small delay to avoid flicker
  }, [tocPinned]);

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

  // Handle context menu actions (note creation, comment, etc.)
  const handleContextAction = async (action: string) => {
    if (action === "narrate") {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const selectedText = sel.toString().trim();
      if (!selectedText) return;

      try {
        console.log('[App] Requesting narration for selection length', selectedText.length);
        const audioBuffer = await getAudio(selectedText);
        if (audioBuffer) {
          console.log('[App] Playing narration audio (ArrayBuffer length)', audioBuffer.byteLength);
          const blob = new Blob([audioBuffer], { type: 'audio/mpeg' });
          const url = URL.createObjectURL(blob);
          const audioEl = new Audio(url);
          audioEl.play().catch(e => console.error('[App] Audio playback failed', e));
          audioEl.onended = () => {
            URL.revokeObjectURL(url);
          };
        } else {
          console.error('[App] No audio buffer received for narration');
        }
      } catch (err) {
        console.error('[App] Error requesting narration:', err);
      }

      setContextVisible(false);
      return;
    }
    if (action === "explain") {
      // Get selected text and request summary
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const selectedText = sel.toString().trim();
      if (!selectedText) return;

      const range = sel.getRangeAt(0);
      const rects = Array.from(range.getClientRects()).map((r) => ({
        top: r.top,
        left: r.left,
        width: r.width,
        height: r.height,
      }));
      const first = rects[0];
      if (!first) return;

      // Find which page this selection is on and get normalized coordinates
      const pageEl = document
        .elementFromPoint(first.left + 1, first.top + 1)
        ?.closest("[data-page-num]") as HTMLElement | null;

      if (!pageEl) return;

      const pageNum = parseInt(pageEl.getAttribute("data-page-num") || "0", 10);
      const pageBox = pageEl.getBoundingClientRect();

      // Normalize rects to fractions of page width/height so notes scale with zoom
      const normalizedRects = rects.map((r) => ({
        top: (r.top - pageBox.top) / pageBox.height,
        left: (r.left - pageBox.left) / pageBox.width,
        width: r.width / pageBox.width,
        height: r.height / pageBox.height,
      }));

      console.log(
        "[App] AI Explanation requested for text:",
        selectedText,
        "on page:",
        pageNum
      );

      try {
        // Send message to background script to summarize the selected text
        const response = await chrome.runtime.sendMessage({
          type: 'EXPLAIN_SELECTION',
          payload: {
            text: selectedText,
            docHash
          }
        });

        console.log("[App] Received response from background:", response);

        if (response && response.success && response.summary) {
          console.log('[App] Received explanation:', response.summary);

          // Display the summary in the term popup with adjusted position
          setSelectedTerm(response.summary);
          setTermSourceRects(normalizedRects);
          setTermSourcePage(pageNum);
          setTermReturnPage(null); // Reset return page when opening a new explanation
          const adjustedPos = calculatePopupPosition(first.left, first.top + first.height);
          setTermPopupPosition(adjustedPos);
        } else {
          console.error(
            "[App] Failed to get explanation:",
            response?.error || "No response received"
          );
          // Show error to user
          alert(
            `Failed to generate explanation: ${response?.error || "No response received"}`
          );
        }
      } catch (error) {
        console.error("[App] Error requesting explanation:", error);
        alert(
          `Error requesting explanation: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }

      setContextVisible(false);
      return;
    }

    if (action === "comment") {
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
      setCommentAnchor({
        x: first.left,
        y: first.top - 24,
        page: pageNum,
        range,
      });
      setCommentInput("");
      setContextVisible(false);
      return;
    }

    if (!action.startsWith("note:")) return;
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

    // Normalize rects to fractions of page width/height so notes scale with zoom
    const relRects = rects.map((r) => ({
      top: (r.top - pageBox.top) / pageBox.height,
      left: (r.left - pageBox.left) / pageBox.width,
      width: r.width / pageBox.width,
      height: r.height / pageBox.height,
    }));

    // Open input field for note text
    setNoteAnchor({
      x: first.left,
      y: first.top - 24,
      page: pageNum,
      color,
      rects: relRects,
    });
    setNoteInput("");

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
          const nowVisible: number[] = [];
          const nowHidden: number[] = [];

          entries.forEach((entry) => {
            const pageNum = parseInt(
              entry.target.getAttribute("data-page-num") || "0",
              10
            );

            if (entry.isIntersecting) {
              visiblePagesRef.current.add(pageNum);
              nowVisible.push(pageNum);

              // Track most visible page
              if (entry.intersectionRatio > maxRatio) {
                maxRatio = entry.intersectionRatio;
                mostVisiblePage = pageNum;
              }
            } else {
              visiblePagesRef.current.delete(pageNum);
              nowHidden.push(pageNum);
            }
          });

          if (nowVisible.length > 0 || nowHidden.length > 0) {
            console.log(
              `[IntersectionObserver] Visible:`,
              nowVisible,
              `Hidden:`,
              nowHidden,
              `All visible:`,
              Array.from(visiblePagesRef.current)
            );
          }

          // Update current page if we found a visible page with decent ratio
          if (mostVisiblePage > 0 && maxRatio >= 0.3) {
            console.log(
              `[IntersectionObserver] Updating current page to ${mostVisiblePage} (ratio: ${maxRatio.toFixed(2)})`
            );
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

  // Backup scroll-based page tracking (in case IntersectionObserver doesn't fire)
  useEffect(() => {
    const container = containerRef.current;
    if (!container || pages.length === 0) return;

    const handleScroll = () => {
      const containerRect = container.getBoundingClientRect();
      const containerTop = containerRect.top;
      const containerBottom = containerRect.bottom;
      const containerMidY = containerRect.top + containerRect.height / 2;

      // Find the page closest to the middle of the viewport
      let closestPage = 1;
      let minDistance = Infinity;

      // Update visible pages set
      const newVisiblePages = new Set<number>();

      const pageElements = container.querySelectorAll("[data-page-num]");
      pageElements.forEach((el) => {
        const pageNum = parseInt(el.getAttribute("data-page-num") || "0", 10);
        if (pageNum === 0) return;

        const rect = el.getBoundingClientRect();

        // Check if page is visible in viewport
        const isVisible =
          rect.bottom > containerTop && rect.top < containerBottom;
        if (isVisible) {
          newVisiblePages.add(pageNum);
        }

        // Find closest page to center
        const pageMidY = rect.top + rect.height / 2;
        const distance = Math.abs(pageMidY - containerMidY);

        if (distance < minDistance) {
          minDistance = distance;
          closestPage = pageNum;
        }
      });

      // Update visible pages ref (for IntersectionObserver compatibility)
      const oldVisibleArray = Array.from(visiblePagesRef.current).sort();
      const newVisibleArray = Array.from(newVisiblePages).sort();
      const visibleChanged =
        oldVisibleArray.length !== newVisibleArray.length ||
        oldVisibleArray.some((p, i) => p !== newVisibleArray[i]);

      visiblePagesRef.current = newVisiblePages;

      // Update visible pages state (triggers re-render)
      if (visibleChanged) {
        console.log(
          `[Scroll] Visible pages changed:`,
          oldVisibleArray,
          "->",
          newVisibleArray
        );
        setVisiblePages(newVisiblePages);
      }

      // Update current page if changed
      if (closestPage !== currentPage) {
        console.log(
          `[Scroll] Updating current page from ${currentPage} to ${closestPage}`
        );
        setCurrentPage(closestPage);
      }
    };

    // Use requestAnimationFrame to throttle scroll events efficiently
    let rafId: number | null = null;
    const throttledScroll = () => {
      if (rafId) return; // Already scheduled

      rafId = requestAnimationFrame(() => {
        handleScroll();
        rafId = null;
      });
    };

    container.addEventListener("scroll", throttledScroll, { passive: true });

    // Initial call to set up visible pages
    // Delay if we're on initial load to allow scroll restoration to complete
    if (isInitialLoad) {
      // Wait for scroll restoration to complete before checking visible pages
      setTimeout(() => {
        handleScroll();
      }, 150);
    } else {
      handleScroll();
    }

    return () => {
      container.removeEventListener("scroll", throttledScroll);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [currentPage, pages.length, scale, isInitialLoad]); // Added scale dependency so visibility rechecks on zoom

  // Handler functions
  const handlePrevPage = useCallback(() => {
    const step = isTwoPageMode ? 2 : 1;
    const target = Math.max(1, currentPage - step);
    scrollToPage(target);
  }, [currentPage, isTwoPageMode]);

  const handleNextPage = useCallback(() => {
    const step = isTwoPageMode ? 2 : 1;
    const target = Math.min(pages.length, currentPage + step);
    scrollToPage(target);
  }, [currentPage, pages.length, isTwoPageMode]);

  const scrollToPage = (pageNum: number) => {
    if (isTwoPageMode) {
      setCurrentPage(pageNum);
      return;
    }
    const pageEl = containerRef.current?.querySelector(
      `[data-page-num="${pageNum}"]`
    );
    if (pageEl) {
      pageEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };
  // changeZoom: adjusts zoom while preserving scroll position appropriately
  // options.cursorPoint -> preserve the document point under cursor
  // options.snapToTop -> keep the current top-most page top aligned after zoom
  // Uses RAF throttling to prevent excessive updates during rapid zoom
  const changeZoom = useCallback(
    (
      newZoom: string,
      options?: { cursorPoint?: { x: number; y: number }; snapToTop?: boolean }
    ) => {
      const container = containerRef.current;
      if (!container || pages.length === 0) {
        setZoom(newZoom);
        return;
      }

      // Cancel any pending zoom animation
      if (pendingZoomRef.current !== null) {
        cancelAnimationFrame(pendingZoomRef.current);
        pendingZoomRef.current = null;
      }

      const oldScale = scale;

      // compute new scale synchronously using calculateScale
      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight - 40;
      const calcScale = calculateScale(
        pages[0]!,
        containerWidth,
        containerHeight,
        newZoom === "fitWidth" || newZoom === "fitPage"
          ? newZoom
          : parseInt(newZoom, 10)
      );

      // Decide new scrollTop based on options
      let newScrollTop: number | null = null;

      if (options?.cursorPoint) {
        const containerRect = container.getBoundingClientRect();
        const cursorOffset = options.cursorPoint.y - containerRect.top;
        const absoluteOffsetBefore = container.scrollTop + cursorOffset;
        // Scale the absolute offset
        newScrollTop =
          absoluteOffsetBefore * (calcScale / Math.max(oldScale, 0.0001)) -
          cursorOffset;
      } else if (options?.snapToTop) {
        // Find the current top-most visible page (use currentPage)
        const pageEl = container.querySelector(
          `[data-page-num="${currentPage}"]`
        ) as HTMLElement | null;
        if (pageEl) {
          const pageOffset = pageEl.offsetTop; // offset within container
          newScrollTop = pageOffset * (calcScale / Math.max(oldScale, 0.0001));
        }
      } else {
        // default: keep center stable
        const centerOffset = container.scrollTop + container.clientHeight / 2;
        newScrollTop =
          centerOffset * (calcScale / Math.max(oldScale, 0.0001)) -
          container.clientHeight / 2;
      }

      // Apply new scrollTop (clamped) synchronously before changing zoom
      if (newScrollTop != null) {
        // clamp
        const maxScroll = container.scrollHeight - container.clientHeight;
        const clamped = Math.max(0, Math.min(maxScroll, newScrollTop));

        // Force instant jump to the computed scroll position to avoid transient
        // smooth scrolls that reveal the top of the page. Temporarily set
        // scrollBehavior to 'auto'.
        const prevBehavior = (container.style as any).scrollBehavior;
        try {
          (container.style as any).scrollBehavior = "auto";
          container.scrollTo({ top: clamped });
        } finally {
          (container.style as any).scrollBehavior = prevBehavior || "";
        }
      }

      // Apply zoom and scale using RAF to throttle rapid updates
      pendingZoomRef.current = requestAnimationFrame(() => {
        pendingZoomRef.current = null;
        setZoom(newZoom);
        setScale(calcScale);
      });
    },
    [pages, containerRef, scale, currentPage]
  );

  const handleZoomIn = useCallback(() => {
    if (zoom === "fitWidth" || zoom === "fitPage") {
      // Compute current fit percent and choose the nearest higher numeric zoom
      const container = containerRef.current;
      if (!container || !pages[0]) {
        changeZoom("100", { snapToTop: true });
        return;
      }

      try {
        const cw = container.clientWidth;
        const ch = container.clientHeight - 40;
        const s = calculateScale(pages[0], cw, ch, zoom as 'fitWidth' | 'fitPage');
        const percent = Math.round((s / DPI_ADJUSTMENT) * 100);
        const nextZoom = ZOOM_LEVELS.find((z) => z > percent) || ZOOM_LEVELS[ZOOM_LEVELS.length - 1];
        changeZoom(nextZoom.toString(), { snapToTop: true });
      } catch (e) {
        changeZoom("100", { snapToTop: true });
      }
    } else {
      const currentZoom = parseInt(zoom, 10);
      const nextZoom =
        ZOOM_LEVELS.find((z) => z > currentZoom) ||
        ZOOM_LEVELS[ZOOM_LEVELS.length - 1];
      changeZoom(nextZoom.toString(), { snapToTop: true });
    }
  }, [zoom, changeZoom]);

  const handleZoomOut = useCallback(() => {
    if (zoom === "fitWidth" || zoom === "fitPage") {
      // Compute current fit percent and choose the nearest lower numeric zoom
      const container = containerRef.current;
      if (!container || !pages[0]) {
        changeZoom("100", { snapToTop: true });
        return;
      }

      try {
        const cw = container.clientWidth;
        const ch = container.clientHeight - 40;
        const s = calculateScale(pages[0], cw, ch, zoom as 'fitWidth' | 'fitPage');
        const percent = Math.round((s / DPI_ADJUSTMENT) * 100);
        const reversed = [...ZOOM_LEVELS].reverse();
        const prevZoom = reversed.find((z) => z < percent) || ZOOM_LEVELS[0];
        changeZoom(prevZoom.toString(), { snapToTop: true });
      } catch (e) {
        changeZoom("100", { snapToTop: true });
      }
    } else {
      const currentZoom = parseInt(zoom, 10);
      const prevZoom =
        [...ZOOM_LEVELS].reverse().find((z) => z < currentZoom) || 50;
      changeZoom(prevZoom.toString(), { snapToTop: true });
    }
  }, [zoom, changeZoom]);

  // Toggle two-page mode
  const toggleTwoPageMode = useCallback(() => {
    setIsTwoPageMode((prev) => !prev);
    // Force recompute of term highlight positions on layout change
    setLayoutVersion((v) => v + 1);
    // Snap to keep current page in view after layout change
    requestAnimationFrame(() => {
      scrollToPage(currentPage);
    });
    // Reset wheel gesture accumulators/cooldown
    wheelAccumXRef.current = 0;
    wheelAccumYRef.current = 0;
    wheelCooldownRef.current = false;
  }, [currentPage]);

  const openBottomControlsFromHover = useCallback(() => {
    if (bottomHoverTimeoutRef.current) {
      clearTimeout(bottomHoverTimeoutRef.current);
      bottomHoverTimeoutRef.current = null;
    }
    setBottomControlVisible(true);
  }, []);

  const scheduleCloseBottomControlsFromHover = useCallback(() => {
    if (bottomHoverTimeoutRef.current) {
      clearTimeout(bottomHoverTimeoutRef.current);
    }
    bottomHoverTimeoutRef.current = setTimeout(() => {
      setBottomControlVisible(false);
      bottomHoverTimeoutRef.current = null;
    }, 500);
  }, []);

  // Ref for print handler so keyboard effect can call it without ordering issues
  const handlePrintRef = useRef<(() => Promise<void>) | null>(null);

  // Handler to save term summary as a note
  const handleSaveTermAsNote = useCallback(
    async (termSummary: TermSummary) => {
      try {
        // Format the note text with term definition and key points
        const noteText = `📖 ${termSummary.term}

Definition: ${termSummary.definition}

Key Points:
• ${termSummary.explanation1}
• ${termSummary.explanation2}
• ${termSummary.explanation3}`;

      // Use the page where the term was clicked/selected, not where the context is
      const notePage = termSourcePage || currentPage;

      // Use the rectangles where the term was found, or create a small indicator
      const noteRects = termSourceRects.length > 0 ? termSourceRects : [{
        top: 0.02,    // 2% from top
        left: 0.02,   // 2% from left
        width: 0.06,  // 6% of page width (small indicator)
        height: 0.03, // 3% of page height
      }];

      // Create note with the rectangles from the term location
      const noteId = `${docHash}:${notePage}:${Date.now()}`;
      const newNote = {
        id: noteId,
        docHash,
        page: notePage,
        rects: noteRects,
        color: 'yellow', // Default color
        text: noteText,
        createdAt: Date.now(),
        termSummary: termSummary, // Store full term summary metadata for restoration
      };

      await putNote(newNote);
      setNotes((prev) => [...prev, newNote]);

      // Add term to saved terms set to hide its highlight
      setSavedTerms((prev) => new Set(prev).add(termSummary.term));

      console.log('[App] Saved term summary as note on page', notePage, ':', termSummary.term, 'with rects:', noteRects);

      // Close the popup after saving
      setSelectedTerm(null);
      setTermPopupPosition(null);
      setTermSourceRects([]);
      setTermSourcePage(1);
      setTermReturnPage(null);
      
      // Optional: show a brief success message
      // You could add a toast notification here if you have that component
    } catch (err) {
      console.error('[App] Failed to save term as note:', err);
      alert('Failed to save note. Please try again.');
    }
  }, [docHash, currentPage, termSourceRects, termSourcePage]);

  // Keyboard navigation and ctrl+scroll zoom
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey;

      // Intercept Ctrl/Cmd+P to use in-app printing flow
      if (isMod && (e.key === "p" || e.key === "P")) {
        e.preventDefault();
        // call print handler via ref (may be set after effect declared)
        (async () => {
          try {
            const fn = handlePrintRef.current;
            if (fn) await fn();
            else console.warn("Print handler not ready");
          } catch (err) {
            console.error("Error running in-app print", err);
          }
        })();
        return;
      }

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

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      // Cancel any pending zoom animation
      if (pendingZoomRef.current !== null) {
        cancelAnimationFrame(pendingZoomRef.current);
      }
    };
  }, [handlePrevPage, handleNextPage, handleZoomIn, handleZoomOut]);

    // Note handlers
    const handleNoteDelete = useCallback(async (id: string) => {
      try {
        // Find the note before deleting to check if it's a saved term note
        const noteToDelete = notes.find((n) => n.id === id);
        
        await deleteNote(id);
        setNotes((prev) => prev.filter((n) => n.id !== id));
        
        // If this was a saved term note, restore its highlight using full metadata
        if (noteToDelete?.termSummary) {
          setSavedTerms((prev) => {
            const newSet = new Set(prev);
            newSet.delete(noteToDelete.termSummary!.term);
            return newSet;
          });
        }
      } catch (err) {
        console.error("Failed to delete note", err);
      }
    }, [notes]);

  const handleNoteEdit = useCallback(
    async (id: string, newText: string) => {
      try {
        const note = notes.find((n) => n.id === id);
        if (!note) return;

        const updatedNote = { ...note, text: newText.trim() || undefined };
        await putNote(updatedNote);
        setNotes((prev) => prev.map((n) => (n.id === id ? updatedNote : n)));
      } catch (err) {
        console.error("Failed to update note", err);
      }
    },
    [notes]
  );

  // Comment handlers
  const handleCommentDelete = useCallback(async (id: string) => {
    try {
      await deleteComment(id);
      setComments((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      console.error("Failed to delete comment", err);
    }
  }, []);

  const handleCommentEdit = useCallback(
    async (id: string, newText: string) => {
      try {
        const comment = comments.find((c) => c.id === id);
        if (!comment) return;

        const updatedComment = { ...comment, text: newText };
        await putComment(updatedComment);
        setComments((prev) =>
          prev.map((c) => (c.id === id ? updatedComment : c))
        );
      } catch (err) {
        console.error("Failed to update comment", err);
      }
    },
    [comments]
  );

  // Download and print handlers
  const handleDownload = useCallback(async () => {
    try {
      // Prefer original URL or OPFS uploadId
      if (fileUrl) {
        // Trigger download by navigating to the URL (preserve CORS behavior)
        const a = document.createElement("a");
        a.href = fileUrl;
        a.download = fileName || "document.pdf";
        document.body.appendChild(a);
        a.click();
        a.remove();
        return;
      }

      if (uploadId) {
        const arrayBuffer = await readOPFSFile(uploadId);
        const blob = new Blob([arrayBuffer], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName || "document.pdf";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        return;
      }

      // Fallback: try to get raw data from pdfjs (if supported)
      if (pdf && typeof (pdf as any).getData === "function") {
        const data = await (pdf as any).getData();
        const blob = new Blob([data], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName || "document.pdf";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        return;
      }

      console.warn("No source available for download");
    } catch (err) {
      console.error("Download failed", err);
    }
  }, [fileUrl, uploadId, pdf, fileName]);

  // Document properties modal state
  const [docPropsOpen, setDocPropsOpen] = useState(false);
  const [docProps, setDocProps] = useState<any>(null);
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [saveAsBlob, setSaveAsBlob] = useState<Blob | null>(null);

  const handleDocumentProperties = useCallback(async () => {
    try {
      // File size: prefer OPFS uploadId, then HEAD on fileUrl, then pdf.getData()
      let fileSize: number | null = null;

      if (uploadId) {
        try {
          const ab = await readOPFSFile(uploadId);
          fileSize = (ab && ab.byteLength) || null;
        } catch (e) {
          console.warn('Failed to read OPFS file for size', e);
        }
      } else if (fileUrl) {
        try {
          // Try HEAD first to avoid fetching entire file
          const head = await fetch(fileUrl, { method: 'HEAD' });
          const cl = head.headers.get('content-length');
          if (cl) fileSize = parseInt(cl, 10);
          else {
            const resp = await fetch(fileUrl);
            if (resp.ok) {
              const ab = await resp.arrayBuffer();
              fileSize = ab.byteLength;
            }
          }
        } catch (e) {
          console.warn('HEAD/GET for fileUrl failed when computing size', e);
        }
      }

      if (fileSize == null && pdf && typeof (pdf as any).getData === 'function') {
        try {
          const data = await (pdf as any).getData();
          fileSize = data?.byteLength ?? data?.length ?? null;
        } catch (e) {
          console.warn('pdf.getData failed when computing size', e);
        }
      }

      // PDF metadata
      let meta: any = null;
      try {
        meta = await (pdf as any).getMetadata?.();
      } catch (e) {
        console.warn('getMetadata failed', e);
      }

      const info = meta?.info || {};
      const metadata = meta?.metadata;

      const title = info.Title || info.title || (metadata && typeof metadata.get === 'function' ? metadata.get('dc:title') : undefined);
      const author = info.Author || info.author;
      const subject = info.Subject || info.subject;
      const keywords = info.Keywords || info.keywords;
      const creationDate = info.CreationDate || info.Creation || info['CreationDate'];
      const modDate = info.ModDate || info.ModificationDate || info['ModDate'];
      const creator = info.Creator || info.creator;
      const producer = info.Producer || info.producer;

      // PDF version detection (best-effort)
      const pdfInfo = (pdf as any)?.pdfInfo || (pdf as any)?._pdfInfo || {};
      const pdfVersion = pdfInfo?.PDFFormatVersion || pdfInfo?.pdfFormatVersion || info.PDFFormatVersion || meta?.pdfFormatVersion || undefined;

      // Page count & page sizes (use loaded pages state)
      const pageCount = (pdf && (pdf as any).numPages) || pages.length;
      const pageSizes = pages.map((p, idx) => {
        if (!p) return null;
        try {
          // PDFPageProxy.view is usually [xMin, yMin, xMax, yMax]
          const w = Math.round((p as any).view?.[2] ?? (p.getViewport({ scale: 1 }).width ?? 0));
          const h = Math.round((p as any).view?.[3] ?? (p.getViewport({ scale: 1 }).height ?? 0));
          return { page: idx + 1, width: w, height: h };
        } catch (e) {
          return { page: idx + 1, width: 0, height: 0 };
        }
      });

      const fastWebView = Boolean((pdf as any)?.linearized || pdfInfo?.isLinearized || info?.Linearized);

      const result = {
        fileName,
        fileSize,
        title,
        author,
        subject,
        keywords,
        creationDate,
        modDate,
        creator,
        producer,
        pdfVersion,
        pageCount,
        pageSizes,
        fastWebView,
      };

      setDocProps(result);
      setDocPropsOpen(true);
    } catch (err) {
      console.error('Failed to gather document properties', err);
      alert('Failed to read document properties');
    }
  }, [pdf, pages, fileUrl, uploadId, fileName]);

  const handleDownloadWithAnnotations = useCallback(async () => {
    try {
      // Obtain original PDF bytes similar to handleDownload
      let arrayBuffer: ArrayBuffer | null = null;

      if (uploadId) {
        arrayBuffer = await readOPFSFile(uploadId);
      } else if (fileUrl) {
        try {
          const resp = await fetch(fileUrl, { mode: 'cors' });
          if (resp.ok) arrayBuffer = await resp.arrayBuffer();
        } catch (e) {
          // ignore - fall back to pdf.getData below
        }
      } else if (pdf && typeof (pdf as any).getData === 'function') {
        arrayBuffer = await (pdf as any).getData();
      }

      if (!arrayBuffer) {
        console.warn('No source available for annotated download');
        return;
      }

      // Collect annotations from DB/state
      const ns = await getNotesByDoc(docHash).catch(() => notes);
      const cs = await getCommentsByDoc(docHash).catch(() => comments);
      const drawings = await getDrawingsByDoc(docHash).catch(async () => {
        // fallback to pageDrawings map
        const arr: any[] = [];
        for (const [pageNum, strokes] of pageDrawings.entries()) {
          arr.push({ pageNum, strokes });
        }
        return arr;
      });

      // Build page render sizes using DOM page elements
      const pageRenderSizes: Record<number, { width: number; height: number }> = {};
      for (let p = 1; p <= pages.length; p++) {
        const el = document.querySelector(`[data-page-num="${p}"]`) as HTMLElement | null;
        if (el) {
          const r = el.getBoundingClientRect();
          pageRenderSizes[p] = { width: r.width, height: r.height };
        }
      }

      const modified = await mergeAnnotationsIntoPdf(arrayBuffer, {
        notes: ns || [],
        comments: cs || [],
        drawings: drawings || [],
        pageRenderSizes,
      });

  const blob = new Blob([modified as any], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = (fileName || 'document.pdf').replace(/\.pdf$/i, '') + '-annotated.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

    } catch (err) {
      console.error('Annotated download failed', err);
    }
  }, [uploadId, fileUrl, pdf, fileName, docHash, notes, comments, pageDrawings, pages]);

  // Save as (open OS save dialog and write annotated PDF)
  const handleSaveAs = useCallback(async () => {
    try {
      // Build annotated PDF bytes (similar to handleDownloadWithAnnotations)
      let arrayBuffer: ArrayBuffer | null = null;

      if (uploadId) {
        arrayBuffer = await readOPFSFile(uploadId);
      } else if (fileUrl) {
        try {
          const resp = await fetch(fileUrl, { mode: 'cors' });
          if (resp.ok) arrayBuffer = await resp.arrayBuffer();
        } catch (e) {
          // ignore - fall back to pdf.getData below
        }
      } else if (pdf && typeof (pdf as any).getData === 'function') {
        arrayBuffer = await (pdf as any).getData();
      }

      if (!arrayBuffer) {
        console.warn('No source available for Save as');
        return;
      }

      // Collect annotations from DB/state
      const ns = await getNotesByDoc(docHash).catch(() => notes);
      const cs = await getCommentsByDoc(docHash).catch(() => comments);
      const drawings = await getDrawingsByDoc(docHash).catch(async () => {
        const arr: any[] = [];
        for (const [pageNum, strokes] of pageDrawings.entries()) {
          arr.push({ pageNum, strokes });
        }
        return arr;
      });

      const pageRenderSizes: Record<number, { width: number; height: number }> = {};
      for (let p = 1; p <= pages.length; p++) {
        const el = document.querySelector(`[data-page-num="${p}"]`) as HTMLElement | null;
        if (el) {
          const r = el.getBoundingClientRect();
          pageRenderSizes[p] = { width: r.width, height: r.height };
        }
      }

      const modified = await mergeAnnotationsIntoPdf(arrayBuffer, {
        notes: ns || [],
        comments: cs || [],
        drawings: drawings || [],
        pageRenderSizes,
      });

      const blob = new Blob([modified as any], { type: 'application/pdf' });

      // If the File System Access API is available, open native save dialog
      const hasPicker = typeof (window as any).showSaveFilePicker === 'function';
      if (hasPicker) {
        try {
          const suggested = ((fileName || 'document').replace(/\.pdf$/i, '') + '-annotated.pdf');
          const handle = await (window as any).showSaveFilePicker({
            suggestedName: suggested,
            types: [
              {
                description: 'PDF Document',
                accept: { 'application/pdf': ['.pdf'] },
              },
            ],
          });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          return;
        } catch (err) {
          // If the user cancels or API fails, fall back to SaveAsModal
          console.warn('showSaveFilePicker failed or cancelled', err);
        }
      }

      // Fallback: open our Save As modal so the user can provide a filename
      setSaveAsBlob(blob);
      setSaveAsOpen(true);
    } catch (err) {
      console.error('Save as failed', err);
    }
  }, [uploadId, fileUrl, pdf, fileName, docHash, notes, comments, pageDrawings, pages]);

  const handlePrint = useCallback(async () => {
    try {
      let blob: Blob | null = null;

      if (uploadId) {
        const arrayBuffer = await readOPFSFile(uploadId);
        blob = new Blob([arrayBuffer], { type: "application/pdf" });
      } else if (fileUrl) {
        // Try to fetch the file bytes (may fail due to CORS)
        try {
          const resp = await fetch(fileUrl, { mode: "cors" });
          if (resp.ok) {
            const ab = await resp.arrayBuffer();
            blob = new Blob([ab], { type: "application/pdf" });
          } else {
            // Can't fetch; fall back to opening URL
            const w = window.open(fileUrl, "_blank");
            if (w) w.focus();
            return;
          }
        } catch (e) {
          // CORS or network error - fall back to opening URL
          const w = window.open(fileUrl, "_blank");
          if (w) w.focus();
          return;
        }
      } else if (pdf && typeof (pdf as any).getData === "function") {
        const data = await (pdf as any).getData();
        blob = new Blob([data], { type: "application/pdf" });
      }

      if (!blob) {
        console.warn("No source available for print");
        return;
      }

      const url = URL.createObjectURL(blob);

      // Create an invisible iframe in the current document (same-origin blob URL)
      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0px";
      iframe.style.height = "0px";
      iframe.style.border = "0";
      iframe.src = url;
      document.body.appendChild(iframe);

      const cleanup = () => {
        try {
          if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        } catch (e) {}
        try {
          URL.revokeObjectURL(url);
        } catch (e) {}
      };

      const onLoad = () => {
        try {
          iframe.contentWindow?.focus();
          // Trigger print in the iframe (should open print dialog)
          iframe.contentWindow?.print();
        } catch (e) {
          console.warn("Iframe print failed", e);
          // Fallback: open blob URL in new tab
          try {
            window.open(url, "_blank")?.focus();
          } catch (err) {}
        } finally {
          // Attach afterprint listener so we cleanup when printing completes in supporting browsers
          try {
            const win = iframe.contentWindow as Window | null;
            if (win && typeof (win as any).addEventListener === 'function') {
              // Use afterprint event to cleanup when the print dialog finishes
              win.addEventListener('afterprint', cleanup, { once: true });
            }
          } catch (e) {
            // ignore
          }

          // Fallback: schedule cleanup after a generous delay in case afterprint isn't supported
          setTimeout(cleanup, 60000); // 60s
        }
      };

      // Attach load handler
      iframe.addEventListener("load", onLoad, { once: true });

      // Safety: if load never fires, attempt print after 1s. Keep a long fallback cleanup so we don't
      // revoke the blob/iframe too early and accidentally close the print dialog.
      setTimeout(() => {
        try {
          if (iframe.contentWindow) iframe.contentWindow.print();
        } catch (e) {}
      }, 1000);
    } catch (err) {
      console.error("Print failed", err);
    }
  }, [fileUrl, uploadId, pdf]);

  // Keep ref updated so keyboard handler can call print without ordering issues
  useEffect(() => {
    handlePrintRef.current = handlePrint;
    return () => {
      handlePrintRef.current = null;
    };
  }, [handlePrint]);

  // Cleanup highlights toast timeout on unmount
  useEffect(() => {
    return () => {
      if (highlightsToastTimeoutRef.current) {
        clearTimeout(highlightsToastTimeoutRef.current);
      }
    };
  }, []);

  // Drawing handlers
  const handleToggleDrawing = useCallback(() => {
    setIsDrawingMode(prev => !prev);
  }, []);

  const handleColorSelect = useCallback((color: string) => {
    setDrawingColor(color);
  }, []);

  const handleToggleEraser = useCallback(() => {
    setIsEraserMode(prev => !prev);
  }, []);

  const handleDrawingStrokesChange = useCallback((pageNum: number, strokes: DrawingStroke[]) => {
    setPageDrawings(prev => {
      const updated = new Map(prev);
      updated.set(pageNum, strokes);
      return updated;
    });

    // Save to history for undo/redo
    setDrawingHistory(prev => {
      const updated = new Map(prev);
      const pageHistory = updated.get(pageNum) || [];
      const currentIndex = drawingHistoryIndex.get(pageNum) ?? -1;

      // Trim any future history if we're not at the end
      const trimmedHistory = pageHistory.slice(0, currentIndex + 1);
      trimmedHistory.push(strokes);

      updated.set(pageNum, trimmedHistory);
      return updated;
    });

    setDrawingHistoryIndex(prev => {
      const updated = new Map(prev);
      const currentIndex = prev.get(pageNum) ?? -1;
      updated.set(pageNum, currentIndex + 1);
      return updated;
    });

    // Save to IndexedDB (non-blocking, error handling)
    (async () => {
      try {
        const id = `${docHash}:${pageNum}`;
        const now = Date.now();
        const drawingRecord: DrawingRecord = {
          id,
          docHash,
          pageNum,
          strokes,
          createdAt: now,
          updatedAt: now,
        };
        await putDrawing(drawingRecord);
        console.log(`[Drawing] Saved page ${pageNum} with ${strokes.length} strokes`);
      } catch (err) {
        console.error(`[Drawing] Failed to save page ${pageNum}:`, err);
        // Non-fatal: drawing is still in memory
      }
    })();
  }, [drawingHistoryIndex, docHash]);

  const handleDrawingUndo = useCallback((pageNum: number) => {
    const currentIndex = drawingHistoryIndex.get(pageNum) ?? -1;
    if (currentIndex <= 0) return;

    const newIndex = currentIndex - 1;
    setDrawingHistoryIndex(prev => {
      const updated = new Map(prev);
      updated.set(pageNum, newIndex);
      return updated;
    });

    const history = drawingHistory.get(pageNum) || [];
    const previousStrokes = history[newIndex] || [];
    setPageDrawings(prev => {
      const updated = new Map(prev);
      updated.set(pageNum, previousStrokes);
      return updated;
    });
  }, [drawingHistory, drawingHistoryIndex]);

  const handleDrawingRedo = useCallback((pageNum: number) => {
    const history = drawingHistory.get(pageNum) || [];
    const currentIndex = drawingHistoryIndex.get(pageNum) ?? -1;
    if (currentIndex >= history.length - 1) return;

    const newIndex = currentIndex + 1;
    setDrawingHistoryIndex(prev => {
      const updated = new Map(prev);
      updated.set(pageNum, newIndex);
      return updated;
    });

    const nextStrokes = history[newIndex] || [];
    setPageDrawings(prev => {
      const updated = new Map(prev);
      updated.set(pageNum, nextStrokes);
      return updated;
    });
  }, [drawingHistory, drawingHistoryIndex]);

  const handleDrawingClear = useCallback((pageNum: number) => {
    handleDrawingStrokesChange(pageNum, []);
  }, [handleDrawingStrokesChange]);

  // Keyboard navigation and shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey;

      // Intercept Ctrl/Cmd+P to use in-app printing flow
      if (isMod && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        // call print handler via ref (may be set after effect declared)
        (async () => {
          try {
            const fn = handlePrintRef.current;
            if (fn) await fn();
            else console.warn('Print handler not ready');
          } catch (err) {
            console.error('Error running in-app print', err);
          }
        })();
        return;
      }

      // Intercept Ctrl/Cmd+S to save PDF (in-app Save As)
      if (isMod && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        (async () => {
          try {
            await handleSaveAs();
          } catch (err) {
            console.error('Save as shortcut failed', err);
          }
        })();
        return;
      }

      // Drawing mode shortcuts
      if (isDrawingMode) {
        if (e.key === "Escape") {
          e.preventDefault();
          setIsDrawingMode(false);
          return;
        }

        // Toggle eraser with 'E' key
        if (e.key === "e" || e.key === "E") {
          e.preventDefault();
          setIsEraserMode(prev => !prev);
          return;
        }

        // Undo: Ctrl+Z (or Cmd+Z on Mac)
        if (isMod && e.key === "z" && !e.shiftKey) {
          e.preventDefault();
          handleDrawingUndo(currentPage);
          return;
        }

        // Redo: Ctrl+Y or Ctrl+Shift+Z (or Cmd+Y / Cmd+Shift+Z on Mac)
        if (isMod && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
          e.preventDefault();
          handleDrawingRedo(currentPage);
          return;
        }
      }

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

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      // Cancel any pending zoom animation
      if (pendingZoomRef.current !== null) {
        cancelAnimationFrame(pendingZoomRef.current);
      }
    };
  }, [handlePrevPage, handleNextPage, handleZoomIn, handleZoomOut, isDrawingMode, handleDrawingUndo, handleDrawingRedo, currentPage]);

  // Ctrl+scroll zoom handler - attached to container only
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let wheelTimeout: NodeJS.Timeout | null = null;
    let accumulatedDelta = 0;

    const handleWheel = (e: WheelEvent) => {
      // Only handle ctrl/cmd + wheel for zooming
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        e.stopPropagation();

        // Accumulate wheel delta to handle trackpad/mouse wheel differences
        accumulatedDelta += e.deltaY;

        // Clear existing timeout
        if (wheelTimeout) {
          clearTimeout(wheelTimeout);
        }

        // Debounce zoom changes slightly to group rapid wheel events
        wheelTimeout = setTimeout(() => {
          const cursor = { x: e.clientX, y: e.clientY };

          if (accumulatedDelta < -10) {
            // zoom in around cursor (negative delta = scroll up)
            if (zoom === "fitWidth" || zoom === "fitPage") {
              changeZoom("100", { cursorPoint: cursor });
            } else {
              const currentZoom = parseInt(zoom, 10);
              const nextZoom =
                ZOOM_LEVELS.find((z) => z > currentZoom) ||
                ZOOM_LEVELS[ZOOM_LEVELS.length - 1];
              changeZoom(nextZoom.toString(), { cursorPoint: cursor });
            }
          } else if (accumulatedDelta > 10) {
            // zoom out around cursor (positive delta = scroll down)
            if (zoom === "fitWidth" || zoom === "fitPage") {
              changeZoom("100", { cursorPoint: cursor });
            } else {
              const currentZoom = parseInt(zoom, 10);
              const prevZoom =
                [...ZOOM_LEVELS].reverse().find((z) => z < currentZoom) || 50;
              changeZoom(prevZoom.toString(), { cursorPoint: cursor });
            }
          }

          // Reset accumulated delta
          accumulatedDelta = 0;
          wheelTimeout = null;
        }, 50); // 50ms debounce for wheel events
      }
      // If no ctrl/cmd, let the event propagate normally for regular scrolling
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", handleWheel);
      if (wheelTimeout) {
        clearTimeout(wheelTimeout);
      }
      container.removeEventListener("wheel", handleWheel);
      if (wheelTimeout) {
        clearTimeout(wheelTimeout);
      }
    };
  }, [zoom, changeZoom]);
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
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto mb-4"></div>
          <p className="text-neutral-600 dark:text-neutral-400">
            Loading PDF...
          </p>
        </div>
      </div>
    );
  }

  if (error === "cors") {
    return (
      <div className="flex items-center justify-center h-screen bg-neutral-100 dark:bg-neutral-900 p-4">
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
              className="block w-full px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded text-center transition-colors"
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
  // compute fit percentages to display numeric labels when in fit mode
  const containerForFit = containerRef.current;
  let fitWidthPercent = 100;
  let fitPagePercent = 100;
  if (containerForFit && pages[0]) {
    try {
      const cw = containerForFit.clientWidth;
      const ch = containerForFit.clientHeight - 40;
      const sWidth = calculateScale(pages[0], cw, ch, 'fitWidth');
      const sPage = calculateScale(pages[0], cw, ch, 'fitPage');
      // convert internal scale to user-facing percentage (account for DPI adjustment)
      fitWidthPercent = Math.round((sWidth / DPI_ADJUSTMENT) * 100);
      fitPagePercent = Math.round((sPage / DPI_ADJUSTMENT) * 100);
    } catch (e) {
      // ignore
    }
  }

  return (
    <div className="h-screen flex flex-col bg-neutral-100 dark:bg-neutral-850">
      <Toolbar
        ref={toolbarRef}
        currentPage={currentPage}
        totalPages={pages.length}
        zoom={zoom}
        fitWidthPercent={fitWidthPercent}
        fitPagePercent={fitPagePercent}
        onToggleTOC={handleToggleTOC}
        onPrevPage={handlePrevPage}
        onNextPage={handleNextPage}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onFitWidth={() => changeZoom("fitWidth", { snapToTop: true })}
        onFitPage={() => changeZoom("fitPage", { snapToTop: true })}
        onPageChange={(page) => scrollToPage(page)}
    onDownload={handleDownload}
  onDownloadWithAnnotations={handleDownloadWithAnnotations}
        onPrint={handlePrint}
    onDocumentProperties={handleDocumentProperties}
    onSaveAs={handleSaveAs}
        highlightsVisible={highlightsVisible}
        onToggleHighlights={handleToggleHighlights}
        isDrawingMode={isDrawingMode}
        onToggleDrawing={handleToggleDrawing}
      />
      {/* Drawing toolbar (fixed overlay) - rendered always so it doesn't shift layout */}
      <DrawingToolbar
        isExpanded={isDrawingMode}
        selectedColor={drawingColor}
        onColorSelect={handleColorSelect}
        onUndo={() => handleDrawingUndo(currentPage)}
        onRedo={() => handleDrawingRedo(currentPage)}
        onClear={() => handleDrawingClear(currentPage)}
        canUndo={(drawingHistoryIndex.get(currentPage) ?? -1) > 0}
        canRedo={(drawingHistoryIndex.get(currentPage) ?? -1) < ((drawingHistory.get(currentPage) || []).length - 1)}
        isEraserMode={isEraserMode}
        onToggleEraser={handleToggleEraser}
        toolbarTop={toolbarHeight}
      />

      {/* Left-edge hover target: 12px wide invisible strip to auto-open TOC when cursor hits the edge */}
      <div
        onMouseEnter={() => openFromHover()}
        onMouseLeave={() => scheduleCloseFromHover()}
        style={{ width: 12 }}
        className="fixed left-0 top-0 h-full z-40 bg-transparent"
        aria-hidden
      />

      {/* TOC slide-out panel. It is positioned below the toolbar and does not cover toolbar.
          When TOC is open from hover, overlay does not block interaction (pointer-events-none).
          If pinned, we add a small clickable close area and pointer events for overlay. */}
      <div
        className={`fixed left-0 top-0 z-50 transform transition-transform ${tocOpen ? "translate-x-0" : "-translate-x-full"}`}
        style={{
          // offset by toolbar height so the drawer doesn't cover the toolbar
          top: toolbarHeight,
          height: `calc(100% - ${toolbarHeight}px)`,
          // ensure it doesn't capture pointer events when open due to hover-only
        }}
        onMouseEnter={() => openFromHover()}
        onMouseLeave={() => scheduleCloseFromHover()}
      >
        <div className="relative h-full">
          <TOC
            items={tableOfContents ? buildTOCTree(tableOfContents.items) : []}
            onSelect={handleTOCSelect}
            notes={notes}
            comments={comments}
            onSelectBookmark={(item) => {
              if (typeof item.page === 'number') {
                scrollToPage(item.page);
              } else if (item.page) {
                scrollToPage(Number(item.page));
              }
            }}
            onAddContext={handleAddContextBookmark}
          />
        </div>
      </div>

      <div ref={containerRef} className={`flex-1 ${isTwoPageMode ? "overflow-hidden" : "overflow-auto"}`} onWheel={(e) => {
        if (!isTwoPageMode) return;
        // Disable native scrolling entirely in two-page mode
        e.preventDefault();
        e.stopPropagation();

        // Cooldown prevents multiple flips per gesture
        if (wheelCooldownRef.current) return;

        // Accumulate deltas; trackpad often mixes X/Y
        wheelAccumXRef.current += e.deltaX;
        wheelAccumYRef.current += e.deltaY;

        const THRESH_X = 80;   // horizontal swipe threshold
        const THRESH_Y = 160;  // vertical fling threshold

        const absX = Math.abs(wheelAccumXRef.current);
        const absY = Math.abs(wheelAccumYRef.current);

        if (absX >= THRESH_X || absY >= THRESH_Y) {
          // Determine direction by dominant axis
          const forward = absX >= absY
            ? wheelAccumXRef.current > 0
            : wheelAccumYRef.current > 0;

          if (forward) handleNextPage(); else handlePrevPage();

          // Reset accumulators and start cooldown
          wheelAccumXRef.current = 0;
          wheelAccumYRef.current = 0;
          wheelCooldownRef.current = true;
          setTimeout(() => { wheelCooldownRef.current = false; }, 350);
        }
      }} style={isTwoPageMode ? { overscrollBehavior: "contain" } : undefined}>
        <div className={`${isTwoPageMode ? "py-4 flex flex-row items-start justify-center gap-4 min-w-full" : "py-4 flex flex-col items-center"}`}>
          {(() => {
            const renderingPages: number[] = [];
            const visiblePagesArray = Array.from(visiblePages);

            if (isTwoPageMode) {
              // Determine the left page of the current spread
              const leftPageNum = currentPage % 2 === 0 ? currentPage - 1 : currentPage;
              const rightPageNum = Math.min(pages.length, leftPageNum + 1);

              const leftPage = pages[leftPageNum - 1] || null;
              const rightPage = pages[rightPageNum - 1] || null;

              const leftVisible = true;
              const rightVisible = rightPageNum !== leftPageNum;

              const hasCachedLeft = termCache.has(leftPageNum);
              const hasCachedRight = termCache.has(rightPageNum);

              const shouldRenderLeft = leftVisible || hasCachedLeft;
              const shouldRenderRight = rightVisible || hasCachedRight;

              if (shouldRenderLeft) renderingPages.push(leftPageNum);
              if (rightVisible && shouldRenderRight) renderingPages.push(rightPageNum);

              return (
                <div key={`spread-${leftPageNum}`} className="flex flex-row items-start justify-center gap-4 w-full" data-spread-left={leftPageNum}>
                  <Page
                    key={leftPageNum}
                    pageNum={leftPageNum}
                    page={leftPage}
                    scale={scale}
                    layoutVersion={layoutVersion}
                    isVisible={leftVisible}
                    shouldRender={shouldRenderLeft}
                    onRender={handleRender}
                    notes={notes.filter((n) => n.page === leftPageNum)}
                    comments={comments.filter((c) => c.page === leftPageNum)}
                    onNoteDelete={handleNoteDelete}
                    onNoteEdit={handleNoteEdit}
                    onCommentDelete={handleCommentDelete}
                    onCommentEdit={handleCommentEdit}
                    isDrawingMode={isDrawingMode}
                    drawingColor={drawingColor}
                    drawingStrokeWidth={drawingStrokeWidth}
                    drawingStrokes={pageDrawings.get(leftPageNum) || []}
                    onDrawingStrokesChange={(strokes) => handleDrawingStrokesChange(leftPageNum, strokes)}
                    isEraserMode={isEraserMode}
                    termSummaries={getSummariesForPage(leftPageNum)}
                    onTermClick={(term, x, y, rects) => {
                      setSelectedTerm(term);
                      setTermSourceRects(rects);
                      setTermSourcePage(leftPageNum);
                      setTermReturnPage(null);
                      const adjustedPos = calculatePopupPosition(x, y);
                      setTermPopupPosition(adjustedPos);
                    }}
                    highlightsVisible={highlightsVisible}
                    onAddNoteContext={handleAddNoteContextFromPage}
                    onAddCommentContext={handleAddCommentContextFromPage}
                  />
                  {rightVisible && (
                    <Page
                      key={rightPageNum}
                      pageNum={rightPageNum}
                      page={rightPage}
                      scale={scale}
                      layoutVersion={layoutVersion}
                      isVisible={rightVisible}
                      shouldRender={shouldRenderRight}
                      onRender={handleRender}
                      notes={notes.filter((n) => n.page === rightPageNum)}
                      comments={comments.filter((c) => c.page === rightPageNum)}
                      onNoteDelete={handleNoteDelete}
                      onNoteEdit={handleNoteEdit}
                      onCommentDelete={handleCommentDelete}
                      onCommentEdit={handleCommentEdit}
                      isDrawingMode={isDrawingMode}
                      drawingColor={drawingColor}
                      drawingStrokeWidth={drawingStrokeWidth}
                      drawingStrokes={pageDrawings.get(rightPageNum) || []}
                      onDrawingStrokesChange={(strokes) => handleDrawingStrokesChange(rightPageNum, strokes)}
                      isEraserMode={isEraserMode}
                      termSummaries={getSummariesForPage(rightPageNum)}
                      onTermClick={(term, x, y, rects) => {
                        setSelectedTerm(term);
                        setTermSourceRects(rects);
                        setTermSourcePage(rightPageNum);
                        setTermReturnPage(null);
                        const adjustedPos = calculatePopupPosition(x, y);
                        setTermPopupPosition(adjustedPos);
                      }}
                      highlightsVisible={highlightsVisible}
                      onAddNoteContext={handleAddNoteContextFromPage}
                      onAddCommentContext={handleAddCommentContextFromPage}
                    />
                  )}
                </div>
              );
            }

            return pages.map((page, idx) => {
              const pageNum = idx + 1;
              const isVisible = visiblePages.has(pageNum);
              const hasCachedSummaries = termCache.has(pageNum);

              // Render visible pages + 4 pages buffer above/below
              // Also render any page with cached summaries so highlights are ready
              const shouldRender =
                isVisible ||
                hasCachedSummaries ||
                visiblePagesArray.some(
                  (vp) => Math.abs(vp - pageNum) <= 4
                );

              if (shouldRender) {
                renderingPages.push(pageNum);
              }

              // Log after first iteration
              if (idx === pages.length - 1 && renderingPages.length > 0) {
                console.log(
                  `[Render] Rendering pages:`,
                  renderingPages,
                  `(visible: [${visiblePagesArray}])`
                );
              }

              return (
                <Page
                key={pageNum}
                pageNum={pageNum}
                page={page}
                scale={scale}
                layoutVersion={layoutVersion}
                isVisible={isVisible}
                shouldRender={shouldRender}
                onRender={handleRender}
                notes={notes.filter((n) => n.page === pageNum)}
                comments={comments.filter((c) => c.page === pageNum)}
                onNoteDelete={handleNoteDelete}
                onNoteEdit={handleNoteEdit}
                onCommentDelete={handleCommentDelete}
                onCommentEdit={handleCommentEdit}
                isDrawingMode={isDrawingMode}
                drawingColor={drawingColor}
                drawingStrokeWidth={drawingStrokeWidth}
                drawingStrokes={pageDrawings.get(pageNum) || []}
                onDrawingStrokesChange={(strokes) => handleDrawingStrokesChange(pageNum, strokes)}
                isEraserMode={isEraserMode}
                termSummaries={getSummariesForPage(pageNum)}
                onTermClick={(term, x, y, rects) => {
                  console.log('[App] onTermClick called:', term.term, { x, y, rects, pageNum });
                  setSelectedTerm(term);
                  setTermSourceRects(rects);
                  setTermSourcePage(pageNum);
                  setTermReturnPage(null); // Reset return page when opening a new term
                  const adjustedPos = calculatePopupPosition(x, y);
                  setTermPopupPosition(adjustedPos);
                }}
                highlightsVisible={highlightsVisible}
                onAddNoteContext={handleAddNoteContextFromPage}
                onAddCommentContext={handleAddCommentContextFromPage}
              />
              );
            });
          })()}
        </div>
      </div>
      {/* Bottom-edge hover target to reveal view toggle (matches TOC behavior) */}
      <div
        onMouseEnter={() => openBottomControlsFromHover()}
        onMouseLeave={() => scheduleCloseBottomControlsFromHover()}
        style={{ height: 12 }}
        className="fixed bottom-0 left-0 w-full z-40 bg-transparent"
        aria-hidden
      />

      {/* Two-page mode toggle - circular button shown on bottom hover with slide-up animation */}
      <div
        className={`fixed bottom-3 left-1/2 -translate-x-1/2 z-50 ${bottomControlVisible ? "translate-y-0 opacity-100 pointer-events-auto" : "translate-y-6 opacity-0 pointer-events-none"} transition-all duration-200 ease-in-out`}
        onMouseEnter={() => openBottomControlsFromHover()}
        onMouseLeave={() => scheduleCloseBottomControlsFromHover()}
      >
        <button
          onClick={toggleTwoPageMode}
          className="h-10 w-10 rounded-full shadow-md flex items-center justify-center bg-neutral-100 text-primary-900 dark:bg-neutral-100 dark:text-neutral-900 hover:bg-primary-200 dark:hover:bg-primary-900/20"
          title={isTwoPageMode ? "Switch to single-page view" : "Switch to two-page view"}
          aria-label={isTwoPageMode ? "Switch to single-page view" : "Switch to two-page view"}
        >
          {isTwoPageMode ? <Book size={16} /> : <BookOpen size={16} />}
        </button>
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
                // Create note with optional text
                const id = `${docHash}:${noteAnchor.page}:${Date.now()}`;
                const n = {
                  id,
                  docHash,
                  page: noteAnchor.page,
                  rects: noteAnchor.rects,
                  color: noteAnchor.color,
                  text: noteInput.trim() || undefined,
                  createdAt: Date.now(),
                };

                try {
                  await putNote(n);
                  setNotes((prev) => [...prev, n]);
                } catch (err) {
                  console.error("Failed to save note", err);
                }
                setNoteAnchor(null);
                setNoteInput("");
              } else if (e.key === "Escape") {
                setNoteAnchor(null);
                setNoteInput("");
              }
            }}
            placeholder="Add note text (optional)"
            className="px-2 py-1 rounded border bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
          />
        </div>
      )}

      {/* Comment input floating box */}
      {commentAnchor && (
        <div
          style={{
            position: "fixed",
            left: commentAnchor.x,
            top: commentAnchor.y,
            zIndex: 60,
          }}
        >
          <textarea
            autoFocus
            value={commentInput}
            onChange={(e) => setCommentInput(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === "Enter" && e.ctrlKey) {
                // persist comment with normalized rects from selection
                const range = commentAnchor.range;
                const rects = Array.from(range.getClientRects());
                if (rects.length === 0) return;

                const pageEl = document.querySelector(
                  `[data-page-num="${commentAnchor.page}"]`
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

                const id = `${docHash}:${commentAnchor.page}:${Date.now()}`;
                const comment = {
                  id,
                  docHash,
                  page: commentAnchor.page,
                  rects: normalizedRects,
                  text: commentInput,
                  createdAt: Date.now(),
                };
                try {
                  await putComment(comment);
                  setComments((prev) => [...prev, comment]);
                } catch (err) {
                  console.error("Failed to save comment", err);
                }
                setCommentAnchor(null);
                setCommentInput("");
              } else if (e.key === "Escape") {
                setCommentAnchor(null);
                setCommentInput("");
              }
            }}
            placeholder="Type comment and press Ctrl+Enter"
            className="text-xs px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 resize-y focus:outline-none focus:ring-0"
            rows={3}
          />
        </div>
      )}
      <ContextMenu
        visible={contextVisible}
        x={contextPos.x}
        y={contextPos.y}
        onSelect={(a) => handleContextAction(a)}
      />

      <Chatbot
        docHash={docHash}
        currentPage={currentPage}
        onPageNavigate={scrollToPage}
        contextBookmarks={contextBookmarks}
        onRemoveContextBookmark={handleRemoveContextBookmark}
        openSignal={chatbotOpenTick}
      />

      {/* Term summary popup */}
      {selectedTerm && termPopupPosition && (
        <div
          data-term-popup
          className="fixed z-[100] bg-white dark:bg-neutral-800 rounded-lg shadow-2xl p-4 max-w-md" // removed border-2 border-primary-500
          style={{
            left: `${termPopupPosition.x}px`,
            top: `${termPopupPosition.y}px`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-between items-start mb-3">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
                {selectedTerm.term}
              </h3>
              <button
                onClick={async () => {
                  // If currently playing, stop it
                  if (isNarratingTerm && currentAudioRef.current) {
                    currentAudioRef.current.pause();
                    currentAudioRef.current.currentTime = 0;
                    currentAudioRef.current = null;
                    setIsNarratingTerm(false);
                    return;
                  }
                  
                  try {
                    setIsNarratingTerm(true);
                    
                    // Create narration text with term definition and key points
                    const narrationText = `${selectedTerm.term}. ${selectedTerm.definition}`;
                    
                    console.log('[App] Requesting narration for term:', selectedTerm.term);
                    const audioBuffer = await getAudio(narrationText);
                    
                    if (audioBuffer) {
                      console.log('[App] Playing term narration audio');
                      const blob = new Blob([audioBuffer], { type: 'audio/mpeg' });
                      const url = URL.createObjectURL(blob);
                      const audioEl = new Audio(url);
                      currentAudioRef.current = audioEl;
                      
                      audioEl.onended = () => {
                        URL.revokeObjectURL(url);
                        currentAudioRef.current = null;
                        setIsNarratingTerm(false);
                      };
                      
                      audioEl.onerror = () => {
                        URL.revokeObjectURL(url);
                        currentAudioRef.current = null;
                        setIsNarratingTerm(false);
                        console.error('[App] Audio playback error');
                      };
                      
                      await audioEl.play();
                    } else {
                      console.error('[App] No audio buffer received for term narration');
                      setIsNarratingTerm(false);
                    }
                  } catch (err) {
                    console.error('[App] Error requesting term narration:', err);
                    currentAudioRef.current = null;
                    setIsNarratingTerm(false);
                  }
                }}
                className={`p-1 rounded hover:bg-primary-100 dark:hover:bg-primary-700 transition ${
                  isNarratingTerm ? 'text-primary-500 animate-pulse' : 'text-neutral-600 dark:text-neutral-400'
                }`}
                title={isNarratingTerm ? "Stop narration" : "Listen to term definition"}
              >
                <Volume2 size={18} />
              </button>
            </div>
            <button
              onClick={() => {
                setSelectedTerm(null);
                setTermPopupPosition(null);
                setTermReturnPage(null);
              }}
              className="text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
              title="Close"
            >
              ✕
            </button>
          </div>

          <div className="mb-3">
            <p className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              Definition:
            </p>
            <p className="text-sm text-neutral-900 dark:text-neutral-100">
              {selectedTerm.definition}
            </p>
          </div>

          {(selectedTerm.explanation1 ||
            selectedTerm.explanation2 ||
            selectedTerm.explanation3) && (
            <div className="mb-3">
              <p className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Key Points:
              </p>
              <ul className="list-disc list-inside text-sm text-neutral-900 dark:text-neutral-100 space-y-1">
                {selectedTerm.explanation1 && (
                  <li>{selectedTerm.explanation1}</li>
                )}
                {selectedTerm.explanation2 && (
                  <li>{selectedTerm.explanation2}</li>
                )}
                {selectedTerm.explanation3 && (
                  <li>{selectedTerm.explanation3}</li>
                )}
              </ul>
            </div>
          )}

          {selectedTerm.tocItem && (
            <div className="mb-2 text-sm text-neutral-600 dark:text-neutral-400">
              <span className="font-semibold">Section: </span>
              {selectedTerm.tocItem.title} (Page {selectedTerm.tocItem.page})
            </div>
          )}

          <div className="mt-3 pt-3 border-t border-neutral-200 dark:border-neutral-700 flex gap-2">
            <button
              onClick={() => handleSaveTermAsNote(selectedTerm)}
              className="px-3 py-1.5 text-sm bg-primary-100 hover:bg-primary-200 text-black rounded"
              title="Save this explanation as a note"
            >
              Save as Note
            </button>
            {selectedTerm.matchedChunkId && (
              <button
                onClick={() => {
                  if (termReturnPage !== null) {
                    // Return to the saved page
                    scrollToPage(termReturnPage);
                    setTermReturnPage(null);
                  } else if (selectedTerm.tocItem?.page) {
                    // Save current page and navigate to context
                    setTermReturnPage(currentPage);
                    scrollToPage(selectedTerm.tocItem.page);
                  }
                }}
                className="font-normal px-3 py-1.5 text-sm bg-primary-600 hover:bg-primary-600 text-white rounded"
              >
                {termReturnPage !== null ? '← Return' : 'Go to Context'}
              </button>
            )}
            <button
              onClick={() => {
                try {
                  const page = selectedTerm.tocItem?.page || termSourcePage || currentPage;
                  const termTextParts: string[] = [];
                  if (selectedTerm.definition) termTextParts.push(`Definition: ${selectedTerm.definition}`);
                  if (selectedTerm.explanation1) termTextParts.push(`• ${selectedTerm.explanation1}`);
                  if (selectedTerm.explanation2) termTextParts.push(`• ${selectedTerm.explanation2}`);
                  if (selectedTerm.explanation3) termTextParts.push(`• ${selectedTerm.explanation3}`);
                  const text = [`📖 ${selectedTerm.term}`, '', ...termTextParts].join('\n');

                  const b: BookmarkItem = {
                    id: `${docHash}:term:${page}:${Date.now()}`,
                    page,
                    text,
                    createdAt: Date.now(),
                    __type: "note",
                    original: {
                      id: `${docHash}:term:${page}:${Date.now()}`,
                      docHash,
                      page,
                      rects: termSourceRects && termSourceRects.length > 0 ? termSourceRects : [{ top: 0.02, left: 0.02, width: 0.06, height: 0.03 }],
                      color: 'yellow',
                      text,
                      createdAt: Date.now(),
                    } as any,
                  };
                  handleAddContextBookmark(b);
                } catch (e) {
                  console.error('Failed to add term to chat context', e);
                }
              }}
              className="p-2 text-purple-600 hover:bg-purple-50 dark:text-purple-300 dark:hover:bg-purple-900/20 rounded"
              title="Add this term summary as chat context"
            >
              <BrainCircuit size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Toast notification for highlights toggle */}
      {showHighlightsToast && (
        <div
          className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[200] bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-6 py-3 rounded-lg shadow-2xl font-medium text-lg pointer-events-none animate-fadeIn"
          style={{
            animation: 'fadeIn 0.2s ease-in-out',
          }}
        >
          {highlightsVisible ? 'Smart reader mode on' : 'Smart reader mode off'}
        </div>
      )}
  {/* Document properties modal */}
  <DocumentProperties open={docPropsOpen} onClose={() => setDocPropsOpen(false)} propsData={docProps} />
  {/* Save As fallback modal */}
  <SaveAsModal
    open={saveAsOpen}
    initialName={(fileName || 'document').replace(/\.pdf$/i, '') + '-annotated.pdf'}
    blob={saveAsBlob}
    onClose={() => {
      setSaveAsOpen(false);
      setSaveAsBlob(null);
    }}
    onSave={async (name: string) => {
      try {
        if (!saveAsBlob) return;
        const url = URL.createObjectURL(saveAsBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } finally {
        setSaveAsOpen(false);
        setSaveAsBlob(null);
      }
    }}
  />
    </div>
  );
};
