import React from "react";
import type { TOCItem } from "../db";
import type { TOCNode } from "../utils/toc";

interface TOCProps {
  items: TOCNode[]; // nested nodes
  onSelect?: (item: TOCItem) => void;
}

function TOCEntry({
  node,
  onSelect,
}: {
  node: TOCNode;
  onSelect?: (item: TOCItem) => void;
}) {
  // If there are no children, render a non-expandable button so there is no
  // open/close affordance shown for leaf nodes.
  if (!node.children || node.children.length === 0) {
    return (
      <div className="toc-entry mb-1">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSelect?.(node);
          }}
          className="w-full text-left px-2 py-1 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded text-neutral-800 dark:text-neutral-100 flex items-center gap-2"
          title={`Go to page ${node.page}`}
        >
          <span className="w-6" />
          <span className="truncate">{String(node.title).trim()}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="toc-entry">
      <details className="mb-1">
        <summary className="cursor-pointer px-2 py-1 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded">
          <div className="flex items-center gap-2">
            <svg
              className="chev w-6 h-6 text-neutral-700 dark:text-neutral-200 transition-transform"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              {/* right-pointing chevron; rotates 90deg when open -> down */}
              <polyline points="9 6 15 12 9 18" />
            </svg>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSelect?.(node);
              }}
              className="text-left w-full text-neutral-800 dark:text-neutral-100"
              title={`Go to page ${node.page}`}
            >
              {String(node.title).trim()}
            </button>
          </div>
        </summary>
        <div className="pl-6">
          {node.children.map((c) => (
            <TOCEntry
              key={`${c.title}:${c.page}`}
              node={c}
              onSelect={onSelect}
            />
          ))}
        </div>
      </details>
    </div>
  );
}

export const TOC: React.FC<TOCProps> = ({ items, onSelect }) => {
  return (
    <div className="w-96 h-full bg-white dark:bg-neutral-900 border-r border-neutral-200 dark:border-neutral-700 overflow-auto pr-6 p-3 text-neutral-800 dark:text-neutral-100 toc-container">
      {/* Inline styles to hide native marker and rotate custom chevron when details is open */}
      <style>{`
        .toc-container details > summary::-webkit-details-marker { display: none; }
        .toc-container details summary { list-style: none; }
        /* Rotate only the chevron inside the open details' own summary */
        .toc-container details[open] > summary .chev { transform: rotate(90deg); }
        /* Prevent horizontal overflow caused by long titles */
        .toc-container { overflow-x: hidden; }
      `}</style>

      <div className="text-sm font-semibold mb-2 text-neutral-700 dark:text-neutral-200">
        Table of contents
      </div>
      <div className="space-y-1">
        {items.map((n) => (
          <TOCEntry key={`${n.title}:${n.page}`} node={n} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
};
