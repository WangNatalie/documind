# DocuMind - Setup & Testing Guide

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

This installs:
- React 18 + React DOM
- Vite + CRXJS for MV3 bundling
- TypeScript + types
- Tailwind CSS + PostCSS
- PDF.js for rendering
- idb for IndexedDB
- nanoid for ID generation
- zustand for state (if needed)

### 2. Prepare Icons (Optional)

For development, you can skip this step. For production:

**Option A: Create your own icons**
- Create PNG files: `icon16.png`, `icon48.png`, `icon128.png`
- Place them in `public/icons/`
- Recommended: Blue (#3B82F6) background with white PDF document icon

**Option B: Use online generator**
- Use https://favicon.io/ or similar
- Generate 16x16, 48x48, 128x128 PNG icons
- Download and place in `public/icons/`

**Option C: Skip for now**
- Extension will work without icons (Chrome shows default icon)

### 3. Build for Development

```bash
npm run dev
```

This starts Vite dev server on http://localhost:5173 and watches for changes.

### 4. Load Extension

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top right)
3. Click **Load unpacked**
4. Select the `dist` folder in your project directory
5. The extension should now appear in your toolbar

**Note**: Every time you make code changes, the extension will auto-reload (HMR) in dev mode.

### 5. Build for Production

```bash
npm run build
```

This creates an optimized production build in the `dist` folder.

### 6. Package as ZIP (Optional)

```bash
npm run pack
```

Creates `documind.zip` ready for Chrome Web Store or distribution.

---

## Testing the Extension

### Test 1: Web PDF Redirect

**Goal**: Verify that navigating to a PDF URL opens in the custom viewer.

1. In Chrome, navigate to any public PDF URL, for example:
   - https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf
   - https://arxiv.org/pdf/1706.03762.pdf (Attention is All You Need paper)

2. **Expected**: The PDF should automatically redirect to your viewer
   - URL should change to: `chrome-extension://.../viewer.html?file=<original-url>`
   - First page should render in < 500ms (typical)

3. **Verify**:
   - ✓ PDF loads and displays
   - ✓ Toolbar shows correct page count
   - ✓ Smooth scroll works
   - ✓ No console errors

**Troubleshooting**:
- If redirect doesn't happen: Check that DNR rules are active in `chrome://extensions/` details
- If CORS error: Expected for some PDFs; error card should display with "Open in Native Viewer" button
- If blank page: Check console for errors; verify PDF.js worker loaded

---

### Test 2: Zoom & Navigation

**Goal**: Test zoom controls and keyboard shortcuts.

1. Open any PDF in the viewer
2. Test zoom buttons in toolbar:
   - Click `+` button → PDF should zoom in
   - Click `-` button → PDF should zoom out
   - Click **Fit Width** → Should fit to container width
   - Click **Fit Page** → Should fit entire page

3. Test keyboard shortcuts:
   - `Ctrl/Cmd + +` → Zoom in
   - `Ctrl/Cmd + -` → Zoom out
   - `Ctrl/Cmd + 0` → Reset to Fit Width
   - `→` or `PgDn` → Next page
   - `←` or `PgUp` → Previous page

4. **Verify**:
   - ✓ Only visible pages re-render on zoom (check console for render logs)
   - ✓ Page indicator updates correctly
   - ✓ No jank or lag during zoom
   - ✓ Keyboard shortcuts work

---

### Test 3: State Persistence

**Goal**: Verify last page and zoom are saved and restored.

1. Open a PDF in the viewer
2. Navigate to page 5 (or any page other than 1)
3. Zoom to 150%
4. Note the URL hash: should be `#page=5&zoom=150`
5. Close the tab
6. Reopen the same PDF (navigate to same URL again)

**Expected**:
- Viewer should restore to page 5 at 150% zoom
- Hash should match

7. **Verify**:
   - ✓ Correct page restored
   - ✓ Correct zoom restored
   - ✓ Hash in URL matches state

**Troubleshooting**:
- Check IndexedDB: Open DevTools → Application → IndexedDB → `pdf_viewer_v0` → `docs`
- Verify doc record has correct `lastPage` and `lastZoom`

---

### Test 4: Hash Deep Linking

**Goal**: Test URL hash parameters for direct page/zoom access.

1. Open any PDF
2. Manually edit the URL hash to: `#page=10&zoom=200`
3. Reload the page

**Expected**:
- Viewer should jump to page 10
- Zoom should be 200%

4. **Verify**:
   - ✓ Correct page displayed
   - ✓ Correct zoom applied
   - ✓ Toolbar reflects state

---

### Test 5: Local PDF Upload (Popup)

**Goal**: Test drag & drop of local PDF files.

1. Click the extension icon to open the popup
2. Drag a PDF file from your computer onto the drop zone
   - Or click the drop zone to open file picker and select a PDF

**Expected**:
- Upload progress indicator appears
- New tab opens with viewer
- URL should be: `chrome-extension://.../viewer.html?uploadId=<id>&name=<filename>`
- PDF renders correctly

3. Close the tab and reopen the popup
4. Drop the **same file** again

**Expected**:
- New viewer tab opens
- Same file is recognized (different uploadId, but docHash should match if file unchanged)

5. **Verify**:
   - ✓ File uploads successfully
   - ✓ Viewer opens in new tab
   - ✓ PDF renders from OPFS
   - ✓ File persists (check OPFS in DevTools → Application → Storage)

**Troubleshooting**:
- If upload fails: Check console for OPFS errors
- Check storage quota: `navigator.storage.estimate()` in console
- Request persistent storage manually: `navigator.storage.persist()` in console

---

### Test 6: Canvas Memory Management

**Goal**: Verify that only 10 canvases are kept in memory (LRU eviction).

1. Open a PDF with **> 15 pages** (or use a large PDF)
2. Open DevTools console
3. Scroll quickly from page 1 to page 15+

**Expected**:
- Console logs should show: `Evicted page X from canvas cache`
- This confirms that old pages are being cleared from memory

4. **Verify**:
   - ✓ Eviction logs appear
   - ✓ Scrolling remains smooth
   - ✓ No memory warnings

**Troubleshooting**:
- If no eviction logs: Increase PDF size or scroll further
- Check canvas cache limit in `src/viewer/useRenderQueue.ts` (should be 10)

---

### Test 7: CORS Error Handling

**Goal**: Test error card for CORS-blocked PDFs.

1. Find a PDF URL that is CORS-restricted (e.g., some government or intranet PDFs)
2. Navigate to the URL

**Expected**:
- Error card displays with message: "Unable to Load PDF"
- Options shown:
  - "Open in Native Viewer" button → Opens original URL in new tab
  - "Close Tab" button

3. Click "Open in Native Viewer"

**Expected**:
- New tab opens with Chrome's native PDF viewer
- Original URL loads correctly

4. **Verify**:
   - ✓ Error card displays
   - ✓ Buttons work correctly
   - ✓ User has fallback option

---

### Test 8: Dark Mode

**Goal**: Verify dark mode support.

1. Open a PDF in the viewer
2. Change system theme to dark:
   - **Windows**: Settings → Personalization → Colors → Dark
   - **Mac**: System Preferences → General → Appearance → Dark

**Expected**:
- Viewer UI should switch to dark theme
- Toolbar, background, text colors should adapt
- PDF content remains unchanged (white pages)

3. **Verify**:
   - ✓ Dark theme applies
   - ✓ Text remains readable
   - ✓ No color contrast issues

---

### Test 9: Large PDF Performance

**Goal**: Test performance with large PDFs.

1. Open a large PDF (100+ pages, 50+ MB)
   - Example: https://www.pdf995.com/samples/pdf.pdf
   - Or use a technical manual/textbook

2. **Verify**:
   - ✓ First page renders in < 500ms
   - ✓ Scrolling is smooth (no jank)
   - ✓ Memory usage stays reasonable (< 500 MB)
   - ✓ No long tasks > 200ms (check Lighthouse/Performance tab)

3. Run Lighthouse audit (DevTools → Lighthouse):
   - **Target**: No blocking main-thread tasks > 200ms during scroll

---

## Common Issues & Fixes

### Issue: Extension doesn't load
**Fix**:
- Ensure `dist` folder exists (run `npm run build` or `npm run dev`)
- Check for errors in `chrome://extensions/`
- Click "Reload" button on extension card

### Issue: PDF.js worker not found
**Fix**:
- Verify `pdfjs-dist` is installed: `npm install pdfjs-dist`
- Check network tab for 404 on `pdf.worker.min.mjs`
- Rebuild: `npm run build`

### Issue: Tailwind styles not applying
**Fix**:
- Ensure PostCSS config exists: `postcss.config.js`
- Verify Tailwind config has correct content paths
- Rebuild and hard refresh (Ctrl+Shift+R)

### Issue: IndexedDB errors
**Fix**:
- Clear extension storage: DevTools → Application → Clear storage
- Check if storage quota is exceeded: `navigator.storage.estimate()`
- Request persistent storage: `navigator.storage.persist()`

### Issue: OPFS not working
**Fix**:
- OPFS requires secure context (extension contexts are always secure)
- Check browser support: Chrome 86+
- Clear OPFS: DevTools → Application → Storage → Origin Private File System → Delete

---

## Acceptance Criteria Checklist

Run through all tests and mark as complete:

- [ ] **Redirect**: Web PDF opens in viewer < 500ms
- [ ] **Scroll/Zoom**: Smooth performance, no jank
- [ ] **Persist**: Last page/zoom restored on reopen
- [ ] **Hash**: Deep links work (`#page=X&zoom=Y`)
- [ ] **Popup**: Drag & drop opens local PDF
- [ ] **Memory**: Max 10 canvas eviction verified
- [ ] **Errors**: CORS shows fallback card
- [ ] **Lighthouse**: No tasks > 200ms during scroll
- [ ] **Keyboard**: All shortcuts functional
- [ ] **Dark Mode**: Respects system preference

---

## Next Steps

Once all tests pass:

1. **Add real icons** to `public/icons/`
2. **Test with real users** (beta testing)
3. **Performance profiling** with Chrome DevTools
4. **Prepare for Chrome Web Store** submission
5. **Plan AI features** (QA, summary, TOC) for v1

---

## Debugging Tips

### Enable verbose logging
Add to background service worker:
```typescript
console.log('[DocuMind] Debug:', ...);
```

### Inspect IndexedDB
DevTools → Application → IndexedDB → `pdf_viewer_v0`

### Check OPFS files
DevTools → Application → Storage → Origin Private File System

### Monitor render queue
Add logging in `src/viewer/useRenderQueue.ts`:
```typescript
console.log('Rendering page', pageNum, 'with priority', priority);
```

### Profile memory
DevTools → Memory → Take heap snapshot
- Compare before/after scrolling large PDFs
- Check for memory leaks

---

Happy testing! 🚀
