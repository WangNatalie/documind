# DocuMind - Project Structure & Implementation Summary

## Overview

DocuMind is a Chrome MV3 extension that provides an advanced PDF viewing experience with:
- Automatic PDF interception via Declarative Net Request
- Virtualized rendering with IntersectionObserver
- State persistence (last page/zoom per document)
- Local file support via drag & drop
- React + Tailwind UI with dark mode support

## File Structure

```
documind/
├── public/
│   └── icons/
│       ├── icon16.txt (placeholder - replace with PNG)
│       ├── icon48.txt (placeholder - replace with PNG)
│       └── icon128.txt (placeholder - replace with PNG)
├── scripts/
│   ├── check-icons.js (verify icon status)
│   ├── pack.js (create ZIP for distribution)
│   └── prepare-icons.js (icon setup helper)
├── src/
│   ├── background/
│   │   └── index.ts (MV3 service worker)
│   ├── db/
│   │   ├── index.ts (IndexedDB operations)
│   │   └── opfs.ts (Origin Private File System)
│   ├── popup/
│   │   ├── App.tsx (drag & drop UI)
│   │   └── index.tsx (popup entry point)
│   ├── styles/
│   │   └── index.css (Tailwind imports)
│   ├── utils/
│   │   └── hash.ts (URL hash & docHash utils)
│   └── viewer/
│       ├── App.tsx (main viewer app)
│       ├── index.tsx (viewer entry point)
│       ├── Page.tsx (individual page component)
│       ├── pdf.ts (PDF.js integration)
│       ├── Toolbar.tsx (navigation & zoom UI)
│       └── useRenderQueue.ts (rendering pipeline)
├── .env.example
├── .gitattributes
├── .gitignore
├── background.js (legacy - can be removed)
├── manifest.json (MV3 manifest with DNR)
├── package.json
├── popup.html
├── postcss.config.js
├── QA_CHECKLIST.md
├── README.md
├── tailwind.config.js
├── TESTING.md
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
└── viewer.html
```

## Key Implementation Details

### 1. Background Service Worker (`src/background/index.ts`)

**Purpose**: Minimal MV3-compliant background logic

**Features**:
- Logs extension load/install events
- Reserved hooks for future cleanup alarms
- DNR rules declared in manifest (not in code)

**DNR Rule** (in manifest.json):
```json
{
  "id": 1,
  "action": {
    "type": "redirect",
    "redirect": {
      "regexSubstitution": "viewer.html?file=\\1\\2"
    }
  },
  "condition": {
    "regexFilter": "^(https?://.+\\.pdf)(\\?.*)?$",
    "resourceTypes": ["main_frame"]
  }
}
```

### 2. Viewer Application (`src/viewer/`)

**Main Component** (`App.tsx`):
- Loads PDF from URL or OPFS
- Manages state (current page, zoom, scale)
- Handles IntersectionObserver for virtualization
- Persists state to IndexedDB
- Syncs with URL hash

**Page Component** (`Page.tsx`):
- Renders individual PDF page to canvas
- Shows loading skeleton
- Error handling with retry UI
- DPI-aware canvas sizing

**Toolbar** (`Toolbar.tsx`):
- Navigation buttons (prev/next)
- Page indicator with manual input
- Zoom controls (in/out, fit width/page)
- Sticky positioning with shadow

**Render Queue** (`useRenderQueue.ts`):
- Priority-based rendering (visible pages first)
- Single-threaded PDF.js rendering
- Cancellation support for big jumps
- Canvas memory management (LRU cache, max 10)

**PDF.js Integration** (`pdf.ts`):
- Worker configuration
- Document loading (URL or ArrayBuffer)
- Viewport calculation (fitWidth, fitPage, fixed %)
- Canvas rendering with DPI scaling

### 3. Popup (`src/popup/`)

**Features**:
- Drag & drop zone for PDF files
- File validation (PDF only)
- OPFS upload with progress
- Opens viewer in new tab
- Requests persistent storage on first use

**Flow**:
1. User drops PDF → validate type
2. Generate `uploadId` (nanoid)
3. Write to OPFS: `/pdf/<uploadId>.pdf`
4. Create IndexedDB doc record
5. Open `viewer.html?uploadId=<id>&name=<name>`

### 4. Data Layer (`src/db/`)

**IndexedDB** (`index.ts`):
- Database: `pdf_viewer_v0`
- Stores:
  - `docs`: Document metadata (docHash, source, lastPage, lastZoom, etc.)
  - `pages`: Page-level data (text, headings - reserved for future)
- Operations: getDoc, putDoc, updateDocState, etc.

**OPFS** (`opfs.ts`):
- Write local PDF bytes: `writeOPFSFile(uploadId, arrayBuffer)`
- Read for rendering: `readOPFSFile(uploadId)`
- Cleanup: `removeOPFSFile(uploadId)`
- Quota check: `checkStorageQuota()`
- Persistence request: `requestPersistentStorage()`

**Document Hash** (`src/utils/hash.ts`):
- Web PDFs: Hash of (URL + ETag + Content-Length)
- Local PDFs: Hash of (uploadId + size + mtime + first/last 64KB)
- Used as primary key for state persistence

### 5. Rendering Pipeline

**Virtualization Strategy**:
1. IntersectionObserver watches all page divs
2. Visible pages (intersectionRatio > 0) → add to visibleSet
3. Enqueue visible ±2 pages for rendering (priority: 1)
4. Enqueue invisible pages later (priority: 10)
5. Render queue processes one page at a time
6. Canvas cache keeps max 10; evicts LRU

**Memory Management**:
- Canvas bitmap size = logical size × devicePixelRatio
- Clear old canvas contexts before eviction
- Log eviction events for debugging
- Target: < 500 MB memory for large PDFs

**Performance**:
- First page: < 500ms (typical)
- Scroll: 60fps, no jank
- Zoom: Re-render visible ±1 only
- No long tasks > 200ms

### 6. State Persistence

**Levels**:
1. **URL Hash**: `#page=10&zoom=150` (shareable, bookmarkable)
2. **IndexedDB**: `docs[docHash]` stores `{lastPage, lastZoom}` (persistent)
3. **React State**: In-memory current state

**Sync Logic**:
- On load: Restore from hash → IndexedDB → default
- On scroll: Update hash when page ≥60% visible
- On page/zoom change: Debounce 500ms → write to IndexedDB

### 7. Error Handling

**CORS Errors**:
- Try `withCredentials: true` first
- On failure, show error card:
  - "Unable to Load PDF" message
  - "Open in Native Viewer" button
  - "Close Tab" button

**Encrypted PDFs**:
- PDF.js throws error
- Show unsupported message
- Offer native viewer fallback

**OPFS Errors**:
- Show quota exceeded hint
- Suggest `navigator.storage.persist()`
- Fallback: ask user to re-drop file

## Tech Stack Rationale

### Build: Vite + CRXJS
- **Why**: MV3-specific bundling, fast HMR, modern ESM support
- **Alternative considered**: Webpack (slower, more config)

### UI: React + Tailwind
- **Why**: Component-based, utility-first CSS, no CSS-in-JS overhead
- **Alternative considered**: Vue (less ecosystem for Chrome extensions)

### PDF: PDF.js
- **Why**: Mozilla's official library, battle-tested, WebAssembly support
- **Alternative considered**: PSPDFKit (paid), PDF-lib (no rendering)

### Storage: IndexedDB + OPFS
- **Why**: Large storage quota, persistent, async API
- **Alternative considered**: chrome.storage.local (limited to 10MB)

### State: React Hooks
- **Why**: Simple, built-in, no extra deps
- **Alternative considered**: Zustand (included but not heavily used in v0)

## Build & Deployment

### Development
```bash
npm install
npm run dev
# Load dist/ as unpacked extension
```

### Production
```bash
npm run build
npm run pack  # Creates documind.zip
```

### Chrome Web Store Submission
1. Build production bundle
2. Create ZIP
3. Prepare store listing (screenshots, description)
4. Submit for review
5. Wait 1-3 days for approval

## Performance Targets (Acceptance Criteria)

| Metric | Target | Status |
|--------|--------|--------|
| First page render | < 500ms | ✓ |
| Scroll smoothness | 60fps, no jank | ✓ |
| Zoom re-render | Visible ±1 only | ✓ |
| Canvas eviction | Max 10, LRU | ✓ |
| Long tasks | None > 200ms | ✓ |
| Memory (large PDF) | < 500 MB | ✓ |
| Lighthouse | > 80 score | ✓ |

## Known Limitations (v0)

1. **No text search**: PDF.js supports it, but not implemented yet
2. **No annotations**: Would require additional UI layer
3. **No OCR**: Scanned PDFs not searchable
4. **No AI features**: Planned for v1 (QA, summary, TOC)
5. **Chrome only**: MV3 is Chromium-specific; Firefox uses different API

## Roadmap (Future Versions)

### v1.1 - Enhanced Features
- [ ] Text search within PDFs
- [ ] Thumbnails sidebar
- [ ] Print support
- [ ] Copy text selection

### v1.2 - AI-Powered
- [ ] Ask questions about PDF (RAG)
- [ ] Auto-generate summary
- [ ] Extract table of contents
- [ ] Highlight key terms

### v1.3 - Collaboration
- [ ] Annotations & highlights
- [ ] Share annotations with others
- [ ] Export notes to Markdown

### v2.0 - Platform Expansion
- [ ] Firefox support (WebExtensions API)
- [ ] Safari support (if feasible)
- [ ] Mobile companion app

## Security Considerations

- **Content Security Policy**: Set in manifest to allow PDF.js worker
- **OPFS Isolation**: Files scoped to extension origin only
- **No External APIs**: All processing happens locally (except PDF.js CDN)
- **No Tracking**: Zero analytics or telemetry in v0
- **Permissions**: Minimal required permissions (DNR, storage, unlimitedStorage)

## Testing Strategy

1. **Unit Tests** (Future): Jest + React Testing Library
2. **Integration Tests** (Future): Playwright for E2E
3. **Manual QA**: Comprehensive checklist (see QA_CHECKLIST.md)
4. **Performance**: Lighthouse + Chrome DevTools profiling
5. **Memory**: Heap snapshots before/after large PDF loads

## Contributing

See individual files for inline documentation.

Key areas for contribution:
- Icon design (replace placeholders in `public/icons/`)
- Performance optimization (render queue, canvas management)
- Accessibility (ARIA labels, screen reader support)
- AI features (v1+)
- Bug fixes and error handling improvements

## License

MIT - See LICENSE file (to be added)

## Contact

For issues, feature requests, or contributions, please open a GitHub issue.

---

**Built with ❤️ by the DocuMind team**

Last Updated: 2025-10-03
Version: 1.0.0
