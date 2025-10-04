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
  resetDB,
  putNote,
  getNotesByDoc,
  putComment,
  getCommentsByDoc,
  deleteNote,
  deleteComment,
  getChunksByDoc,
  getTableOfContents,
} from "../db";
import { readOPFSFile } from "../db/opfs";
import ContextMenu from "./ContextMenu";
import { requestGeminiChunking, requestEmbeddings, requestTOC } from "../utils/chunker-client";

const ZOOM_LEVELS = [50, 75, 90, 100, 125, 150, 175, 200, 250, 300, 350, 400, 500];

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

  const containerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const renderQueue = useRenderQueue();
  // Protect pages currently in or near viewport from cache eviction
  const canvasCacheRef = useRef(new CanvasCache((pageNum: number) => {
    // visiblePages state may lag slightly; combine both refs for safety
    if (visiblePagesRef.current.has(pageNum)) return true;
    if ((intersectionVisiblePagesRef.current || new Set()).has(pageNum)) return true;
    // Also protect small buffer (+/-2) around any currently visible page to reduce thrash
    for (const vp of visiblePagesRef.current) {
      if (Math.abs(vp - pageNum) <= 2) return true;
    }
    return false;
  }));
  const visiblePagesRef = useRef<Set<number>>(new Set([1]));
  const intersectionVisiblePagesRef = useRef<Set<number>>(new Set([1]));
  const pendingZoomRef = useRef<number | null>(null);
  // Context menu state
  const [contextVisible, setContextVisible] = useState(false);
  const [contextPos, setContextPos] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const [notes, setNotes] = useState<Array<any>>([]);
  const [comments, setComments] = useState<Array<any>>([]);
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
  const [termSummaries, setTermSummaries] = useState<TermSummary[]>([]);
  const [selectedTerm, setSelectedTerm] = useState<TermSummary | null>(null);
  const [termPopupPosition, setTermPopupPosition] = useState<{ x: number; y: number } | null>(null);

  // Parse URL params
  const params = new URLSearchParams(window.location.search);
  const fileUrl = params.get("file");
  const uploadId = params.get("uploadId");
  // Keep filename in state so we can update it after reading PDF metadata
  const [fileName, setFileName] = useState<string>(params.get("name") || "document.pdf");

  // Listen for state requests and term summaries from background
  useEffect(() => {
    const handleMessage = (message: any) => {
      if (message.type === 'TERM_SUMMARIES_READY') {
        // Received term summaries from background script
        const { summaries } = message.payload;
        console.log('[VIEWER] Received term summaries:', summaries);
        console.log('[VIEWER] Setting term summaries, count:', summaries?.length || 0);
        setTermSummaries(summaries || []);
        return;
      }

      if (message.type === 'REQUEST_VIEWER_STATE') {
        // Extract text from visible pages
        let visibleText = '';
        const visiblePages = Array.from(visiblePagesRef.current).sort((a, b) => a - b);
        
        console.log('[VIEWER] Processing state request for visible pages:', visiblePages);
        
        for (const pageNum of visiblePages) {
          const pageEl = document.querySelector(`[data-page-num="${pageNum}"]`);
          if (pageEl) {
            // Try both possible class names for text layer
            const textLayer = pageEl.querySelector('.text-layer') || pageEl.querySelector('.textLayer');
            if (textLayer) {
              const pageText = textLayer.textContent || '';
              if (pageText.trim()) {
                visibleText += `\n=== Page ${pageNum} ===\n${pageText}\n`;
              }
            } else {
              console.log(`[VIEWER] No text layer found for page ${pageNum}`);
            }
          } else {
            console.log(`[VIEWER] Page element not found for page ${pageNum}`);
          }
        }

        console.log('[VIEWER] Sending state to background:', {
          fileName,
          currentPage,
          totalPages: pages.length,
          visiblePages,
          textLength: visibleText.length
        });

        // Send current state to background
        chrome.runtime.sendMessage({
          type: 'UPDATE_VIEWER_STATE',
          payload: {
            docHash,
            fileName,
            currentPage,
            totalPages: pages.length,
            zoom,
            visibleText: visibleText.trim(),
          }
        }).catch((error) => {
          console.error('Failed to send viewer state:', error);
        });
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, [docHash, fileName, currentPage, pages.length, zoom]);

  // Reset term summaries when visible pages change
  useEffect(() => {
    // Clear term summaries to remove highlights when view changes
    if (termSummaries.length > 0) {
      console.log('[VIEWER] Visible pages changed, clearing term highlights');
      setTermSummaries([]);
      setSelectedTerm(null);
      setTermPopupPosition(null);
    }
  }, [visiblePages]);

  // Close popup when clicking outside
  useEffect(() => {
    if (!selectedTerm) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Check if click is outside the popup and not on a term highlight
      if (!target.closest('[data-term-popup]') && !target.closest('[data-term-highlight]')) {
        console.log('[App] Clicking outside popup, closing');
        setSelectedTerm(null);
        setTermPopupPosition(null);
      }
    };

    // Use timeout to avoid catching the same click that opened the popup
    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('click', handleClickOutside);
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

          // Generate hash from file metadata
          const firstBytes = arrayBuffer.slice(0, 64 * 1024);
          const lastBytes = arrayBuffer.slice(-64 * 1024);
          hash = await generateDocHash(source, {
            size: arrayBuffer.byteLength,
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
        // Update the browser tab title to the document name
        try {
            document.title = fileName || 'document.pdf';
        } catch (e) {
          // ignore in non-browser environments
        }

          // Derive a better filename synchronously (await metadata) so we can use it when persisting
          let derivedName: string | undefined = params.get("name") || undefined;
          if (!derivedName) {
            try {
              const meta = await (pdfDoc as any).getMetadata?.();
              const title = meta?.info?.Title || meta?.info?.title || (meta?.metadata && typeof meta.metadata.get === 'function' ? meta.metadata.get('dc:title') : undefined);
              if (title && typeof title === 'string' && title.trim().length > 0) {
                derivedName = title.trim();
              }
            } catch (e) {
              // ignore metadata errors
            }
          }

          if (!derivedName && fileUrl) {
            try {
              const u = new URL(fileUrl);
              const parts = u.pathname.split('/').filter(Boolean);
              const last = parts[parts.length - 1] || '';
              if (last) {
                derivedName = decodeURIComponent(last.split('?')[0]) || undefined;
              }
            } catch (e) {
              // ignore
            }
          }

          if (!derivedName) derivedName = 'document.pdf';
          setFileName(derivedName);
          try { document.title = derivedName; } catch (e) {}

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
          } catch (err) {
            console.error("Failed to load notes (non-fatal)", err);
            try {
              // reset DB connection in case it is stale or deleted
              resetDB();
            } catch (resetErr) {
              console.warn('resetDB failed while loading notes:', resetErr);
            }
            setNotes([]);
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
              console.warn('resetDB failed while loading comments:', resetErr);
            }
            setComments([]);
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
          console.error('Failed to create/update doc record (non-fatal):', err);
          // If the DB is in a bad state, reset the connection so subsequent operations can retry
          try {
            resetDB();
            // a future operation (highlights/notes) will attempt to open the DB again
          } catch (resetErr) {
            console.warn('resetDB failed:', resetErr);
          }
        }

        // Helper function to check and generate TOC if needed
        const checkAndGenerateTOC = async () => {
          console.log('[App] checkAndGenerateTOC called for document:', hash);
          try {
            const [chunks, toc] = await Promise.all([
              getChunksByDoc(hash),
              getTableOfContents(hash)
            ]);
            
            console.log('[App] TOC check results:', {
              chunksCount: chunks.length,
              hasTOC: !!toc,
              tocItemsCount: toc?.items?.length || 0
            });
            
            if (chunks.length > 0 && !toc) {
              console.log('[App] Document has chunks but no TOC, triggering TOC generation');
              const tocResponse = await requestTOC({
                docHash: hash,
                fileUrl: fileUrl || undefined,
                uploadId: uploadId || undefined,
              });

              if (tocResponse.success) {
                console.log('[App] TOC generation task created:', tocResponse.taskId);
              } else {
                console.warn('[App] Failed to create TOC task:', tocResponse.error);
              }
            } else if (chunks.length === 0) {
              console.log('[App] No chunks found, skipping TOC generation');
            } else if (toc) {
              console.log('[App] TOC already exists, skipping generation');
            }
          } catch (err) {
            console.error('[App] Error checking TOC status (non-fatal):', err);
          }
        };

        // Check immediately for existing chunks (handles documents processed before TOC feature)
        console.log('[App] Starting initial TOC check...');
        checkAndGenerateTOC();

        // Pass URL directly for url-based PDFs
        if (fileUrl) {
          requestGeminiChunking({
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

              // Always request embeddings after chunking (will only generate missing ones)
              return requestEmbeddings(hash);
            })
            .then((embeddingResponse) => {
              if (embeddingResponse?.success) {
                console.log(`Embeddings generated: ${embeddingResponse.count} new embeddings`);
              } else if (embeddingResponse?.error) {
                console.warn("Failed to generate embeddings:", embeddingResponse.error);
              }
              
              // After embeddings, check again for TOC (in case chunks were just created)
              console.log('[App] Checking for TOC after embeddings complete...');
              return checkAndGenerateTOC();
            })
            .catch((err) => {
              console.error("Error in chunking/embedding workflow:", err);
            });
        } else if (uploadId) {
          console.log("[App.tsx] Requesting chunking with uploadId:", uploadId);
          requestGeminiChunking({
            docHash: hash,
            uploadId: uploadId,
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

              // Always request embeddings after chunking (will only generate missing ones)
              return requestEmbeddings(hash);
            })
            .then((embeddingResponse) => {
              if (embeddingResponse?.success) {
                console.log(`Embeddings generated: ${embeddingResponse.count} new embeddings`);
              } else if (embeddingResponse?.error) {
                console.warn("Failed to generate embeddings:", embeddingResponse.error);
              }
              
              // After embeddings, check again for TOC (in case chunks were just created)
              console.log('[App] Checking for TOC after embeddings complete...');
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
      setCommentAnchor({ x: first.left, y: first.top - 24, page: pageNum, range });
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
    setNoteAnchor({ x: first.left, y: first.top - 24, page: pageNum, color, rects: relRects });
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
            console.log(`[IntersectionObserver] Visible:`, nowVisible, `Hidden:`, nowHidden, `All visible:`, Array.from(visiblePagesRef.current));
          }

          // Update current page if we found a visible page with decent ratio
          if (mostVisiblePage > 0 && maxRatio >= 0.3) {
            console.log(`[IntersectionObserver] Updating current page to ${mostVisiblePage} (ratio: ${maxRatio.toFixed(2)})`);
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

      const pageElements = container.querySelectorAll('[data-page-num]');
      pageElements.forEach((el) => {
        const pageNum = parseInt(el.getAttribute('data-page-num') || '0', 10);
        if (pageNum === 0) return;

        const rect = el.getBoundingClientRect();

        // Check if page is visible in viewport
        const isVisible = rect.bottom > containerTop && rect.top < containerBottom;
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
      const visibleChanged = oldVisibleArray.length !== newVisibleArray.length ||
        oldVisibleArray.some((p, i) => p !== newVisibleArray[i]);

      visiblePagesRef.current = newVisiblePages;

      // Update visible pages state (triggers re-render)
      if (visibleChanged) {
        console.log(`[Scroll] Visible pages changed:`, oldVisibleArray, '->', newVisibleArray);
        setVisiblePages(newVisiblePages);
      }

      // Update current page if changed
      if (closestPage !== currentPage) {
        console.log(`[Scroll] Updating current page from ${currentPage} to ${closestPage}`);
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

    container.addEventListener('scroll', throttledScroll, { passive: true });

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
      container.removeEventListener('scroll', throttledScroll);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [currentPage, pages.length, scale, isInitialLoad]); // Added scale dependency so visibility rechecks on zoom

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
  // changeZoom: adjusts zoom while preserving scroll position appropriately
  // options.cursorPoint -> preserve the document point under cursor
  // options.snapToTop -> keep the current top-most page top aligned after zoom
  // Uses RAF throttling to prevent excessive updates during rapid zoom
  const changeZoom = useCallback(
    (newZoom: string, options?: { cursorPoint?: { x: number; y: number }; snapToTop?: boolean }) => {
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
        newZoom === "fitWidth" || newZoom === "fitPage" ? newZoom : parseInt(newZoom, 10)
      );

      // Decide new scrollTop based on options
      let newScrollTop: number | null = null;

      if (options?.cursorPoint) {
        const containerRect = container.getBoundingClientRect();
        const cursorOffset = options.cursorPoint.y - containerRect.top;
        const absoluteOffsetBefore = container.scrollTop + cursorOffset;
        // Scale the absolute offset
        newScrollTop = absoluteOffsetBefore * (calcScale / Math.max(oldScale, 0.0001)) - cursorOffset;
      } else if (options?.snapToTop) {
        // Find the current top-most visible page (use currentPage)
        const pageEl = container.querySelector(`[data-page-num="${currentPage}"]`) as HTMLElement | null;
        if (pageEl) {
          const pageOffset = pageEl.offsetTop; // offset within container
          newScrollTop = pageOffset * (calcScale / Math.max(oldScale, 0.0001));
        }
      } else {
        // default: keep center stable
        const centerOffset = container.scrollTop + container.clientHeight / 2;
        newScrollTop = centerOffset * (calcScale / Math.max(oldScale, 0.0001)) - container.clientHeight / 2;
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
          (container.style as any).scrollBehavior = 'auto';
          container.scrollTo({ top: clamped });
        } finally {
          (container.style as any).scrollBehavior = prevBehavior || '';
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
      changeZoom("100", { snapToTop: true });
    } else {
      const currentZoom = parseInt(zoom, 10);
      const nextZoom = ZOOM_LEVELS.find((z) => z > currentZoom) || ZOOM_LEVELS[ZOOM_LEVELS.length - 1];
      changeZoom(nextZoom.toString(), { snapToTop: true });
    }
  }, [zoom, changeZoom]);

  const handleZoomOut = useCallback(() => {
    if (zoom === "fitWidth" || zoom === "fitPage") {
      changeZoom("100", { snapToTop: true });
    } else {
      const currentZoom = parseInt(zoom, 10);
      const prevZoom = [...ZOOM_LEVELS].reverse().find((z) => z < currentZoom) || 50;
      changeZoom(prevZoom.toString(), { snapToTop: true });
    }
  }, [zoom, changeZoom]);

  // Ref for print handler so keyboard effect can call it without ordering issues
  const handlePrintRef = useRef<(() => Promise<void>) | null>(null);

  // Keyboard navigation and ctrl+scroll zoom
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
        await deleteNote(id);
        setNotes((prev) => prev.filter((n) => n.id !== id));
      } catch (err) {
        console.error("Failed to delete note", err);
      }
    }, []);
  
    const handleNoteEdit = useCallback(async (id: string, newText: string) => {
      try {
        const note = notes.find((n) => n.id === id);
        if (!note) return;
  
        const updatedNote = { ...note, text: newText.trim() || undefined };
        await putNote(updatedNote);
        setNotes((prev) =>
          prev.map((n) => (n.id === id ? updatedNote : n))
        );
      } catch (err) {
        console.error("Failed to update note", err);
      }
    }, [notes]);
  
    // Comment handlers
    const handleCommentDelete = useCallback(async (id: string) => {
      try {
        await deleteComment(id);
        setComments((prev) => prev.filter((c) => c.id !== id));
      } catch (err) {
        console.error("Failed to delete comment", err);
      }
    }, []);
  
    const handleCommentEdit = useCallback(async (id: string, newText: string) => {
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
    }, [comments]);

  // Download and print handlers
  const handleDownload = useCallback(async () => {
    try {
      // Prefer original URL or OPFS uploadId
      if (fileUrl) {
        // Trigger download by navigating to the URL (preserve CORS behavior)
        const a = document.createElement('a');
        a.href = fileUrl;
        a.download = fileName || 'document.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        return;
      }

      if (uploadId) {
        const arrayBuffer = await readOPFSFile(uploadId);
        const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName || 'document.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        return;
      }

      // Fallback: try to get raw data from pdfjs (if supported)
      if (pdf && typeof (pdf as any).getData === 'function') {
        const data = await (pdf as any).getData();
        const blob = new Blob([data], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName || 'document.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        return;
      }

      console.warn('No source available for download');
    } catch (err) {
      console.error('Download failed', err);
    }
  }, [fileUrl, uploadId, pdf, fileName]);

  const handlePrint = useCallback(async () => {
    try {
      let blob: Blob | null = null;

      if (uploadId) {
        const arrayBuffer = await readOPFSFile(uploadId);
        blob = new Blob([arrayBuffer], { type: 'application/pdf' });
      } else if (fileUrl) {
        // Try to fetch the file bytes (may fail due to CORS)
        try {
          const resp = await fetch(fileUrl, { mode: 'cors' });
          if (resp.ok) {
            const ab = await resp.arrayBuffer();
            blob = new Blob([ab], { type: 'application/pdf' });
          } else {
            // Can't fetch; fall back to opening URL
            const w = window.open(fileUrl, '_blank');
            if (w) w.focus();
            return;
          }
        } catch (e) {
          // CORS or network error - fall back to opening URL
          const w = window.open(fileUrl, '_blank');
          if (w) w.focus();
          return;
        }
      } else if (pdf && typeof (pdf as any).getData === 'function') {
        const data = await (pdf as any).getData();
        blob = new Blob([data], { type: 'application/pdf' });
      }

      if (!blob) {
        console.warn('No source available for print');
        return;
      }

      const url = URL.createObjectURL(blob);

      // Create an invisible iframe in the current document (same-origin blob URL)
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0px';
      iframe.style.height = '0px';
      iframe.style.border = '0';
      iframe.src = url;
      document.body.appendChild(iframe);

      const cleanup = () => {
        try {
          if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        } catch (e) {}
        try { URL.revokeObjectURL(url); } catch (e) {}
      };

      const onLoad = () => {
        try {
          iframe.contentWindow?.focus();
          // Trigger print in the iframe (should open print dialog)
          iframe.contentWindow?.print();
        } catch (e) {
          console.warn('Iframe print failed', e);
          // Fallback: open blob URL in new tab
          try { window.open(url, '_blank')?.focus(); } catch (err) {}
        } finally {
          // cleanup after short delay to allow print dialog to start
          setTimeout(cleanup, 2000);
        }
      };

      // Attach load handler
      iframe.addEventListener('load', onLoad, { once: true });

      // Safety: if load never fires, attempt print after 1s and cleanup after 5s
      setTimeout(() => {
        try {
          if (iframe.contentWindow) iframe.contentWindow.print();
        } catch (e) {}
      }, 1000);
      setTimeout(cleanup, 5000);
    } catch (err) {
      console.error('Print failed', err);
    }
  }, [fileUrl, uploadId, pdf]);

  // Keep ref updated so keyboard handler can call print without ordering issues
  useEffect(() => {
    handlePrintRef.current = handlePrint;
    return () => { handlePrintRef.current = null; };
  }, [handlePrint]);

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
              const nextZoom = ZOOM_LEVELS.find((z) => z > currentZoom) || ZOOM_LEVELS[ZOOM_LEVELS.length - 1];
              changeZoom(nextZoom.toString(), { cursorPoint: cursor });
            }
          } else if (accumulatedDelta > 10) {
            // zoom out around cursor (positive delta = scroll down)
            if (zoom === "fitWidth" || zoom === "fitPage") {
              changeZoom("100", { cursorPoint: cursor });
            } else {
              const currentZoom = parseInt(zoom, 10);
              const prevZoom = [...ZOOM_LEVELS].reverse().find((z) => z < currentZoom) || 50;
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
  }, [zoom, changeZoom]);  const handleRender = useCallback(
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
        onFitWidth={() => changeZoom("fitWidth", { snapToTop: true })}
        onFitPage={() => changeZoom("fitPage", { snapToTop: true })}
        onPageChange={(page) => scrollToPage(page)}
        onDownload={handleDownload}
        onPrint={handlePrint}
      />

      <div ref={containerRef} className="flex-1 overflow-auto">
        <div className="py-4 flex flex-col items-center">
          {(() => {
            const renderingPages: number[] = [];
            const visiblePagesArray = Array.from(visiblePages);

            return pages.map((page, idx) => {
              const pageNum = idx + 1;
              const isVisible = visiblePages.has(pageNum);
              // Render visible pages + 4 pages buffer above/below
              const shouldRender =
                isVisible ||
                visiblePagesArray.some(
                  (vp) => Math.abs(vp - pageNum) <= 4
                );

              if (shouldRender) {
                renderingPages.push(pageNum);
              }

              // Log after first iteration
              if (idx === pages.length - 1 && renderingPages.length > 0) {
                console.log(`[Render] Rendering pages:`, renderingPages, `(visible: [${visiblePagesArray}])`);
              }

              return (
                <Page
                key={pageNum}
                pageNum={pageNum}
                page={page}
                scale={scale}
                isVisible={isVisible}
                shouldRender={shouldRender}
                onRender={handleRender}
                notes={notes.filter((n) => n.page === pageNum)}
                comments={comments.filter((c) => c.page === pageNum)}
                onNoteDelete={handleNoteDelete}
                onNoteEdit={handleNoteEdit}
                onCommentDelete={handleCommentDelete}
                onCommentEdit={handleCommentEdit}
                termSummaries={termSummaries}
                onTermClick={(term, x, y) => {
                  console.log('[App] onTermClick called:', term.term, { x, y });
                  setSelectedTerm(term);
                  setTermPopupPosition({ x, y });
                }}
              />
              );
            });
          })()}
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
            className="px-2 py-1 rounded border bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 resize-y"
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

      {/* Term summary popup */}
      {selectedTerm && termPopupPosition && (
        <div
          data-term-popup
          className="fixed z-[100] bg-white dark:bg-neutral-800 border-2 border-blue-500 rounded-lg shadow-2xl p-4 max-w-md"
          style={{
            left: `${termPopupPosition.x}px`,
            top: `${termPopupPosition.y}px`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-between items-start mb-3">
            <h3 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
              {selectedTerm.term}
            </h3>
            <button
              onClick={() => {
                setSelectedTerm(null);
                setTermPopupPosition(null);
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

          {(selectedTerm.explanation1 || selectedTerm.explanation2 || selectedTerm.explanation3) && (
            <div className="mb-3">
              <p className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Key Points:
              </p>
              <ul className="list-disc list-inside text-sm text-neutral-900 dark:text-neutral-100 space-y-1">
                {selectedTerm.explanation1 && <li>{selectedTerm.explanation1}</li>}
                {selectedTerm.explanation2 && <li>{selectedTerm.explanation2}</li>}
                {selectedTerm.explanation3 && <li>{selectedTerm.explanation3}</li>}
              </ul>
            </div>
          )}

          {selectedTerm.tocItem && (
            <div className="mb-2 text-sm text-neutral-600 dark:text-neutral-400">
              <span className="font-semibold">Section: </span>
              {selectedTerm.tocItem.title} (Page {selectedTerm.tocItem.page})
            </div>
          )}

          {selectedTerm.matchedChunkId && (
            <div className="mt-3 pt-3 border-t border-neutral-200 dark:border-neutral-700">
              <button
                onClick={() => {
                  // Navigate to the chunk's page if available
                  if (selectedTerm.tocItem?.page) {
                    scrollToPage(selectedTerm.tocItem.page);
                  }
                }}
                className="px-3 py-1.5 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded"
              >
                Go to Context
              </button>
              <span className="ml-2 text-xs text-neutral-500 dark:text-neutral-400">
                Chunk: {selectedTerm.matchedChunkId.substring(0, 8)}...
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
