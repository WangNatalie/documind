# Documind Features Documentation

## Core Features

### 1. PDF Viewing
- **Built with PDF.js**: Mozilla's robust PDF rendering library
- **Navigation Controls**: Previous/Next page buttons
- **Keyboard Shortcuts**: Arrow keys for page navigation
- **Zoom Controls**: Zoom in/out with percentage display
- **Responsive Canvas**: High-quality PDF rendering

### 2. AI-Powered Table of Contents
- **Automatic Generation**: Uses Google Gemini AI to analyze document structure
- **Semantic Understanding**: Creates meaningful section titles
- **Page Navigation**: Click any TOC item to jump to that page
- **Fallback Mode**: Works without API key using basic structure analysis

### 3. Semantic Document Chunking
- **Chunkr.ai Integration**: Breaks PDFs into meaningful segments
- **Context Preservation**: Maintains semantic coherence in chunks
- **Local Fallback**: Paragraph-based chunking when API unavailable
- **Efficient Processing**: Smart chunking for better AI analysis

### 4. Text Embeddings
- **Transformers.js**: Runs ML models directly in browser
- **Model**: Xenova/all-MiniLM-L6-v2 for embeddings
- **No Server Required**: Completely client-side processing
- **Similarity Search**: Find related content across document
- **Fallback Support**: Hash-based embeddings when model unavailable

### 5. Smart Storage with IndexedDB
- **Chunk Storage**: Saves processed chunks with embeddings
- **Last Page Memory**: Remembers where you left off for each PDF
- **Efficient Caching**: Avoids reprocessing same documents
- **Per-Document Tracking**: Individual memory for each PDF file

### 6. Interactive Sidebar
- **Hover Activation**: Shows on left edge hover
- **Collapsible**: Clean, minimal interface
- **Active Highlighting**: Current section highlighted
- **Smooth Animations**: Professional transitions

## User Interface

### Toolbar
- Previous Page button
- Page indicator (e.g., "Page 1 / 10")
- Next Page button
- Zoom out button
- Zoom level display (e.g., "100%")
- Zoom in button

### Sidebar
- Table of Contents header
- Close button
- Scrollable TOC items
- Each item shows title and page number
- Click to navigate

### Toggle Button
- Fixed on left edge
- Always visible
- Opens/closes sidebar
- Hover effect for discoverability

## Technical Architecture

### Extension Components
```
├── Background Service Worker (background.ts)
│   └── Intercepts PDF URLs
│   └── Redirects to custom viewer
│
├── Content Script (content.ts)
│   └── Detects PDF files
│   └── Communicates with background
│
├── Viewer (viewer.ts)
│   └── Main application logic
│   └── PDF rendering
│   └── AI integration
│   └── UI management
│
├── Database Manager (db.ts)
│   └── IndexedDB operations
│   └── Chunk storage
│   └── Page tracking
│
└── Services
    ├── Chunkr Service (chunkr.ts)
    │   └── Semantic segmentation
    │
    ├── Gemini Service (gemini.ts)
    │   └── TOC generation
    │
    └── Embedding Service (embedding.ts)
        └── Text embeddings
```

### Data Flow
1. User opens PDF in Chrome
2. Extension intercepts and loads custom viewer
3. PDF.js renders the document
4. Text extraction from all pages
5. Chunkr.ai creates semantic segments
6. Transformers.js generates embeddings
7. Embeddings + chunks saved to IndexedDB
8. Gemini generates table of contents
9. TOC displayed in sidebar
10. User interactions update last page in IndexedDB

## API Integration

### Optional APIs
All API integrations have fallback mechanisms:

#### Chunkr.ai
- **Purpose**: Semantic document segmentation
- **Fallback**: Paragraph-based chunking
- **Configuration**: Settings page

#### Google Gemini
- **Purpose**: Intelligent TOC generation
- **Fallback**: Basic section detection
- **Configuration**: Settings page

#### Transformers.js
- **Purpose**: Text embeddings for search
- **Fallback**: Hash-based embeddings
- **Configuration**: None (runs locally)

## Performance Considerations

### Optimization Strategies
- Lazy loading of AI models
- Caching processed documents
- Efficient IndexedDB queries
- Debounced page saves
- Progressive enhancement

### Memory Management
- Chunks stored in IndexedDB (not RAM)
- Canvas reused for rendering
- Models loaded once per session
- Automatic cleanup of old data

## Browser Compatibility

### Supported
- Chrome 88+ (Manifest V3 support)
- Chromium-based browsers (Edge, Brave, etc.)

### Required APIs
- IndexedDB
- Chrome Extension APIs
- Web Workers (for PDF.js)
- Canvas API

## Security & Privacy

### Data Storage
- All data stored locally in IndexedDB
- No data sent to servers (except optional APIs)
- API keys stored in chrome.storage.local
- No telemetry or tracking

### Permissions
- `storage`: For preferences and data
- `tabs`: For PDF interception
- `file:///*`: For local PDF files
- External hosts: Only for configured APIs

## Future Enhancements

### Potential Features
- Full-text search across PDFs
- Annotations and highlights
- Export TOC to markdown
- Multi-PDF workspace
- Collaborative annotations
- Citation management
- Research paper features
- Dark mode
- Mobile support
- PDF editing capabilities

### Community Contributions
See CONTRIBUTING.md for guidelines on submitting features.
