import React from 'react';
import { Edit, Download, Maximize, Minimize } from 'lucide-react';

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
  onPrint?: () => void;
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
  onPrint,
  onToggleDrawing,
  isDrawingMode,
  forwardedRef,
}) => {
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

  return (
    <div ref={forwardedRef} className="sticky top-0 z-50 bg-white dark:bg-neutral-900 shadow-md border-b border-neutral-200 dark:border-neutral-700">
      <div className="flex items-center justify-between px-4 py-2 gap-2">
        {/* Left: TOC toggle + Navigation */}
        <div className="flex items-center gap-2">
          {/* Hamburger / TOC toggle */}
          <button
            onClick={onToggleTOC}
            className="px-3 py-1.5 bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-100 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
            title="Toggle table of contents"
          >
            ☰
          </button>

          {/* Navigation */}
          <div className="flex items-center gap-2">
          <button
            onClick={onPrevPage}
            disabled={currentPage <= 1}
            className="px-3 py-1.5 bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-100 hover:bg-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
            title="Previous page (← or PgUp)"
          >
            ←
          </button>

          <div className="flex items-center gap-1">
            <input
              type="number"
              min={1}
              max={totalPages}
              value={currentPage}
              onChange={handlePageInput}
              className="w-16 px-2 py-1 text-center border border-neutral-300 dark:border-neutral-600 rounded bg-white text-neutral-800 dark:bg-neutral-800 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
            />
            <span className="text-neutral-600 dark:text-neutral-400">
              / {totalPages}
            </span>
          </div>

          <button
            onClick={onNextPage}
            disabled={currentPage >= totalPages}
            className="px-3 py-1.5 bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-100 hover:bg-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
            title="Next page (→ or PgDn)"
          >
            →
          </button>
          </div>
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={onZoomOut}
            className="px-3 py-1.5 bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-100 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
            title="Zoom out (Ctrl/Cmd + -)"
          >
            −
          </button>

          <span
            className="min-w-[100px] text-center text-sm font-medium text-neutral-700 dark:text-neutral-300"
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
            className="px-3 py-1.5 bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-100 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
            title="Zoom in (Ctrl/Cmd + +)"
          >
            +
          </button>

          <div className="border-l border-neutral-300 dark:border-neutral-600 h-6 mx-1" />

          {/* Single toggle for fit mode: if currently fitWidth show Minimize (width icon) else show Maximize (page icon) */}
          <button
            onClick={() => {
              if (zoom === 'fitWidth') onFitPage();
              else onFitWidth();
            }}
            className={`px-3 py-1.5 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 ${
              (zoom === 'fitWidth' || zoom === 'fitPage')
                ? 'bg-blue-600 text-white'
                : 'bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-100 hover:bg-neutral-200 dark:hover:bg-neutral-700'
            }`}
            title={zoom === 'fitWidth' ? 'Switch to Fit Page' : 'Switch to Fit Width'}
          >
            {zoom === 'fitWidth' ? <Minimize size={16} /> : <Maximize size={16} />}
          </button>

          {/* Drawing Tool */}
          <div className="border-l border-neutral-300 dark:border-neutral-600 h-6 mx-1" />
          <button
            onClick={onToggleDrawing}
            className={`px-3 py-1.5 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 ${
              isDrawingMode
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-100 hover:bg-neutral-200 dark:hover:bg-neutral-700'
            }`}
            title="Drawing tool"
          >
            <Edit size={16} />
          </button>

          {/* Download & Print */}
          <div className="border-l border-neutral-300 dark:border-neutral-600 h-6 mx-1" />
          <button
            onClick={onDownload}
            className="px-3 py-1.5 bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-100 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
            title="Download PDF"
          >
            <Download size={16} />
          </button>

          {/* Print button intentionally commented out — printing is handled via Ctrl/Cmd+P shortcut in-app */}
          {false && (
            <button
              onClick={onPrint}
              className="px-3 py-1.5 bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-100 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
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
