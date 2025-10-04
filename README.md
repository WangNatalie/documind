# Documind

AI-powered PDF viewer Chrome extension for efficient learning and studying.

## Features

- 🔍 **PDF Viewing**: Built-in PDF viewer with zoom and navigation controls
- 🤖 **AI-Powered TOC**: Automatically generates table of contents using Google Gemini AI
- 📚 **Semantic Chunking**: Breaks PDFs into meaningful segments using Chunkr.ai
- 🔎 **Smart Search**: Text embeddings using Transformers.js for semantic search
- 💾 **Smart Bookmarks**: Automatically saves last page visited for each PDF
- 🎨 **Clean UI**: Modern, distraction-free interface with collapsible sidebar

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Build the extension:**
   ```bash
   npm run build
   ```

3. **Load in Chrome:**
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist/` folder

See [INSTALLATION.md](INSTALLATION.md) for detailed instructions.

## Technology Stack

- **TypeScript** - Type-safe development
- **PDF.js** - Mozilla's PDF rendering library
- **Transformers.js** - In-browser ML models for embeddings
- **Chunkr.ai** - Semantic document segmentation
- **Google Gemini** - AI-powered content analysis
- **IndexedDB** - Local storage for embeddings and preferences
- **Webpack** - Module bundling

## Usage

Open any PDF file in Chrome, and Documind will automatically:
1. Render the PDF in a custom viewer
2. Generate semantic chunks of the document
3. Create embeddings for intelligent search
4. Generate an AI-powered table of contents
5. Remember your last page for quick resume

Use the sidebar (hover on left edge) to navigate through the table of contents.

## Development

```bash
npm run dev    # Watch mode for development
npm run build  # Production build
```

## License

MIT
