# DocuMind — AI‑Powered PDF Viewer (Chrome MV3 Extension)

DocuMind is a Chrome Manifest V3 extension that replaces the browser's native PDF viewing experience with a modern, AI-augmented viewer. It focuses on fast virtualized rendering, persistent local storage for uploaded files, and several AI features (term extraction, section finding, summarization, RAG-based chat) that run via an offscreen document and background service worker.

This README was updated after inspecting the source to reflect the actual architecture and developer workflow.

## High-level overview

- Browser integration: a background service worker intercepts navigations to `.pdf` files and redirects the tab to `viewer.html?file=...`.
- Viewer (`src/viewer`) renders PDFs using PDF.js with virtualization (IntersectionObserver + scroll backup), zoom modes (fitWidth / fitPage / percentage), annotations, drawing, notes, and comments.
- Popup (`src/popup`) lets users upload local PDFs. Uploaded files are written into the Origin Private File System (OPFS) and referenced by an `uploadId`.
- Storage: persistent data (docs, pages, chunks, embeddings, notes, comments, drawings, TOC) are stored in IndexedDB (database `pdf_viewer_v0`) via `src/db/index.ts` (uses `idb`).
- Background tasks: chunking, embedding generation, and TOC generation are scheduled and managed by the service worker (`src/background/index.ts`). Heavy text processing and AI calls run inside an Offscreen Document (`offscreen.html` / `src/offscreen`) so they can use DOM / IndexedDB and keep running outside visible tabs.
- AI: term extraction, section matching, and summarization are driven by the offscreen code (term-extractor, chunker-offscreen, embedder). The chatbot uses a RAG flow that finds similar chunks (embeddings) and calls Gemini (Google GenAI) or other models.

## Main features

- Automatic web PDF interception and redirect to the custom viewer.
- Local PDF upload via popup — files are saved to OPFS and opened in viewer.
- Fast virtualized rendering with canvas caching and a render queue.
- Persistent document state: last page and zoom saved per document in IndexedDB.
- Annotations: highlights/notes, comments, and ink drawings (stored and exported).
- AI features:
  - Term extraction and per-page summaries (sent to viewer)
  - Find sections for terms and link them to TOC
  - Summarize selected text (EXPLAIN_SELECTION)
  - RAG-based chat using chunk embeddings + Gemini (background/chatbot)
- Export: merge annotations into a downloadable PDF (`src/export/annotationsToPdf.ts`).

## What the code maps to (key files/folders)

- manifest.json — extension manifest (MV3). Background service worker: `src/background/index.ts`.
- `popup/` (popup UI)
  - `src/popup/App.tsx` — drag/drop upload flow, writes OPFS and creates DB doc records.
- `viewer/` (main viewer UI)
  - `src/viewer/App.tsx` — main viewer controller (load PDF, manage pages, toolbar, TOC, notes, comments, drawings, AI workflows)
  - `src/viewer/Page.tsx`, `Toolbar.tsx`, `TOC.tsx`, etc. — UI components
- `src/db/` — IndexedDB schema and helpers (docs, pages, chunks, chunkEmbeddings, notes, comments, tableOfContents, drawings). Database name: `pdf_viewer_v0` (versioned migrations).
- `src/offscreen/` — offscreen document logic for chunking, embeddings, TOC generation, term extraction, summarization and long-running AI tasks. Offscreen entry: `offscreen.html`.
- `src/utils/` — client helpers for communicating with background/offscreen, chunking and chatbot clients, narrator (ElevenLabs wrapper), hash utilities, OPFS helpers.
- `src/export/annotationsToPdf.ts` — merges notes, comments and drawings into a PDF using pdf-lib.

## Data flow (common flows)

- Web PDF open: background service worker detects navigation to *.pdf -> updates tab to `viewer.html?file=<url>` -> viewer loads PDF via PDF.js -> viewer computes docHash -> viewer writes/reads doc record in IndexedDB -> background/offscreen tasks are queued (chunking, embeddings, TOC) if needed.
- Local upload: popup reads File -> writes ArrayBuffer to OPFS with `uploadId` -> computes content-only docHash -> writes doc record in IndexedDB and opens viewer with `viewer.html?uploadId=<id>&name=<file>`.
- Term extraction & summarization: viewer periodically sends visible text to background via messages -> background ensures offscreen document exists and forwards requests -> offscreen extracts terms, finds sections, summarizes and writes results to DB -> background sends TERM_SUMMARIES_READY to viewer to display.
- Chat / RAG: viewer or popup calls `src/utils/chatbot-client.ts` which messages background `CHAT_QUERY` -> background ensures offscreen exists and calls chatbot generator (finds similar chunks via embeddings, calls Gemini) -> returns result.

## IndexedDB schema (summary)

Database: `pdf_viewer_v0` (see `src/db/index.ts`)

- docs (key: docHash) — metadata and last state
- pages (key: [docHash, page]) — extracted text/headings
- chunks (key: id) — document chunks (content + page mapping)
- chunkTasks (key: taskId) — background chunking jobs
- notes (key: id) — highlights/notes with normalized rects
- comments (key: id) — anchored comments
- chunkEmbeddings (key: id) — vector embeddings for chunks
- tableOfContents (key: docHash) — TOC items (pdf-outline or AI-generated)
- drawings (key: id) — ink strokes per page

This repository includes migrations and helper functions to manage those stores.

## API keys & configuration

- Gemini (Google GenAI) keys are used for embeddings, summaries and chatbot. See `src/offscreen/gemini-config.ts` and `src/offscreen` for where keys are read.
- ElevenLabs key is used for text-to-speech (narration). The narrator utility (`src/utils/narrator-client.ts`) imports the ElevenLabs key from `src/offscreen/api_key.ts` (or similar internal file).

Important: API key files are not checked into the repo. Inspect `src/offscreen` for placeholder files and add keys there or use environment variables during your build as appropriate.

## Permissions (manifest highlights)

- storage, unlimitedStorage, tabs, webNavigation, offscreen, alarms
- host_permissions: `*://*/*` (used to open any remote PDF)

## Development — quick start

1. Install dependencies:

```bash
npm install
```

2. Run in dev (Vite):

```bash
npm run dev
```

This starts a dev server used by the extension build tooling (CRX plugin). When building for Chrome you will use `npm run build` to emit a `dist` folder that you can load as an unpacked extension.

3. Build for production:

```bash
npm run build
```

4. Create a packaged ZIP for distribution:

```bash
npm run pack
```

Loading into Chrome (unpacked):

1. chrome://extensions -> Enable Developer mode -> Load unpacked -> select `dist/` folder

## Debugging tips

- Viewer runtime: open the viewer tab -> DevTools (F12) -> Console/Network to trace PDF loading or messages.
- Background service worker logs: open the Extensions page -> Service worker (Inspect views) to view console output.
- Offscreen document: offscreen runs as a separate context; use console logs and background to trace messages between service worker and offscreen.
- Inspect IndexedDB: Application -> IndexedDB -> `pdf_viewer_v0` to view docs, chunks, notes, embeddings.
- OPFS: Application -> Storage -> Origin Private File System to inspect uploaded blobs.

## How to trigger AI tasks manually (developer)

- Request chunking for a doc (viewer calls `requestGeminiChunking` or `requestChunkrChunking`): viewer sends message to background which enqueues chunking and offscreen processes it.
- Generate missing embeddings: background/offscreen embedder uses the configured Gemini embedding model — the viewer or background triggers `GENERATE_EMBEDDINGS` messages.
- Generate/verify TOC: `CREATE_TOC_TASK` -> background -> offscreen TOC generator.

## Export & printing

- `src/export/annotationsToPdf.ts` combines the original PDF bytes with notes, comments and drawings. It writes both flattened visual highlights and native PDF annotations (Highlight, Text (sticky), Ink) so exported PDFs retain markup in many viewers.

## File map (quick)

- `manifest.json` — extension config & permissions
- `popup.html`, `popup` folder — upload UI
- `viewer.html`, `src/viewer` — PDF viewer app and components
- `src/background/*` — service worker logic, message handlers, task scheduling
- `offscreen.html`, `src/offscreen/*` — offscreen document, chunking, embedder, term extractor, TOC generator
- `src/db` — IndexedDB schema and helpers (idb wrapper)
- `src/utils` — helpers (chatbot-client, chunker-client, narrator, hash, opfs helpers)
- `src/export` — export/merge annotations into a PDF

## Troubleshooting & common issues

- "Extension won't load": ensure you built (`npm run build`) and loaded the `dist/` folder, check `dist/manifest.json`.
- "PDFs still open in Chrome": confirm extension is enabled and the webNavigation redirect worked (inspect background logs for redirect attempts).
- "CORS / PDF loading error": remote PDFs may require CORS—viewer falls back to a CORS error UI. For local testing, host the PDF with permissive CORS or use an OPFS upload.
- "Offscreen/AI tasks not running": confirm API keys are configured, and check background and offscreen logs for errors. Offscreen creation may fail if the browser blocks offscreen creation without justification.
