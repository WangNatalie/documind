# DocuMind Extension Flow

## 1. Web PDF Interception Flow

```
User navigates to PDF URL
         |
         v
Chrome Declarative Net Request (DNR) Rule
  (Match: *.pdf in main_frame)
         |
         v
Redirect to: viewer.html?file=<original-url>
         |
         v
Viewer App loads PDF via PDF.js
         |
    +----+----+
    |         |
    v         v
  URL      ArrayBuffer
  (CORS)   (fetch)
    |         |
    +----+----+
         |
         v
PDF.js renders to Canvas
         |
         v
User sees PDF in custom viewer
```

## 2. Local PDF Upload Flow

```
User clicks extension icon
         |
         v
Popup opens (popup.html)
         |
         v
User drags PDF file
         |
         v
File validation (PDF only?)
         |
    Yes  |  No → Show error
         v
Generate uploadId (nanoid)
         |
         v
Write to OPFS: /pdf/<uploadId>.pdf
         |
         v
Create IndexedDB doc record
         |
         v
Open new tab: viewer.html?uploadId=<id>
         |
         v
Viewer reads from OPFS
         |
         v
PDF.js renders to Canvas
```

## 3. Rendering Pipeline

```
Viewer loads PDF document
         |
         v
Load all pages (PDFPageProxy[])
         |
         v
IntersectionObserver watches page divs
         |
         v
Visible pages detected
         |
         v
Enqueue visible ±2 pages (priority: 1)
         |
         v
Render Queue processes ONE at a time
         |
    +----+----+
    |         |
    v         v
Success   Cancel (user scrolled away)
    |         |
    |         v
    |      Skip & process next
    v
Add to Canvas Cache (max 10)
    |
    v
Evict LRU if cache > 10
    |
    v
Page displayed to user
```

## 4. State Persistence Flow

```
User scrolls/zooms in viewer
         |
         v
IntersectionObserver detects most visible page
         |
         v
Update React state (currentPage, zoom)
         |
    +----+----+
    |         |
    v         v
Update      Debounce 500ms
URL hash       |
#page=X        v
&zoom=Y     Write to IndexedDB
              docs[docHash] = {
                lastPage,
                lastZoom,
                updatedAt
              }
```

## 5. Data Storage Architecture

```
Chrome Extension Origin
         |
    +----+----+----+
    |    |    |    |
    v    v    v    v
  DNR  IDB OPFS chrome.storage.local

DNR (Declarative Net Request)
  - Rules: PDF URL → viewer.html redirect

IndexedDB (pdf_viewer_v0)
  - docs: { docHash, source, lastPage, lastZoom, ... }
  - pages: { docHash, page, text, headings, ... }

OPFS (Origin Private File System)
  - /pdf/<uploadId>.pdf (raw bytes)

chrome.storage.local (future)
  - prefs: { theme, defaultZoom, ... }
  - recentDocs: [...]
  - apiKeys: { ... } (for AI features)
```

## 6. Component Hierarchy

```
viewer.html
    |
    v
ViewerApp (src/viewer/App.tsx)
    |
    +----+----+
    |         |
    v         v
Toolbar   ScrollContainer
  |            |
  |            v
  |       [Page, Page, Page, ...]
  |            |
  |            v
  |       Page Component
  |            |
  |            v
  |       <canvas> (PDF.js render)
  |
  +-------- useRenderQueue
                |
                v
            RenderQueue (priority queue)
                |
                v
            CanvasCache (LRU, max 10)
```

## 7. Error Handling Flow

```
PDF Load Attempt
         |
    +----+----+
    |         |
    v         v
Success   Failure
    |         |
    |    +----+----+
    |    |         |
    |    v         v
    |  CORS    Encrypted
    |    |         |
    |    v         v
    |  Show    Show
    |  Error   Unsupported
    |  Card    Message
    |    |         |
    |    v         v
    |  "Open   "Open in
    |   in     Native
    |   Native Viewer"
    |   Viewer"
    |
    v
Render PDF
```

## Key Design Decisions

1. **DNR vs webRequest**: DNR is MV3-required, declarative, more performant
2. **OPFS vs FileSystem API**: OPFS is persistent, private, modern
3. **Canvas vs DOM**: Canvas for PDF rendering (PDF.js standard)
4. **IntersectionObserver vs scroll events**: More performant, browser-optimized
5. **Priority queue**: Ensures visible pages render first
6. **LRU cache**: Prevents memory leaks with large PDFs
7. **Hash-based routing**: Shareable, bookmarkable deep links
8. **IndexedDB for state**: Large storage quota, async, persistent

## Performance Optimizations

- Virtualization: Only render visible ±2 pages
- Single-threaded rendering: Prevents PDF.js worker overload
- Canvas eviction: Keep max 10 to limit memory
- DPI scaling: Sharp rendering on high-DPI displays
- Debounced persistence: Avoid excessive IndexedDB writes
- Pre-rendering: Next/prev pages ready for smooth navigation

## Security Model

- Extension origin: `chrome-extension://<id>/`
- OPFS scoped to extension origin
- IndexedDB scoped to extension origin
- No external API calls (except PDF.js CDN)
- CSP: `script-src 'self' 'wasm-unsafe-eval'` for PDF.js worker
- Permissions: Minimal (DNR, storage, unlimitedStorage)

---

This flow diagram helps understand the complete architecture and data flow of DocuMind.
