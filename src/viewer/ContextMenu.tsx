import React, { useEffect, useState } from 'react';
import { getAISettings, onAISettingsChanged } from '../utils/ai-settings';

interface ContextMenuProps {
  visible?: boolean;
  x?: number;
  y?: number;
  // Callbacks are intentionally optional - behavior will be added later
  onSelect?: (action: string) => void;
  onClose?: () => void;
}

// Gentle, unoffensive note colors: soft yellow, pale green, sky blue
const NOTES = [
  { id: 'yellow', label: 'Yellow', className: 'bg-yellow-300 ring-yellow-400' },
  { id: 'green', label: 'Green', className: 'bg-emerald-200 ring-emerald-300' },
  { id: 'blue', label: 'Blue', className: 'bg-sky-200 ring-sky-300' },
];

export const ContextMenu: React.FC<ContextMenuProps> = ({ visible = false, x = 0, y = 0, onSelect }) => {
  if (!visible) return null;

  const [termsEnabled, setTermsEnabled] = useState(true);
  const [elevenEnabled, setElevenEnabled] = useState(true);

  useEffect(() => {
    let mounted = true;
    getAISettings().then((s) => {
      if (!mounted) return;
      setTermsEnabled(!!s?.gemini?.termsEnabled);
      setElevenEnabled(!!s?.elevenLabsEnabled);
    });
    onAISettingsChanged((s) => {
      setTermsEnabled(!!s?.gemini?.termsEnabled);
      setElevenEnabled(!!s?.elevenLabsEnabled);
    });
    return () => {
      mounted = false;
    };
  }, []);

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
      <div className="px-3 text-sm text-neutral-600 dark:text-neutral-300 font-medium">Note</div>
      <div className="px-2 py-2 grid grid-cols-3 gap-2">
        {NOTES.map(n => (
          <button
            key={n.id}
            className={`h-8 w-8 rounded-md ${n.className} ring-1 ring-inset ring-neutral-200 dark:ring-neutral-700`}
            title={`Note ${n.label}`}
            onClick={() => handleSelect(`note:${n.id}`)}
            aria-label={`Note ${n.label}`}
          />
        ))}
      </div>

      <div className="border-t border-neutral-100 dark:border-neutral-700 mt-2 pt-2 px-3">
        {termsEnabled && (
          <button
            className="w-full text-sm text-neutral-700 dark:text-neutral-200 text-left px-2 py-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-700"
            onClick={() => handleSelect('explain')}
          >
            Explain with AI
          </button>
        )}
        {elevenEnabled && (
          <button
            className="w-full text-sm text-neutral-700 dark:text-neutral-200 text-left px-2 py-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-700"
            onClick={() => handleSelect('narrate')}
          >
            Narrate
          </button>
        )}
        <button
          className="w-full text-sm text-neutral-700 dark:text-neutral-200 text-left px-2 py-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-700"
          onClick={() => handleSelect('comment')}
        >
          Comment
        </button>
      </div>
    </div>
  );
};

export default ContextMenu;
