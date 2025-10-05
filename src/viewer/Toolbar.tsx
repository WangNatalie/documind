import React, { useState, useEffect } from 'react';
import { Edit, Brain, Download, DownloadCloud, Printer, Info, Maximize, Minimize, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, MoreVertical } from 'lucide-react';
import documindLogoUrlLight from '../assets/documind-logo-full-light.svg';
import documindLogoUrlDark from '../assets/documind-logo-full-dark.svg';

interface ToolbarProps {
  onToggleTOC?: () => void;
  currentPage: number;
  totalPages: number;
  zoom: string;
  fitWidthPercent?: number;
  fitPagePercent?: number;
  onPrevPage: () => void;
  onNextPage: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitWidth: () => void;
  onFitPage: () => void;
  onPageChange: (page: number) => void;
  onDownload?: () => void;
  onDownloadWithAnnotations?: () => void;
  onPrint?: () => void;
  onDocumentProperties?: () => void;
  highlightsVisible?: boolean;
  onToggleHighlights?: () => void;
  onToggleDrawing?: () => void;
  isDrawingMode?: boolean;
}

const ToolbarInner: React.FC<ToolbarProps & { forwardedRef?: React.Ref<HTMLDivElement> }> = ({
  onToggleTOC,
  currentPage,
  totalPages,
  zoom,
  fitWidthPercent,
  fitPagePercent,
  onPrevPage,
  onNextPage,
  onZoomIn,
  onZoomOut,
  onFitWidth,
  onFitPage,
  onPageChange,
  onDownload,
  onDownloadWithAnnotations,
  onPrint,
  onDocumentProperties,
  highlightsVisible,
  onToggleHighlights,
  onToggleDrawing,
  isDrawingMode,
  forwardedRef,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const handlePageInput = (e: React.FormEvent<HTMLInputElement>) => {
    const value = parseInt(e.currentTarget.value, 10);
    if (value >= 1 && value <= totalPages) {
      onPageChange(value);
    }
  };

  const getZoomLabel = () => {
    const asNumber = Number(zoom);
    if (zoom === 'fitWidth') {
      const fw = Math.round(fitWidthPercent ?? 100);
      return `${fw}%`;
    }

    if (zoom === 'fitPage') {
      const fp = Math.round(fitPagePercent ?? 100);
      return `${fp}%`;
    }
    if (!Number.isNaN(asNumber)) return `${asNumber}%`;
    return `${zoom}%`;
  };

  const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const logoUrl = isDark ? documindLogoUrlDark : documindLogoUrlLight;

  return (
    <div ref={forwardedRef} className="sticky top-0 z-50 bg-neutral-25 dark:bg-neutral-800 shadow-md border-b border-neutral-200 dark:border-neutral-700">
      <div className="flex items-center px-4 py-2 gap-2">
        {/* Left: TOC toggle + Navigation */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {/* Hamburger / TOC toggle */}
          <button
            onClick={onToggleTOC}
            className="px-3 py-1.5 bg-transparent text-neutral-800 dark:bg-transparent dark:text-neutral-100 hover:bg-neutral-200 dark:hover:bg-neutral-700 active:bg-primary-600 active:text-white rounded transition-colors outline-none focus:outline-none"
            title="Toggle table of contents"
          >
            ☰
          </button>
          {/* Navigation */}
          <div className="flex items-center gap-2">
          <button
            onClick={onPrevPage}
            disabled={currentPage <= 1}
            className="px-3 py-1.5 bg-transparent text-neutral-800 dark:bg-transparent dark:text-neutral-100 hover:bg-neutral-200 dark:hover:bg-neutral-700 active:bg-primary-600 active:text-white disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors outline-none focus:outline-none"
            title="Previous page (← or PgUp)"
          >
            <ChevronLeft size={16} />
          </button>

          <div className="flex items-center gap-1">
            <input
              type="number"
              min={1}
              max={totalPages}
              value={currentPage}
              onChange={handlePageInput}
              className="w-16 px-2 py-1 text-center border border-neutral-300 dark:border-neutral-600 rounded bg-white text-neutral-800 dark:bg-neutral-800 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
            />
            <span className="text-neutral-600 dark:text-neutral-400">
              / {totalPages}
            </span>
          </div>

          <button
            onClick={onNextPage}
            disabled={currentPage >= totalPages}
            className="px-3 py-1.5 bg-transparent text-neutral-800 dark:bg-transparent dark:text-neutral-100 hover:bg-neutral-200 dark:hover:bg-neutral-700 active:bg-primary-600 active:text-white disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors outline-none focus:outline-none"
            title="Next page (→ or PgDn)"
          >
            <ChevronRight size={16} />
          </button>
          </div>
        </div>

        {/* Center: Logo */}
        <div className="flex justify-center items-center flex-none">
          <img src={logoUrl} alt="Documind Logo" style={{ height: 32, width: 'auto' }} />
        </div>

        {/* Right: Zoom, Drawing, Download, etc. */}
        <div className="flex items-center gap-1 flex-1 min-w-0 justify-end">
          {/* Zoom controls */}
          <button
            onClick={onZoomOut}
            className="px-3 py-1.5 bg-transparent text-neutral-800 dark:bg-transparent dark:text-neutral-100 hover:bg-neutral-200 dark:hover:bg-neutral-700 active:bg-primary-600 active:text-white rounded transition-colors outline-none focus:outline-none"
            title="Zoom out (Ctrl/Cmd + -)"
          >
            <ZoomOut size={16} />
          </button>

          <span
            className="min-w-[50px] text-center text-sm font-medium text-neutral-700 dark:text-neutral-300"
            title={
              zoom === 'fitWidth' || zoom === 'fitPage'
                ? `Fit Width: ${Math.round(fitWidthPercent ?? 100)}% — Fit Page: ${Math.round(fitPagePercent ?? 100)}%`
                : undefined
            }
          >
            {getZoomLabel()}
          </span>

          <button
            onClick={onZoomIn}
            className="px-3 py-1.5 bg-transparent text-neutral-800 dark:bg-transparent dark:text-neutral-100 hover:bg-neutral-200 dark:hover:bg-neutral-700 active:bg-primary-600 active:text-white rounded transition-colors outline-none focus:outline-none"
            title="Zoom in (Ctrl/Cmd + +)"
          >
            <ZoomIn size={16} />
          </button>

          <div className="border-l border-neutral-300 dark:border-neutral-600 h-6 mx-1" />

          {/* Single toggle for fit mode: if currently fitWidth show Minimize (width icon) else show Maximize (page icon) */}
          <button
            onClick={() => {
              if (zoom === 'fitWidth') onFitPage();
              else onFitWidth();
            }}
            className={`px-3 py-1.5 rounded transition-colors outline-none focus:outline-none ${
              (zoom === 'fitWidth' || zoom === 'fitPage')
                ? 'bg-primary-600 text-white'
                : 'bg-transparent text-neutral-800 dark:bg-transparent dark:text-neutral-100 hover:bg-neutral-200 dark:hover:bg-neutral-700 active:bg-primary-600 active:text-white'
            }`}
            title={zoom === 'fitWidth' ? 'Switch to Fit Page' : 'Switch to Fit Width'}
          >
            {zoom === 'fitWidth' ? <Minimize size={16} /> : <Maximize size={16} />}
          </button>

          {/* Highlights Toggle */}
          <button
            onClick={onToggleHighlights}
            className={`px-3 py-1.5 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 ${
              highlightsVisible
                ? 'bg-purple-600 text-white hover:bg-purple-700'
                : 'bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-100 hover:bg-neutral-200 dark:hover:bg-neutral-700'
            }`}
            title={highlightsVisible ? "Hide highlights" : "Show highlights"}
          >
            <Brain size={18} />
          </button>

          {/* Drawing Tool */}
          <div className="border-l border-neutral-300 dark:border-neutral-600 h-6 mx-1" />
          <button
            onClick={onToggleDrawing}
            className={`px-3 py-1.5 rounded transition-colors outline-none focus:outline-none ${
              isDrawingMode
                ? 'bg-primary-600 text-white'
                : 'bg-transparent text-neutral-800 dark:bg-transparent dark:text-neutral-100 hover:bg-neutral-200 dark:hover:bg-neutral-700 active:bg-primary-600 active:text-white'
            }`}
            title="Drawing tool"
          >
            <Edit size={16} />
          </button>

          {/* Download & Print (menu) */}
          <div className="border-l border-neutral-300 dark:border-neutral-600 h-6 mx-1" />
          <div className="relative">
            <button
              onClick={() => setMenuOpen((s) => !s)}
              aria-haspopup="true"
              aria-expanded={Boolean(menuOpen)}
              className="px-3 py-1.5 rounded transition-colors outline-none focus:outline-none bg-transparent text-neutral-800 dark:bg-transparent dark:text-neutral-100 hover:bg-neutral-200 dark:hover:bg-neutral-700 active:bg-primary-600 active:text-white"
              title="More actions"
            >
              <MoreVertical size={16} />
            </button>

            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setMenuOpen(false)}
                />
                <div className="absolute right-0 mt-2 w-72 z-50 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded shadow-lg text-xs">
                  <button
                    className="w-full text-left px-4 py-3 hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-100 whitespace-nowrap overflow-hidden flex items-center gap-2"
                    onClick={() => {
                      setMenuOpen(false);
                      onDownload && onDownload();
                    }}
                  >
                    <Download size={14} />
                    <span>Download original</span>
                  </button>
                  <button
                    className="w-full text-left px-4 py-3 hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-100 whitespace-nowrap overflow-hidden flex items-center gap-2"
                    onClick={() => {
                      setMenuOpen(false);
                      onDownloadWithAnnotations && onDownloadWithAnnotations();
                    }}
                  >
                    <DownloadCloud size={14} />
                    <span>Download with annotations</span>
                  </button>
                  <button
                    className="w-full text-left px-4 py-3 hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-100 whitespace-nowrap overflow-hidden flex items-center gap-2"
                    onClick={() => {
                      setMenuOpen(false);
                      onPrint && onPrint();
                    }}
                  >
                    <Printer size={14} />
                    <span>Print</span>
                  </button>
                  <button
                    className="w-full text-left px-4 py-3 hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-100 whitespace-nowrap overflow-hidden flex items-center gap-2"
                    onClick={() => {
                      setMenuOpen(false);
                      onDocumentProperties && onDocumentProperties();
                    }}
                  >
                    <Info size={14} />
                    <span>Document properties</span>
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Print button intentionally commented out — printing is handled via Ctrl/Cmd+P shortcut in-app */}
          {false && (
            <button
              onClick={onPrint}
              className="px-3 py-1.5 bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-100 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
              title="Print"
            >
              🖨
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// forward ref so parent can measure toolbar height and avoid covering it with the TOC drawer
const Toolbar = React.forwardRef<HTMLDivElement, ToolbarProps>((props, ref) => (
  <ToolbarInner {...props} forwardedRef={ref} />
));

export { Toolbar };
