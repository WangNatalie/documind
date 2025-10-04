# DocuMind - AI-Powered PDF Viewer

A Chrome MV3 extension that provides a modern, AI-first, feature-rich PDF viewing experience with virtualized rendering, state persistence, and local file support.

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

Follow these steps to install and run DocuMind.

### Step 1: Install dependencies

Open a terminal in the project directory and run:

```bash
npm install
```

This will install all required packages:

- React & React DOM
- Vite & CRXJS
- TypeScript
- Tailwind CSS
- PDF.js
- idb (IndexedDB helper)
- nanoid (ID generation)

### Step 2: Build the Extension

For development (with hot reload):

```bash
npm run dev
```

For production (optimized build):

```bash
npm run build
```

This creates a `dist/` folder with the compiled extension.

### Step 3: Load Extension in Chrome

Method 1: Chrome Extensions Page

1. Open Google Chrome
2. Navigate to: `chrome://extensions/`
3. Enable **Developer mode** (toggle switch in top right)
4. Click **Load unpacked** button
5. Browse to the `dist/` folder inside your project
6. Click **Select Folder**

Method 2: Direct URL

1. Type `chrome://extensions/` in address bar
2. Follow steps 3-6 above

Verification you did it right:

- You should see a **DocuMind** card in the extensions list
- Extension icon should appear in the Chrome toolbar (if icons are present)
- Status: "Enabled"

### Step 4: Test the Extension

Test 1: Web PDF

1. Navigate to a PDF URL, for example:

```text
https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf
```

Expected results:

- URL redirects to `chrome-extension://.../viewer.html?file=...`
- PDF renders in the custom viewer
- Toolbar shows navigation controls

Test 2: Local PDF

1. Click the DocuMind extension icon in the toolbar
2. Popup opens with a drop zone
3. Drag any PDF file onto the zone (or click to browse)

Expected results:

- A new tab opens
- Your PDF is displayed
- File is saved locally (OPFS)

## Common Setup Issues & Fixes

### Issue 1: `npm install` fails

Symptom: Errors during package installation

Solution:

```bash
# Clear npm cache
npm cache clean --force

# Delete node_modules and package-lock.json

rmdir /s node_modules & del package-lock.json

# Reinstall
npm install
```

### Issue 2: Build errors (TypeScript)

Symptom: TypeScript compilation errors

Solution:

- These are often type-checking warnings, not critical errors
- Run `npm run build` - extension will often still work
- Install missing types if needed:

```bash
npm install -D @types/react @types/react-dom
```

### Issue 3: Extension doesn't load in Chrome

Symptom: "Invalid manifest" or load failure

Solution:

1. Ensure `dist/` folder exists (run `npm run build`)
2. Check `dist/manifest.json` is present
3. Reload extension: Click "Reload" button in `chrome://extensions/`
4. Check extension details and console for errors

### Issue 4: PDFs don't redirect

Symptom: PDFs open in Chrome's native viewer instead of DocuMind

Solution:

1. Check extension is **enabled** in `chrome://extensions/`
2. Verify **DNR rules** are active:
   - Click "Details" on extension card
   - Look for "Declarative Net Request" section
3. Try a different PDF URL
4. Hard refresh the page (Ctrl+Shift+R)

### Issue 5: Icons missing

Symptom: Default Chrome icon shown instead of custom icons

Solution:

- This is expected in development if placeholder files are present
- Icons in this repo are placeholders (.txt files) in `public/icons/`
- To add real icons:
  1. Create or download PNG icons: `icon16.png`, `icon48.png`, `icon128.png`
  2. Place them in `public/icons/`
  3. Rebuild: `npm run build`
  4. Reload extension

## Development Workflow

### Making Changes

1. Edit files in `src/`
2. Save changes
3. Extension auto-reloads (if using `npm run dev`)
4. Refresh any open viewer tabs

### Debugging

1. Open DevTools in viewer tab (F12)
2. Check Console for errors
3. Inspect Network tab for PDF loading issues
4. View IndexedDB: Application → IndexedDB → `pdf_viewer_v0`
5. View OPFS: Application → Storage → Origin Private File System

## Production Build & Packaging

When ready to package for distribution:

```bash
# Build optimized version
npm run build

# Create ZIP file
npm run pack
```

This creates `documind.zip` ready for Chrome Web Store submission or manual distribution.

## Next Steps & References

- Read docs: `README.md` (this file)
- Learn architecture: see `ARCHITECTURE.md` (if present)
- Quick start: see `QUICKSTART.md` (if present)

## Verification Checklist

After installation, verify:

- [ ] Extension appears in `chrome://extensions/`
- [ ] Extension is enabled
- [ ] Web PDF redirect works
- [ ] Popup opens when clicking icon
- [ ] Local PDF upload works
- [ ] Zoom controls functional
- [ ] Page navigation works
- [ ] No console errors

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

**Last Updated**: 2025-10-03
**Version**: 1.0.0
