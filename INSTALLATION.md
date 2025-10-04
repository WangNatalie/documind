# Documind Installation Guide

## Prerequisites
- Node.js (v18 or higher)
- npm
- Google Chrome browser

## Building the Extension

1. Clone the repository:
```bash
git clone https://github.com/WangNatalie/documind.git
cd documind
```

2. Install dependencies:
```bash
npm install
```

3. Build the extension:
```bash
npm run build
```

The built extension will be in the `dist/` directory.

## Loading the Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in the top right)
3. Click "Load unpacked"
4. Select the `dist/` folder from the project directory
5. The Documind extension should now be loaded

## Using the Extension

1. Open any PDF file in Chrome (file:// or https:// URLs)
2. The extension will automatically open the PDF in the custom viewer
3. Features:
   - PDF viewing with zoom controls
   - Navigation buttons and keyboard shortcuts (Arrow keys)
   - AI-generated Table of Contents in sidebar
   - Hover over left edge to show/hide sidebar
   - Last page visited is automatically saved

## API Configuration (Optional)

For enhanced features, you can configure API keys:

### Chunkr.ai API (for semantic chunking)
- Create account at https://chunkr.ai
- Add API key to extension settings
- Without API key, falls back to local chunking

### Google Gemini API (for TOC generation)
- Get API key from https://makersuite.google.com/app/apikey
- Add API key to extension settings
- Without API key, generates basic TOC from document structure

### Transformers.js (for embeddings)
- Runs locally in browser
- No API key needed
- Uses Xenova/all-MiniLM-L6-v2 model

## Development

For development with auto-rebuild:
```bash
npm run dev
```

## Features

- ✅ TypeScript Chrome extension
- ✅ PDF.js integration for PDF rendering
- ✅ Custom viewer with navigation controls
- ✅ Chunkr.ai integration (with local fallback)
- ✅ Google Gemini API integration (with fallback)
- ✅ Transformers.js for text embeddings
- ✅ IndexedDB for storing embeddings and last page
- ✅ Collapsible sidebar with hover functionality
- ✅ Table of contents with page navigation

## Troubleshooting

### Extension doesn't load PDFs
- Make sure the extension has permissions for file:// URLs
- In chrome://extensions/, click "Details" on Documind
- Enable "Allow access to file URLs"

### Table of Contents not generating
- Check browser console for errors
- Verify API keys if configured
- Extension will use fallback methods if APIs unavailable

### PDFs render blank
- Check browser console for errors
- Ensure pdf.worker.mjs is in dist/ folder
- Try rebuilding the extension

## Architecture

```
src/
├── background.ts       # Service worker for PDF interception
├── content.ts          # Content script for PDF detection
├── viewer.ts           # Main viewer logic
├── viewer.html         # Viewer UI
├── viewer.css          # Viewer styles
├── db.ts               # IndexedDB manager
└── services/
    ├── chunkr.ts       # Chunkr.ai integration
    ├── gemini.ts       # Google Gemini integration
    └── embedding.ts    # Transformers.js embeddings
```
