# Installation Instructions

Follow these steps to install and run DocuMind PDF Viewer extension.

## Step 1: Install Dependencies

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

**Time**: ~2-3 minutes

## Step 2: Build the Extension

For **development** (with hot reload):

```bash
npm run dev
```

For **production** (optimized build):

```bash
npm run build
```

This creates a `dist/` folder with the compiled extension.

**Time**: ~30-60 seconds

## Step 3: Load Extension in Chrome

### Method 1: Chrome Extensions Page

1. Open Google Chrome
2. Navigate to: `chrome://extensions/`
3. Enable **Developer mode** (toggle switch in top right)
4. Click **Load unpacked** button
5. Browse to the `dist/` folder inside your project
6. Click **Select Folder**

### Method 2: Direct URL

1. Type `chrome://extensions/` in address bar
2. Follow steps 3-6 above

### Verification

You should see:
- **DocuMind** card in the extensions list
- Extension icon in Chrome toolbar (if icons are added)
- Status: "Enabled"

## Step 4: Test the Extension

### Test 1: Web PDF

1. Navigate to a PDF URL:
   ```
   https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf
   ```

2. **Expected Result**:
   - URL redirects to `chrome-extension://...​/viewer.html?file=...`
   - PDF renders in custom viewer
   - Toolbar shows navigation controls

### Test 2: Local PDF

1. Click the DocuMind extension icon in toolbar
2. Popup opens with drop zone
3. Drag any PDF file onto the zone (or click to browse)
4. **Expected Result**:
   - New tab opens
   - Your PDF is displayed
   - File is saved locally (OPFS)

## Common Setup Issues

### Issue 1: `npm install` fails

**Symptom**: Errors during package installation

**Solution**:
```bash
# Clear npm cache
npm cache clean --force

# Delete node_modules and package-lock.json
rm -rf node_modules package-lock.json  # Mac/Linux
# or
rmdir /s node_modules & del package-lock.json  # Windows CMD

# Reinstall
npm install
```

### Issue 2: Build errors (TypeScript)

**Symptom**: TypeScript compilation errors

**Solution**:
- These are often type-checking warnings, not critical errors
- Run `npm run build` - extension will still work
- Install missing types: `npm install -D @types/react @types/react-dom`

### Issue 3: Extension doesn't load in Chrome

**Symptom**: "Invalid manifest" or load failure

**Solution**:
1. Ensure `dist/` folder exists (run `npm run build`)
2. Check `dist/manifest.json` is present
3. Reload extension: Click "Reload" button in `chrome://extensions/`
4. Check for errors in extension details

### Issue 4: PDFs don't redirect

**Symptom**: PDFs open in Chrome's native viewer

**Solution**:
1. Check extension is **enabled** in `chrome://extensions/`
2. Verify **DNR rules** are active:
   - Click "Details" on extension card
   - Look for "Declarative Net Request" section
3. Try a different PDF URL
4. Hard refresh the page (Ctrl+Shift+R)

### Issue 5: Icons missing

**Symptom**: Default Chrome icon shown instead of custom icons

**Solution**:
- This is **expected** in development
- Icons are placeholders (.txt files)
- Extension works fine without them
- To add icons: Replace `.txt` files in `public/icons/` with `.png` files

## Optional: Add Real Icons

1. Create or download PNG icons:
   - `icon16.png` (16×16 pixels)
   - `icon48.png` (48×48 pixels)
   - `icon128.png` (128×128 pixels)

2. Place in `public/icons/` folder

3. Rebuild:
   ```bash
   npm run build
   ```

4. Reload extension in Chrome

## Development Workflow

### Making Changes

1. Edit files in `src/`
2. Save changes
3. Extension auto-reloads (if using `npm run dev`)
4. Refresh any open viewer tabs

### Debugging

1. Open DevTools in viewer tab (F12)
2. Check Console for errors
3. Inspect Network tab for PDF loading
4. View IndexedDB: Application → IndexedDB → `pdf_viewer_v0`
5. View OPFS: Application → Storage → Origin Private File System

### Production Build

When ready to package:

```bash
# Build optimized version
npm run build

# Create ZIP file
npm run pack
```

This creates `documind.zip` ready for:
- Chrome Web Store submission
- Distribution to testers
- Manual installation

## Next Steps

- **Read docs**: [README.md](./README.md)
- **Run tests**: Follow [TESTING.md](./TESTING.md)
- **Learn architecture**: See [ARCHITECTURE.md](./ARCHITECTURE.md)
- **Quick start**: Check [QUICKSTART.md](./QUICKSTART.md)

## Getting Help

If you encounter issues:

1. Check the troubleshooting section above
2. Review [TESTING.md](./TESTING.md) for test scenarios
3. Open an issue on GitHub with:
   - Error message
   - Steps to reproduce
   - Browser version
   - Extension version

## System Requirements

- **Node.js**: 18.0.0 or higher
- **npm**: 8.0.0 or higher
- **Chrome**: 88 or higher (for MV3 support)
- **OS**: Windows, macOS, or Linux

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

## Success!

If all checks pass, you're ready to use DocuMind! 🎉

Try opening some PDFs and explore the features:
- Zoom in/out
- Navigate pages
- Upload local files
- Test state persistence (close and reopen a PDF)

---

**Last Updated**: 2025-10-03
**Version**: 1.0.0
