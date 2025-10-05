import React from "react";
import { Eraser, Trash2 } from "lucide-react";

interface DrawingToolbarProps {
  isExpanded: boolean;
  selectedColor: string;
  onColorSelect: (color: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  canUndo: boolean;
  canRedo: boolean;
  isEraserMode: boolean;
  onToggleEraser: () => void;
  // vertical offset in pixels from the top of the viewport (usually the toolbar height)
  toolbarTop?: number;
}

const COLORS = [
  { name: "Red", value: "#EF4444" },
  { name: "Yellow", value: "#EAB308" },
  { name: "Green", value: "#22C55E" },
  { name: "Blue", value: "#3B82F6" },
  { name: "Purple", value: "#A855F7" },
  { name: "Black", value: "#000000" },
];

export const DrawingToolbar: React.FC<DrawingToolbarProps> = ({
  isExpanded,
  selectedColor,
  onColorSelect,
  onUndo,
  onRedo,
  onClear,
  canUndo,
  canRedo,
  isEraserMode,
  onToggleEraser,
  toolbarTop = 0,
}) => {
  // Render always but position fixed so it doesn't affect layout.
  // Visibility and interactivity are controlled via classes for smooth animations.
  return (
    <div
      role="region"
      aria-hidden={!isExpanded}
      style={{ top: `${toolbarTop}px` }}
      className={`fixed left-0 right-0 z-40 transform-gpu origin-top transition-all duration-200 ease-out ${
        isExpanded
          ? "translate-y-0 opacity-100 pointer-events-auto"
          : "-translate-y-full opacity-0 pointer-events-none"
      }`}
    >
      <div className="flex items-center justify-end gap-2 px-4 py-2 bg-neutral-100 dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700">
        {/* ...existing code (left-side toggle removed) ... */}

        {/* Color palette (always visible). Includes an Eraser swatch so eraser acts like a color option. */}
        <>
          <div className="flex items-center gap-1">
            {COLORS.map((color) => (
              <button
                key={color.value}
                onClick={() => {
                  // If eraser was active, disable it when selecting a color
                  if (isEraserMode) onToggleEraser();
                  onColorSelect(color.value);
                }}
                className={`w-7 h-7 rounded-full border-2 transition-all hover:scale-110 ${
                  !isEraserMode && selectedColor === color.value
                    ? "border-primary-500 ring-2 ring-blue-300 dark:ring-blue-700"
                    : "border-neutral-300 dark:border-neutral-600"
                }`}
                style={{ backgroundColor: color.value }}
                title={color.name}
              />
            ))}

            {/* Eraser as part of the palette */}
            <button
              onClick={onToggleEraser}
              className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-sm transition-all hover:scale-110 ${
                isEraserMode
                  ? "border-primary-500 ring-2 ring-blue-300 dark:ring-blue-700 bg-white text-neutral-900"
                  : "border-neutral-300 dark:border-neutral-600 bg-white text-neutral-800"
              }`}
              title="Eraser"
            >
              <Eraser size={14} />
            </button>
          </div>

          <div className="border-l border-neutral-300 dark:border-neutral-600 h-6 mx-1" />
        </>

        {/* Undo/Redo */}
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className="px-3 py-1.5 bg-neutral-100 text-neutral-800 dark:bg-neutral-700 dark:text-neutral-100 hover:bg-neutral-200 dark:hover:bg-neutral-600 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
          title="Undo (Ctrl+Z)"
        >
          ↶
        </button>

        <button
          onClick={onRedo}
          disabled={!canRedo}
          className="px-3 py-1.5 bg-neutral-100 text-neutral-800 dark:bg-neutral-700 dark:text-neutral-100 hover:bg-neutral-200 dark:hover:bg-neutral-600 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
          title="Redo (Ctrl+Y)"
        >
          ↷
        </button>

        <div className="border-l border-neutral-300 dark:border-neutral-600 h-6 mx-1" />

        {/* Clear */}
        <button
          onClick={onClear}
          className="px-3 py-1.5 bg-red-500 text-white hover:bg-red-600 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400"
          title="Clear all drawings on current page"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
};
