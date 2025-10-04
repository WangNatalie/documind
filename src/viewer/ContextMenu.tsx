import React from 'react';

interface ContextMenuProps {
  visible?: boolean;
  x?: number;
  y?: number;
  // Callbacks are intentionally optional - behavior will be added later
  onSelect?: (action: string) => void;
  onClose?: () => void;
}

// Gentle, unoffensive highlight colors: soft yellow, pale green, sky blue
const HIGHLIGHTS = [
  { id: 'yellow', label: 'Yellow', className: 'bg-yellow-300 ring-yellow-400' },
  { id: 'green', label: 'Green', className: 'bg-emerald-200 ring-emerald-300' },
  { id: 'blue', label: 'Blue', className: 'bg-sky-200 ring-sky-300' },
];

export const ContextMenu: React.FC<ContextMenuProps> = ({ visible = false, x = 0, y = 0, onSelect, onClose }) => {
  if (!visible) return null;

  const handleSelect = (action: string) => {
    if (onSelect) onSelect(action);
  };

  return (
    <div
      className="fixed z-50 w-44 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-lg py-2"
      style={{ left: x, top: y }}
      role="menu"
      aria-hidden={!visible}
    >
      <div className="px-3 text-sm text-neutral-600 dark:text-neutral-300 font-medium">Highlight</div>
      <div className="px-2 py-2 grid grid-cols-3 gap-2">
        {HIGHLIGHTS.map(h => (
          <button
            key={h.id}
            className={`h-8 w-8 rounded-md ${h.className} ring-1 ring-inset ring-neutral-200 dark:ring-neutral-700`}
            title={`Highlight ${h.label}`}
            onClick={() => handleSelect(`highlight:${h.id}`)}
            aria-label={`Highlight ${h.label}`}
          />
        ))}
      </div>

      <div className="border-t border-neutral-100 dark:border-neutral-700 mt-2 pt-2 px-3">
        <button
          className="w-full text-sm text-neutral-700 dark:text-neutral-200 text-left px-2 py-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-700"
          onClick={() => handleSelect('note')}
        >
          Note
        </button>
      </div>
    </div>
  );
};

export default ContextMenu;
