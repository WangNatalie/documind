# Testing Documind

## Quick Test Steps

### 1. Build the Extension
```bash
npm install
npm run build
```

### 2. Load in Chrome
1. Open Chrome
2. Navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked"
5. Select the `dist/` folder from the project
6. Verify Documind appears in the extensions list

### 3. Enable File Access
1. On the extension card, click "Details"
2. Scroll to "Allow access to file URLs"
3. Toggle it ON

### 4. Test with a PDF

#### Option A: Local PDF File
1. Download any PDF file to your computer
2. Open it in Chrome (drag & drop or File > Open)
3. The Documind viewer should automatically load

#### Option B: Online PDF
1. Navigate to any PDF URL (e.g., research papers, documentation)
2. The extension will intercept and load the custom viewer

### 5. Test Core Features

#### PDF Viewing
- [ ] PDF renders correctly
- [ ] Navigation buttons work (Previous/Next)
- [ ] Keyboard arrows work (Left/Right)
- [ ] Zoom in/out buttons work
- [ ] Zoom percentage updates correctly
- [ ] Canvas scales properly

#### Sidebar Functionality
- [ ] Sidebar toggle button visible on left edge
- [ ] Clicking toggle opens sidebar
- [ ] Hover over left edge shows sidebar
- [ ] Close button works
- [ ] TOC items displayed (may be fallback if no API keys)
- [ ] Clicking TOC item navigates to page
- [ ] Active item highlighted

#### Data Persistence
- [ ] Navigate to page 5
- [ ] Close and reopen same PDF
- [ ] Should open on page 5 (last visited)

#### Settings Page
- [ ] Right-click extension icon > Options
- [ ] Settings page opens
- [ ] Can input API keys
- [ ] Save button works
- [ ] Success message appears

## Testing with API Keys

### With Chunkr.ai API Key
1. Get API key from https://chunkr.ai
2. Add in settings page
3. Open a PDF
4. Check console for "Processing with Chunkr.ai..." message
5. Chunks should be more semantically coherent

### With Google Gemini API Key
1. Get API key from https://makersuite.google.com/app/apikey
2. Add in settings page
3. Open a PDF
4. TOC should have more intelligent titles
5. Sections should be better organized

## Browser Console Testing

Open Chrome DevTools (F12) and check for:

### Expected Console Messages
```
Documind viewer initializing...
IndexedDB initialized
PDF loaded: X pages
Rendered page: 1
Processing with Chunkr.ai... (or) No Chunkr API key found, using local chunking
Created X chunks locally
Generating embeddings...
Loading embedding model... (or) Error loading embedding model
Generating table of contents...
No Gemini API key found, using fallback TOC generation (or) Using Gemini API
```

### No Error Messages
- No PDF.js errors
- No IndexedDB errors
- No manifest errors
- No worker loading errors

## Testing Different PDF Types

### Small PDFs (< 10 pages)
- Quick loading
- Fast processing
- Instant TOC generation

### Medium PDFs (10-50 pages)
- Should load progressively
- Chunking takes a few seconds
- TOC generation may take 5-10 seconds

### Large PDFs (50+ pages)
- May take 10-30 seconds to process
- Embedding generation is slowest part
- Use cached version on reload (faster)

## Testing Fallback Mechanisms

### Without API Keys
1. Don't configure any API keys
2. Open a PDF
3. Should still work with:
   - Local chunking (paragraph-based)
   - Basic TOC (section-based)
   - Hash-based embeddings
4. Verify no errors in console

### With Invalid API Keys
1. Enter invalid API keys in settings
2. Open a PDF
3. Should fall back gracefully
4. Check console for fallback messages

## Performance Testing

### Memory Usage
1. Open Chrome Task Manager (Shift+Esc)
2. Find "Extension: Documind"
3. Should be < 500 MB for most PDFs
4. Should not grow excessively over time

### Page Navigation Speed
- Pages should render in < 500ms
- No lag when clicking navigation buttons
- Smooth zoom transitions

### IndexedDB Operations
- Saving chunks should be async (non-blocking)
- Retrieving last page should be instant
- No UI freezing during DB operations

## Troubleshooting Common Issues

### PDF doesn't load
- Check file:// permissions enabled
- Check manifest.json is valid
- Check pdf.worker.mjs exists in dist/
- Check browser console for errors

### Sidebar doesn't appear
- Check viewer.css loaded correctly
- Try clicking the toggle button
- Check z-index isn't being overridden
- Inspect element to verify it exists in DOM

### TOC is empty
- Normal for very short documents
- Check if chunking completed (console)
- Verify no JavaScript errors
- May need to wait for processing

### Last page not remembered
- Check IndexedDB permissions
- Verify DB initialized (console message)
- Check for storage quota issues
- Clear extension data and try again

### Settings don't save
- Check chrome.storage permissions in manifest
- Verify no console errors
- Try reopening settings page
- Check if storage quota exceeded

## Automated Testing

### Future Test Suite
Currently manual testing only. Future automated tests could include:
- Unit tests for services
- Integration tests for DB operations
- E2E tests with Puppeteer
- Visual regression tests
- Performance benchmarks

## Reporting Issues

When reporting bugs, please include:
1. Chrome version
2. Extension version
3. Steps to reproduce
4. Console error messages
5. Screenshot if UI issue
6. Sample PDF if possible (without sensitive data)

## Test PDFs

Good sources for test PDFs:
- https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf
- Research papers from arXiv.org
- Technical documentation
- eBooks (copyright-free)
- Government documents
