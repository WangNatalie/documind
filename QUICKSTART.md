# DocuMind - Quick Start Guide

Get up and running in 5 minutes!

## Prerequisites

- Node.js 18+ and npm
- Google Chrome (or Chromium-based browser)
- Basic knowledge of Chrome extensions

## Installation (3 steps)

### Step 1: Install Dependencies

```bash
npm install
```

Wait for all packages to download (~2 minutes).

### Step 2: Build Extension

```bash
npm run dev
```

This starts the development server and creates a `dist/` folder.

### Step 3: Load in Chrome

1. Open Chrome
2. Go to `chrome://extensions/`
3. Enable **Developer mode** (top right toggle)
4. Click **Load unpacked**
5. Select the `dist/` folder
6. Done! 🎉

## Quick Test

### Test Web PDFs

Navigate to any PDF URL:
```
https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf
```

**Expected**: Automatically opens in DocuMind viewer

### Test Local PDFs

1. Click extension icon in toolbar
2. Drag any PDF file onto the drop zone
3. New tab opens with your PDF

## Keyboard Shortcuts

- `←` / `→` - Navigate pages
- `Ctrl/Cmd + +` - Zoom in
- `Ctrl/Cmd + -` - Zoom out
- `Ctrl/Cmd + 0` - Fit width

## Troubleshooting

### Extension doesn't load
- Make sure `dist/` folder exists
- Check for errors in `chrome://extensions/`
- Try: Delete `dist/`, run `npm run dev` again

### PDF doesn't open
- Check if DNR rule is active (click extension details)
- Try refreshing the PDF URL
- Check browser console for errors

### TypeScript errors
- Run `npm install` again
- These are development warnings - extension still works

## Next Steps

- Read full docs: [README.md](./README.md)
- Run tests: [TESTING.md](./TESTING.md)
- See architecture: [ARCHITECTURE.md](./ARCHITECTURE.md)

## Production Build

When ready to package:

```bash
npm run build
npm run pack
```

Creates `documind.zip` ready for distribution.

---

Need help? Check the [README](./README.md) or open an issue on GitHub.
