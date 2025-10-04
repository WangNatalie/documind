# DocuMind - QA Checklist

This checklist confirms that all acceptance criteria are met before release.

## Acceptance Criteria

### 1. Web PDF Redirect ✓

**Requirement**: Navigating to any `http(s)://…*.pdf` opens our `viewer.html` and renders page 1 < **500ms** typical.

**Test Steps**:
1. Navigate to test PDF URL
2. Measure time to first render
3. Verify URL redirects to viewer

**Pass Criteria**:
- [ ] Redirect happens automatically
- [ ] First page renders in < 500ms (typical, on good connection)
- [ ] URL format: `viewer.html?file=<encodedURL>`
- [ ] No console errors

---

### 2. Scroll & Zoom Performance ✓

**Requirement**: Smooth scroll with no jank; zoom in/out re-renders visible pages only.

**Test Steps**:
1. Open multi-page PDF
2. Scroll through 10+ pages rapidly
3. Zoom in/out using toolbar or keyboard
4. Monitor console for render logs

**Pass Criteria**:
- [ ] Scrolling is smooth (60fps, no dropped frames)
- [ ] Zoom changes only re-render visible ±1 pages
- [ ] No long tasks > 200ms (check Performance tab)
- [ ] UI remains responsive during zoom

---

### 3. State Persistence ✓

**Requirement**: Reopen same doc → restores last page and zoom.

**Test Steps**:
1. Open PDF, navigate to page 10
2. Set zoom to 150%
3. Close tab
4. Reopen same PDF URL

**Pass Criteria**:
- [ ] Opens at page 10
- [ ] Zoom is 150%
- [ ] Hash reflects state: `#page=10&zoom=150`
- [ ] IndexedDB contains correct doc record

---

### 4. Hash Deep Linking ✓

**Requirement**: `#page=47&zoom=150` deep-link works; hash updates while scrolling.

**Test Steps**:
1. Open PDF with hash: `#page=47&zoom=150`
2. Scroll to different page
3. Verify hash updates automatically

**Pass Criteria**:
- [ ] Opens at specified page and zoom
- [ ] Hash updates when scrolling (when page ≥60% visible)
- [ ] Manual hash edit and reload works
- [ ] Bookmark/share link functionality works

---

### 5. Popup Drag & Drop ✓

**Requirement**: Drag a local PDF onto popup → opens new tab with that file rendered.

**Test Steps**:
1. Click extension icon
2. Drag PDF file onto drop zone
3. Verify upload and viewer open

**Pass Criteria**:
- [ ] Drop zone accepts PDF files
- [ ] Rejects non-PDF files with error message
- [ ] Upload progress shown
- [ ] New tab opens with `viewer.html?uploadId=<uuid>&name=<filename>`
- [ ] PDF renders correctly from OPFS
- [ ] File persists after browser restart

---

### 6. Memory Management ✓

**Requirement**: No more than **10** canvases kept; eviction verified by logging.

**Test Steps**:
1. Open PDF with 20+ pages
2. Scroll from page 1 to page 20+
3. Check console logs

**Pass Criteria**:
- [ ] Console shows eviction messages: `Evicted page X from canvas cache`
- [ ] Memory usage stays reasonable (< 500MB for large PDFs)
- [ ] No memory leaks (verify with heap snapshot)
- [ ] Smooth performance maintained

---

### 7. Error Handling ✓

**Requirement**: CORS failure shows the 3-option card; encrypted PDF shows unsupported message.

**Test Steps - CORS**:
1. Navigate to CORS-blocked PDF
2. Verify error card displays

**Pass Criteria - CORS**:
- [ ] Error card shows "Unable to Load PDF"
- [ ] "Open in Native Viewer" button works
- [ ] "Close Tab" button works
- [ ] Clear error message displayed

**Test Steps - Encrypted**:
1. Open password-protected PDF
2. Verify unsupported message

**Pass Criteria - Encrypted**:
- [ ] Unsupported message displays
- [ ] Fallback option provided
- [ ] No crash or blank screen

---

### 8. Lighthouse Performance ✓

**Requirement**: No blocking main-thread long tasks > 200ms during scroll.

**Test Steps**:
1. Open large PDF (50+ pages)
2. Run Lighthouse audit
3. Scroll while recording Performance profile

**Pass Criteria**:
- [ ] No long tasks > 200ms
- [ ] Performance score > 80
- [ ] First Contentful Paint < 1s
- [ ] Time to Interactive < 2s

---

## Additional Quality Checks

### UI/UX

- [ ] Toolbar is sticky and always visible
- [ ] Buttons have clear hover states
- [ ] Page input accepts manual entry
- [ ] Zoom label updates correctly
- [ ] Loading skeletons display during render
- [ ] Error messages are user-friendly

### Keyboard Navigation

- [ ] `←` / `→` navigate pages
- [ ] `PgUp` / `PgDn` navigate pages
- [ ] `Ctrl/Cmd + +` zooms in
- [ ] `Ctrl/Cmd + -` zooms out
- [ ] `Ctrl/Cmd + 0` resets to Fit Width
- [ ] All shortcuts work as expected

### Dark Mode

- [ ] Respects `prefers-color-scheme`
- [ ] All UI elements adapt to dark theme
- [ ] Text remains readable
- [ ] No color contrast issues

### Cross-Browser (Chrome variants)

- [ ] Chrome (latest)
- [ ] Chromium (latest)
- [ ] Edge (Chromium-based)
- [ ] Brave (optional)

### File Types

- [ ] Standard PDF (text-based)
- [ ] Large PDF (100+ pages, 50+ MB)
- [ ] Small PDF (1-5 pages)
- [ ] PDF with images
- [ ] PDF with complex layouts
- [ ] Scanned PDF (image-only)

### Edge Cases

- [ ] Empty PDF (0 pages) - graceful error
- [ ] Corrupted PDF - graceful error
- [ ] Very large file (> 100 MB) - performance acceptable
- [ ] Network interruption during load - error handling
- [ ] Browser refresh during render - state recovers

---

## Security & Privacy

- [ ] No external API calls (except PDF.js CDN fallback)
- [ ] Local files stay in OPFS (not uploaded)
- [ ] IndexedDB scoped to extension origin
- [ ] No tracking or analytics
- [ ] CSP headers correctly set in manifest

---

## Accessibility (Future)

- [ ] Keyboard navigation (already tested above)
- [ ] Screen reader compatibility (future)
- [ ] ARIA labels (future)
- [ ] Focus indicators (future)

---

## Pre-Release Checklist

- [ ] All acceptance criteria passed
- [ ] No console errors or warnings
- [ ] Icons added (or placeholder note in README)
- [ ] README.md up to date
- [ ] TESTING.md complete
- [ ] package.json version updated
- [ ] manifest.json version matches package.json
- [ ] Build size < 5 MB
- [ ] No sensitive data in repo

---

## Known Limitations (v0)

Document these for users:

- [ ] No text search (planned for v1)
- [ ] No annotations/highlights (planned for v1)
- [ ] No OCR for scanned PDFs (planned for v1)
- [ ] No AI features yet (QA, summary, TOC)
- [ ] Limited to Chromium-based browsers
- [ ] No Firefox support (different extension API)

---

## Sign-Off

**QA Engineer**: ___________________ Date: ___________

**Developer**: ___________________ Date: ___________

**Product Owner**: ___________________ Date: ___________

---

## Notes

(Add any observations, bugs found, or improvements for future releases)

---

**Status**:
- [ ] In Progress
- [ ] Ready for Beta
- [ ] Ready for Production

**Next Steps**:
1. Fix any failing criteria above
2. Beta test with 5-10 users
3. Address feedback
4. Prepare Chrome Web Store listing
5. Submit for review
