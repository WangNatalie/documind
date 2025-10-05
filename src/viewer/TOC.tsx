import React, { useState } from "react";
import { List, Bookmark as BookmarkIcon } from "lucide-react";
import type { TOCItem, NoteRecord, CommentRecord } from "../db";
import type { TOCNode } from "../utils/toc";

interface TOCProps {
  items: TOCNode[]; // nested nodes
  onSelect?: (item: TOCItem) => void;
  // optional bookmark mode data
  notes?: NoteRecord[];
  comments?: CommentRecord[];
  onSelectBookmark?: (item: NoteRecord | CommentRecord) => void;
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

export const TOC: React.FC<TOCProps> = ({
  items,
  onSelect,
  notes = [],
  comments = [],
  onSelectBookmark,
}) => {
  const [mode, setMode] = useState<"toc" | "bookmarks">("toc");

  // strongly-typed bookmark wrapper so we can keep original record and a simple display shape
  interface BookmarkItem {
    id: string;
    page: number;
    text?: string;
    createdAt?: number;
    __type: "note" | "comment";
    original: NoteRecord | CommentRecord;
  }

  const bookmarks: BookmarkItem[] = [
    ...(notes || []).map(
      (n) =>
        ({
          id: n.id,
          page: n.page,
          text: n.text,
          createdAt: n.createdAt,
          __type: "note" as const,
          original: n,
        }) as BookmarkItem
    ),
    ...(comments || []).map(
      (c) =>
        ({
          id: c.id,
          page: c.page,
          text: c.text,
          createdAt: c.createdAt,
          __type: "comment" as const,
          original: c,
        }) as BookmarkItem
    ),
  ].sort(
    (a, b) =>
      (a.page || 0) - (b.page || 0) || (a.createdAt || 0) - (b.createdAt || 0)
  );

  // Convert arbitrary CSS color (named, hex, rgb) into an rgba() string with the given alpha.
  // Uses canvas to normalize named colors to hex/rgb when possible.
  const colorToRgba = (
    color: string | undefined,
    alpha = 0.12
  ): string | undefined => {
    if (!color) return undefined;
    try {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return undefined;
      ctx.fillStyle = color;
      const computed = ctx.fillStyle; // normalized color string (#rrggbb or rgb(...))
      if (computed.startsWith("#")) {
        const hex = computed.slice(1);
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
      }
      const rgbMatch = computed.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (rgbMatch) {
        const r = Number(rgbMatch[1]);
        const g = Number(rgbMatch[2]);
        const b = Number(rgbMatch[3]);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
      }
    } catch (e) {
      // ignore and fall through
    }
    return undefined;
  };

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

      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">
          {items.length ? "Table of contents" : "Loading table of contents..."}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMode("toc")}
            className={`px-2 py-1 rounded ${mode === "toc" ? "bg-neutral-200 dark:bg-neutral-800" : "hover:bg-neutral-100 dark:hover:bg-neutral-800"}`}
            title="Show table of contents"
            aria-label="Table of contents"
          >
            <List size={16} />
          </button>
          <button
            onClick={() => setMode("bookmarks")}
            className={`px-2 py-1 rounded ${mode === "bookmarks" ? "bg-neutral-200 dark:bg-neutral-800" : "hover:bg-neutral-100 dark:hover:bg-neutral-800"}`}
            title="Show bookmarks"
            aria-label="Bookmarks"
          >
            <BookmarkIcon size={16} />
          </button>
        </div>
      </div>

      {mode === "toc" ? (
        <div className="space-y-1">
          {items.map((n) => (
            <TOCEntry
              key={`${n.title}:${n.page}`}
              node={n}
              onSelect={onSelect}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {bookmarks.length === 0 && (
            <div className="text-sm text-neutral-500">
              No notes or comments yet.
            </div>
          )}
          {bookmarks.map((b: BookmarkItem) => {
            const isNote = b.__type === "note";
            const noteColor = isNote
              ? (b.original as NoteRecord).color
              : undefined;
            const bg = isNote ? colorToRgba(noteColor, 0.12) : undefined;
            return (
              <div
                key={b.id}
                className="p-2 rounded border border-neutral-100 dark:border-neutral-800 cursor-pointer"
                onClick={() => onSelectBookmark?.(b.original)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    onSelectBookmark?.(b.original);
                  }
                }}
                style={bg ? { backgroundColor: bg } : undefined}
              >
                <div className="flex items-center justify-between">
                  <div className="text-xs text-neutral-500">
                    {isNote ? "Note" : "Comment"} • Page {b.page}
                  </div>
                </div>
                <div className="mt-2 text-sm text-neutral-800 dark:text-neutral-100 whitespace-pre-wrap">
                  {String(b.text || "").trim()}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
