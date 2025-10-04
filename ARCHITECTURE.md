# Documind Architecture

## Overview

Documind is a Chrome extension that provides an AI-enhanced PDF viewing experience. This document describes the technical architecture and design decisions.

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Chrome Browser                       │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                  Documind Extension                    │  │
│  │                                                         │  │
│  │  ┌─────────────┐      ┌──────────────┐               │  │
│  │  │  Background │      │   Content    │               │  │
│  │  │   Service   │◄────►│   Script     │               │  │
│  │  │   Worker    │      │              │               │  │
│  │  └─────────────┘      └──────────────┘               │  │
│  │         │                                              │  │
│  │         ▼                                              │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │           PDF Viewer (viewer.ts)                │  │  │
│  │  │  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │  │  │
│  │  │  │  PDF.js  │  │   UI     │  │  AI Services │  │  │  │
│  │  │  │ Renderer │  │ Controls │  │   Manager    │  │  │  │
│  │  │  └──────────┘  └──────────┘  └──────────────┘  │  │  │
│  │  └─────────────────────────────────────────────────┘  │  │
│  │         │                 │                │           │  │
│  │         ▼                 ▼                ▼           │  │
│  │  ┌──────────┐     ┌──────────┐     ┌──────────┐      │  │
│  │  │ PDF.js   │     │IndexedDB │     │ Services │      │  │
│  │  │  Worker  │     │ Manager  │     │          │      │  │
│  │  └──────────┘     └──────────┘     └──────────┘      │  │
│  │                                           │           │  │
│  └───────────────────────────────────────────┼───────────┘  │
│                                              │               │
└──────────────────────────────────────────────┼───────────────┘
                                               │
                    ┌──────────────────────────┼────────────────────┐
                    │                          ▼                    │
                    │  ┌──────────┐  ┌──────────────┐  ┌─────────┐ │
                    │  │ Chunkr   │  │    Gemini    │  │Transform│ │
                    │  │   API    │  │     API      │  │  ers.js │ │
                    │  │(Optional)│  │  (Optional)  │  │ (Local) │ │
                    │  └──────────┘  └──────────────┘  └─────────┘ │
                    │                                                │
                    │            External Services                   │
                    └────────────────────────────────────────────────┘
```

## Component Details

### 1. Background Service Worker (background.ts)
**Purpose**: Intercepts PDF requests and manages extension lifecycle

**Responsibilities**:
- Listen for navigation events to PDF files
- Redirect PDF URLs to custom viewer
- Handle messages from content scripts
- Manage extension state

**APIs Used**:
- `chrome.webNavigation.onBeforeNavigate`
- `chrome.runtime.onMessage`
- `chrome.tabs.update`

### 2. Content Script (content.ts)
**Purpose**: Detect PDF files in web pages

**Responsibilities**:
- Check if current page is a PDF
- Send detection messages to background
- Minimal, lightweight execution

**APIs Used**:
- `document.contentType`
- `chrome.runtime.sendMessage`

### 3. PDF Viewer (viewer.ts)
**Purpose**: Main application logic and UI coordination

**Responsibilities**:
- Initialize PDF.js
- Manage PDF rendering
- Handle user interactions
- Coordinate AI services
- Manage IndexedDB operations
- Update UI state

**Key Functions**:
- `loadPDF()`: Load PDF document
- `renderPage()`: Render specific page
- `processPDFWithAI()`: Trigger AI processing
- `generateTOC()`: Create table of contents
- `setupEventListeners()`: Wire up UI events

### 4. Database Manager (db.ts)
**Purpose**: Manage IndexedDB operations

**Schema**:
```typescript
Database: 'documind'
├── Store: 'chunks'
│   ├── Key: pdfUrl (string)
│   ├── Value: {
│   │   pdfUrl: string
│   │   chunks: Array<{
│   │     text: string
│   │     index: number
│   │     page?: number
│   │     embedding?: number[]
│   │   }>
│   │   timestamp: number
│   └── }
└── Store: 'lastPages'
    ├── Key: pdfUrl (string)
    └── Value: {
        pdfUrl: string
        pageNumber: number
        timestamp: number
    }
```

**Operations**:
- `init()`: Initialize database
- `saveChunks()`: Store document chunks
- `getChunks()`: Retrieve cached chunks
- `saveLastPage()`: Store last visited page
- `getLastPage()`: Retrieve last page
- `clearAll()`: Clear all data

### 5. Service Integrations

#### Chunkr Service (services/chunkr.ts)
**Purpose**: Semantic document segmentation

**Flow**:
1. Receive full document text
2. Call Chunkr API (if key available)
3. Parse API response
4. Fallback to local chunking if API fails
5. Return normalized chunks

**Fallback**: Paragraph-based chunking with max size limit

#### Gemini Service (services/gemini.ts)
**Purpose**: AI-powered table of contents generation

**Flow**:
1. Receive chunk summaries
2. Create prompt for Gemini
3. Call Gemini API (if key available)
4. Parse JSON response
5. Fallback to basic TOC if API fails
6. Estimate page numbers

**Fallback**: Section-based TOC from chunk distribution

#### Embedding Service (services/embedding.ts)
**Purpose**: Generate text embeddings for semantic search

**Flow**:
1. Initialize Transformers.js model
2. Load Xenova/all-MiniLM-L6-v2
3. Generate embeddings for text
4. Return normalized vectors
5. Fallback to hash-based if model fails

**Model**: all-MiniLM-L6-v2 (384 dimensions)
**Fallback**: Hash-based pseudo-embeddings

## Data Flow

### Initial PDF Load
```
User opens PDF
    ↓
Background intercepts
    ↓
Redirect to viewer.html?file=...
    ↓
Viewer initializes
    ↓
PDF.js loads document
    ↓
Check IndexedDB for cached data
    ↓
If cached: Load from DB
If not: Process with AI
    ↓
Render first page (or last visited)
```

### AI Processing Pipeline
```
Extract text from all pages
    ↓
Send to Chunkr for segmentation
    ↓
Receive semantic chunks
    ↓
For each chunk:
    ↓
    Generate embedding with Transformers.js
    ↓
Store chunks + embeddings in IndexedDB
    ↓
Create chunk summaries
    ↓
Send to Gemini for TOC
    ↓
Receive TOC items
    ↓
Display in sidebar
```

### Page Navigation
```
User clicks navigation button
    ↓
Update current page number
    ↓
Call renderPage(newPage)
    ↓
Get page from PDF.js
    ↓
Create viewport with scale
    ↓
Render to canvas
    ↓
Save page number to IndexedDB
    ↓
Update UI indicators
```

## Performance Considerations

### Optimization Strategies

1. **Lazy Loading**
   - AI models loaded only when needed
   - Pages rendered on-demand
   - Chunks processed asynchronously

2. **Caching**
   - Processed chunks stored in IndexedDB
   - Avoids reprocessing same document
   - Quick retrieval on subsequent loads

3. **Web Workers**
   - PDF.js uses separate worker thread
   - Non-blocking PDF parsing
   - Prevents UI freezing

4. **Debouncing**
   - Page saves debounced to reduce DB writes
   - Prevents excessive IndexedDB operations

5. **Progressive Enhancement**
   - Basic features work without AI
   - Advanced features added when available
   - Graceful degradation

### Memory Management

- Canvas reused for rendering
- Old page data garbage collected
- Embeddings stored in DB, not RAM
- Model loaded once per session

## Security

### Data Privacy
- All processing local (except optional APIs)
- No telemetry or tracking
- API keys stored locally
- No data sent to third parties

### Permissions
- Minimal required permissions
- File access optional (user-enabled)
- Storage for preferences only
- No broad host permissions

### Content Security
- No eval() or inline scripts
- CSP-compliant code
- Sanitized HTML rendering
- XSS protection

## Extensibility

### Adding New Services
1. Create service file in `src/services/`
2. Implement service interface
3. Add fallback mechanism
4. Update settings page
5. Wire into viewer.ts

### Adding New Features
1. Update UI (HTML/CSS)
2. Add TypeScript logic
3. Update database schema if needed
4. Add tests
5. Update documentation

### Plugin Architecture (Future)
Could support plugins for:
- Custom annotation types
- Additional AI providers
- Export formats
- Collaboration features

## Technology Stack

### Core Technologies
- **TypeScript 5.4**: Type-safe development
- **Webpack 5**: Module bundling
- **Chrome Extension API**: Platform integration

### Libraries
- **PDF.js 4.3**: PDF rendering
- **Transformers.js 2.17**: ML models
- **IndexedDB**: Client-side storage

### External APIs (Optional)
- **Chunkr.ai**: Semantic chunking
- **Google Gemini**: Content analysis

## Build Process

### Development Build
```bash
npm run dev
```
- Watch mode enabled
- Source maps included
- Not minified
- Fast rebuilds

### Production Build
```bash
npm run build
```
- Optimized bundles
- Source maps excluded
- Minimized size
- Production ready

### Build Output
```
dist/
├── manifest.json          # Extension manifest
├── background.js          # Service worker
├── content.js             # Content script
├── viewer.js              # Main viewer (677KB)
├── viewer.html            # Viewer UI
├── viewer.css             # Viewer styles
├── settings.js            # Settings logic
├── settings.html          # Settings page
├── pdf.worker.mjs         # PDF.js worker (2.1MB)
├── 900.js                 # Vendors bundle (1.4MB)
├── 821.js                 # Async chunk
└── icons/                 # Extension icons
```

## Future Architecture Improvements

### Planned Enhancements
1. **Service Worker Optimization**
   - Better message passing
   - State management
   - Background sync

2. **Database Improvements**
   - Query optimization
   - Automatic cleanup
   - Migration system

3. **Modular Services**
   - Plugin system
   - Service marketplace
   - Custom integrations

4. **Performance**
   - Virtual scrolling for large PDFs
   - Incremental rendering
   - Better caching strategies

5. **Testing**
   - Unit test suite
   - Integration tests
   - E2E automation
   - Performance benchmarks

## Deployment

### Chrome Web Store
1. Build production version
2. Create store listing
3. Submit for review
4. Publish updates

### Self-Hosting
1. Build extension
2. Package as .crx or .zip
3. Distribute to users
4. Manual installation

## Monitoring

### Current Approach
- Browser console logging
- Error handling with try-catch
- User-reported issues

### Future Improvements
- Optional error reporting
- Performance metrics
- Usage analytics (opt-in)
- Health monitoring
