# DocuMind - AI-Powered PDF Viewer

A Chrome MV3 extension that provides a modern, feature-rich PDF viewing experience with virtualized rendering, state persistence, and local file support.

## Features

✨ **Automatic PDF Interception**: Opens any `http(s)://...*.pdf` in the built-in viewer
📄 **Smooth Virtualized Rendering**: IntersectionObserver-based rendering with memory management
💾 **State Persistence**: Remembers last page and zoom level per document
📂 **Local File Support**: Drag & drop PDFs onto the popup to view them
🎨 **Modern UI**: Built with React + Tailwind CSS
🌙 **Dark Mode**: Respects system color scheme preferences
⌨️ **Keyboard Navigation**: Arrow keys, Page Up/Down, Ctrl+/- for zoom

## Tech Stack

- **Build**: Vite + CRXJS (MV3 bundling) + TypeScript
- **UI**: React 18, Tailwind CSS
- **PDF Rendering**: PDF.js
- **Storage**: IndexedDB (via `idb`) + OPFS for local files
- **State Management**: React hooks + lightweight state

## Installation

### For Development

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Add icon files** (or use placeholders):
   - Place `icon16.png`, `icon48.png`, `icon128.png` in `public/icons/`
   - Or run: `node scripts/prepare-icons.js`

3. **Start development server**:
   ```bash
   npm run dev
   ```

4. **Load extension in Chrome**:
   - Navigate to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist` folder

### For Production

1. **Build the extension**:
   ```bash
   npm run build
   ```

2. **Package as ZIP** (optional):
   ```bash
   npm run pack
   ```

3. **Load the built extension**:
   - Navigate to `chrome://extensions/`
   - Load the `dist` folder

## Usage

### Web PDFs
- Navigate to any PDF URL (e.g., `https://example.com/document.pdf`)
- The extension automatically redirects to the built-in viewer
- Your last page and zoom level are saved

### Local PDFs
1. Click the extension icon to open the popup
2. Drag and drop a PDF file onto the drop zone (or click to browse)
3. The PDF opens in a new tab with the viewer
4. Files are stored in OPFS (Origin Private File System)

### Keyboard Shortcuts
- `←` / `→` or `PgUp` / `PgDn`: Navigate pages
- `Ctrl/Cmd` + `+`: Zoom in
- `Ctrl/Cmd` + `-`: Zoom out
- `Ctrl/Cmd` + `0`: Fit width

### URL Deep Linking
Share specific pages with hash parameters:
```
viewer.html?file=<url>#page=47&zoom=150
viewer.html?uploadId=<id>&name=<filename>#page=10&zoom=fitWidth
```

## Architecture

### Extension Surfaces

1. **Background Service Worker** (`src/background/index.ts`)
   - Registers Declarative Net Request rules for PDF interception
   - Minimal logic (MV3 compliant)

2. **Viewer** (`src/viewer/`)
   - Main PDF viewing application
   - Virtualized page rendering with IntersectionObserver
   - State persistence and restoration
   - Hash-based deep linking

3. **Popup** (`src/popup/`)
   - Drag & drop interface for local PDFs
   - OPFS file management
   - Opens viewer in new tab

### Data Storage

- **IndexedDB** (`pdf_viewer_v0`):
  - `docs`: Document metadata (hash, source, last page/zoom, etc.)
  - `pages`: Page-level data (text, headings - reserved for future)

- **OPFS**: Raw PDF bytes for local files (`/pdf/<uploadId>.pdf`)

- **chrome.storage.local**: Preferences and recent docs (future)

### Rendering Pipeline

- **Render Queue**: Single-threaded rendering with priority queue
- **Canvas Cache**: LRU cache keeps max 10 rendered pages in memory
- **Virtualization**: Only visible ±2 pages are enqueued for rendering
- **DPI Aware**: Canvas bitmap size accounts for `devicePixelRatio`

## Troubleshooting

### CORS Errors
If a web PDF fails to load due to CORS:
- The viewer shows an error card with options:
  - "Open in Native Viewer" → Opens original URL in Chrome's PDF viewer
  - Future: "Download & open locally" option

### Encrypted PDFs
Encrypted/password-protected PDFs are not supported in v0. The viewer will show an unsupported message.

### Storage Quota
- Extension requests persistent storage on first local file upload
- Check quota at: `chrome://settings/content/all` → find extension origin
- Future: Implement cleanup for old files

### Icons Missing
If icons don't appear:
- Ensure PNG files exist in `public/icons/`
- Rebuild: `npm run build`
- Reload extension in `chrome://extensions/`

## Testing Checklist

- [ ] Web PDF redirect works (< 500ms to first page)
- [ ] Smooth scrolling with no jank
- [ ] Zoom in/out re-renders only visible pages
- [ ] Last page/zoom restored on reopen
- [ ] Hash deep-link works (`#page=X&zoom=Y`)
- [ ] Popup drag & drop opens local PDF
- [ ] Max 10 canvas cache eviction works (check console logs)
- [ ] CORS error shows fallback card
- [ ] Keyboard shortcuts work
- [ ] Dark mode respects system preference

## Roadmap (Future)

- [ ] AI-powered features (QA, summary, TOC extraction)
- [ ] OCR for scanned documents
- [ ] Text search within PDFs
- [ ] Annotations and highlights
- [ ] Cloud sync for state
- [ ] Content script integration for enhanced features

## License

MIT

---

Built with ❤️ using Vite + React + Tailwind + PDF.js
