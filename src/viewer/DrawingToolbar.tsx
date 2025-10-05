import React from 'react';

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
}

const COLORS = [
  { name: 'Red', value: '#EF4444' },
  { name: 'Yellow', value: '#EAB308' },
  { name: 'Green', value: '#22C55E' },
  { name: 'Blue', value: '#3B82F6' },
  { name: 'Purple', value: '#A855F7' },
  { name: 'Black', value: '#000000' },
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
}) => {
  if (!isExpanded) return null;

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-neutral-50 dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700">
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
                  ? 'border-blue-500 ring-2 ring-blue-300 dark:ring-blue-700'
                  : 'border-neutral-300 dark:border-neutral-600'
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
                ? 'border-blue-500 ring-2 ring-blue-300 dark:ring-blue-700 bg-white text-neutral-900'
                : 'border-neutral-300 dark:border-neutral-600 bg-white text-neutral-800'
            }`}
            title="Eraser"
          >
            🧼
          </button>
        </div>

        <div className="border-l border-neutral-300 dark:border-neutral-600 h-6 mx-1" />
      </>

      {/* Undo/Redo */}
      <button
        onClick={onUndo}
        disabled={!canUndo}
        className="px-3 py-1.5 bg-neutral-100 text-neutral-800 dark:bg-neutral-700 dark:text-neutral-100 hover:bg-neutral-200 dark:hover:bg-neutral-600 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
        title="Undo (Ctrl+Z)"
      >
        ↶
      </button>

      <button
        onClick={onRedo}
        disabled={!canRedo}
        className="px-3 py-1.5 bg-neutral-100 text-neutral-800 dark:bg-neutral-700 dark:text-neutral-100 hover:bg-neutral-200 dark:hover:bg-neutral-600 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
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
        🗑
      </button>
    </div>
  );
};
