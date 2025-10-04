import React, { useEffect, useState, useRef, useCallback } from 'react';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { loadPDF, calculateScale } from './pdf';
import { Page } from './Page';
import { Toolbar } from './Toolbar';
import { useRenderQueue, CanvasCache } from './useRenderQueue';
import { parseHash, updateHash } from '../utils/hash';
import { generateDocHash } from '../utils/hash';
import { getDoc, putDoc, updateDocState } from '../db';
import { readOPFSFile } from '../db/opfs';
import { requestChunking } from '../utils/chunker-client';

const ZOOM_LEVELS = [50, 75, 100, 125, 150, 200, 300];

export const ViewerApp: React.FC = () => {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pages, setPages] = useState<(PDFPageProxy | null)[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState<string>('fitWidth');
  const [scale, setScale] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [docHash, setDocHash] = useState<string>('');

  const containerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const renderQueue = useRenderQueue();
  const canvasCacheRef = useRef(new CanvasCache());
  const visiblePagesRef = useRef<Set<number>>(new Set([1]));

  // Parse URL params
  const params = new URLSearchParams(window.location.search);
  const fileUrl = params.get('file');
  const uploadId = params.get('uploadId');
  const fileName = params.get('name') || 'document.pdf';

  // Load PDF on mount
  useEffect(() => {
    const loadDocument = async () => {
      try {
        setLoading(true);
        setError(null);

        let pdfDoc: PDFDocumentProxy;
        let source: { type: 'url' | 'uploadId'; value: string };
        let hash: string;

        if (uploadId) {
          // Load from OPFS
          source = { type: 'uploadId', value: uploadId };
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
          source = { type: 'url', value: fileUrl };

          try {
            pdfDoc = await loadPDF({ url: fileUrl, withCredentials: true });
            // TODO: Extract ETag/Content-Length from response for better hashing
            hash = await generateDocHash(source);
          } catch (err: any) {
            // Show CORS error card
            setError('cors');
            setLoading(false);
            return;
          }
        } else {
          setError('No file specified');
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

        if (hashState.page) {
          setCurrentPage(hashState.page);
        } else if (existingDoc?.lastPage) {
          setCurrentPage(existingDoc.lastPage);
        }

        if (hashState.zoom) {
          setZoom(hashState.zoom);
        } else if (existingDoc?.lastZoom) {
          setZoom(existingDoc.lastZoom);
        }

        // Create or update doc record
        if (!existingDoc) {
          await putDoc({
            docHash: hash,
            source,
            name: fileName,
            pageCount,
            lastPage: hashState.page || 1,
            lastZoom: hashState.zoom || 'fitWidth',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
        }
        
        // Pass URL directly for url-based PDFs
        if (fileUrl) {
          requestChunking({ 
            docHash: hash, 
            fileUrl: fileUrl 
          })
            .then(response => {
              if (response.success) {
                console.log('Chunking task created:', response.taskId);
              } else {
                console.error('Failed to create chunking task:', response.error);
              }
            })
            .catch(err => {
              console.error('Error starting chunking:', err);
            });
        }

        setLoading(false);
      } catch (err: any) {
        console.error('Failed to load PDF:', err);
        setError(err.message || 'Failed to load PDF');
        setLoading(false);
      }
    };

    loadDocument();
  }, [fileUrl, uploadId, fileName]);

  // Calculate scale when zoom changes or container resizes
  useEffect(() => {
    if (!pages[0] || !containerRef.current) return;

    const updateScale = () => {
      const container = containerRef.current;
      if (!container) return;

      const containerWidth = container.clientWidth - 32; // padding
      const containerHeight = window.innerHeight - 100;

      const newScale = calculateScale(pages[0]!, containerWidth, containerHeight,
        zoom === 'fitWidth' || zoom === 'fitPage' ? zoom : parseInt(zoom, 10));
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

    observerRef.current = new IntersectionObserver(
      (entries) => {
        let mostVisiblePage = currentPage;
        let maxRatio = 0;
        let visibilityChanged = false;

        entries.forEach((entry) => {
          const pageNum = parseInt(entry.target.getAttribute('data-page-num') || '0', 10);

          if (entry.isIntersecting) {
            const wasVisible = visiblePagesRef.current.has(pageNum);
            visiblePagesRef.current.add(pageNum);
            if (!wasVisible) visibilityChanged = true;

            // Track most visible page (>= 60%)
            if (entry.intersectionRatio > maxRatio) {
              maxRatio = entry.intersectionRatio;
              if (entry.intersectionRatio >= 0.6) {
                mostVisiblePage = pageNum;
              }
            }
          } else {
            const wasVisible = visiblePagesRef.current.has(pageNum);
            visiblePagesRef.current.delete(pageNum);
            if (wasVisible) visibilityChanged = true;
          }
        });

        // Update current page if changed
        if (mostVisiblePage !== currentPage && maxRatio >= 0.6) {
          setCurrentPage(mostVisiblePage);
        } else if (visibilityChanged && mostVisiblePage === currentPage) {
          // Only force re-render if page didn't change (to update shouldRender for other pages)
          setCurrentPage(p => p);
        }
      },
      { threshold: [0, 0.25, 0.5, 0.6, 0.75, 1.0] }
    );

    // Observe all pages
    const pageElements = containerRef.current.querySelectorAll('[data-page-num]');
    pageElements.forEach((el) => observerRef.current?.observe(el));

    return () => {
      observerRef.current?.disconnect();
    };
  }, [pages, currentPage]);

  // Update hash when page/zoom changes
  useEffect(() => {
    updateHash({ page: currentPage, zoom });
  }, [currentPage, zoom]);

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
    const pageEl = containerRef.current?.querySelector(`[data-page-num="${pageNum}"]`);
    if (pageEl) {
      pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleZoomIn = useCallback(() => {
    if (zoom === 'fitWidth' || zoom === 'fitPage') {
      setZoom('100');
    } else {
      const currentZoom = parseInt(zoom, 10);
      const nextZoom = ZOOM_LEVELS.find(z => z > currentZoom) || 300;
      setZoom(nextZoom.toString());
    }
  }, [zoom]);

  const handleZoomOut = useCallback(() => {
    if (zoom === 'fitWidth' || zoom === 'fitPage') {
      setZoom('100');
    } else {
      const currentZoom = parseInt(zoom, 10);
      const prevZoom = [...ZOOM_LEVELS].reverse().find(z => z < currentZoom) || 50;
      setZoom(prevZoom.toString());
    }
  }, [zoom]);

  // Keyboard navigation and ctrl+scroll zoom
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey;

      if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        handlePrevPage();
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        handleNextPage();
      } else if (isMod && e.key === '+') {
        e.preventDefault();
        handleZoomIn();
      } else if (isMod && e.key === '-') {
        e.preventDefault();
        handleZoomOut();
      } else if (isMod && e.key === '0') {
        e.preventDefault();
        setZoom('fitWidth');
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

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('wheel', handleWheel);
    };
  }, [handlePrevPage, handleNextPage, handleZoomIn, handleZoomOut]);

  const handleRender = useCallback(async (
    pageNum: number,
    canvas: HTMLCanvasElement,
    textLayerDiv: HTMLDivElement | null,
    priority: number
  ) => {
    const page = pages[pageNum - 1];
    if (!page) return;

    await renderQueue.enqueue(pageNum, page, canvas, textLayerDiv, scale, priority);
    canvasCacheRef.current.add(pageNum, canvas);
  }, [pages, scale, renderQueue]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-neutral-50 dark:bg-neutral-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-neutral-600 dark:text-neutral-400">Loading PDF...</p>
        </div>
      </div>
    );
  }

  if (error === 'cors') {
    return (
      <div className="flex items-center justify-center h-screen bg-neutral-50 dark:bg-neutral-900 p-4">
        <div className="max-w-md w-full bg-white dark:bg-neutral-800 rounded-lg shadow-lg border border-neutral-200 dark:border-neutral-700 p-6">
          <h2 className="text-xl font-semibold text-red-600 dark:text-red-400 mb-4">Unable to Load PDF</h2>
          <p className="text-neutral-700 dark:text-neutral-300 mb-6">
            This PDF cannot be loaded due to CORS restrictions or access permissions.
          </p>
          <div className="space-y-3">
            <a
              href={fileUrl || '#'}
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
          <p className="text-red-600 dark:text-red-400 font-semibold mb-2">Error</p>
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
        onFitWidth={() => setZoom('fitWidth')}
        onFitPage={() => setZoom('fitPage')}
        onPageChange={(page) => scrollToPage(page)}
      />

      <div
        ref={containerRef}
        className="flex-1 overflow-auto"
      >
        <div className="py-4 flex flex-col items-center">
          {pages.map((page, idx) => {
            const pageNum = idx + 1;
            const isVisible = visiblePagesRef.current.has(pageNum);
            // Render visible pages + 2 pages buffer above/below
            // Always render first 3 pages initially, then use visibility detection
            const shouldRender = pageNum <= 3 || isVisible ||
              Array.from(visiblePagesRef.current).some(vp => Math.abs(vp - pageNum) <= 2);

            return (
              <Page
                key={pageNum}
                pageNum={pageNum}
                page={page}
                scale={scale}
                isVisible={isVisible}
                shouldRender={shouldRender}
                onRender={handleRender}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};
