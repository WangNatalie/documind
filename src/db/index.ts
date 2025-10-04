import { openDB, DBSchema, IDBPDatabase } from 'idb';

// Database version history:
// v1: Initial - docs, pages
// v2: Added chunks, chunkTasks
// v3: Added highlights
// v4: Added notes (with rects array)
const DB_VERSION = 4;

export interface DocRecord {
  docHash: string;
  source: { type: 'url' | 'uploadId'; value: string };
  name: string;
  pageCount: number;
  lastPage: number;
  lastZoom: string; // e.g., "fitWidth", "fitPage", "150"
  createdAt: number;
  updatedAt: number;
}

export interface PageRecord {
  docHash: string;
  page: number;
  text?: string;
  headings?: string[];
  readyAt?: number;
}

export interface ChunkRecord {
  id: string; // Unique chunk ID
  docHash: string;
  chunkIndex: number;
  content: string;
  description?: string; // Optional AI-generated description (if available)
  page?: number;
  bbox?: { x: number; y: number; width: number; height: number };
  metadata?: Record<string, any>;
  createdAt: number;
}

export interface ChunkTaskRecord {
  taskId: string;
  docHash: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  fileUrl?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface HighlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface HighlightRecord {
  id: string;
  docHash: string;
  page: number;
  rects: HighlightRect[];
  color: string;
  createdAt: number;
}

export interface NoteRecord {
  id: string;
  docHash: string;
  page: number;
  rects: HighlightRect[];
  text: string;
  createdAt: number;
}

interface PDFViewerDB extends DBSchema {
  docs: {
    key: string;
    value: DocRecord;
    indexes: { 'by-updatedAt': number };
  };
  pages: {
    key: [string, number];
    value: PageRecord;
    indexes: { 'by-docHash': string };
  };
  chunks: {
    key: string;
    value: ChunkRecord;
    indexes: { 'by-docHash': string; 'by-docHash-index': [string, number] };
  };
  chunkTasks: {
    key: string;
    value: ChunkTaskRecord;
    indexes: { 'by-docHash': string; 'by-status': string };
  };
  highlights: {
    key: string;
    value: HighlightRecord;
    indexes: { 'by-docHash': string; 'by-page': [string, number] };
  };
  notes: {
    key: string;
    value: NoteRecord;
    indexes: { 'by-docHash': string; 'by-page': [string, number] };
  };
}

let dbInstance: IDBPDatabase<PDFViewerDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<PDFViewerDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<PDFViewerDB>('pdf_viewer_v0', DB_VERSION, {
    async upgrade(db, oldVersion, newVersion, transaction) {
      console.log(`[DB] Upgrading from v${oldVersion} to v${newVersion}`);

      // Version 1: Initial setup - docs and pages stores
      if (oldVersion < 1) {
        if (!db.objectStoreNames.contains('docs')) {
          const docsStore = db.createObjectStore('docs', { keyPath: 'docHash' });
          docsStore.createIndex('by-updatedAt', 'updatedAt');
          console.log('[DB] Created docs store');
        }

        if (!db.objectStoreNames.contains('pages')) {
          const pagesStore = db.createObjectStore('pages', { keyPath: ['docHash', 'page'] });
          pagesStore.createIndex('by-docHash', 'docHash');
          console.log('[DB] Created pages store');
        }
      }

      // Version 2: Add chunks and chunk tasks
      if (oldVersion < 2) {
        if (!db.objectStoreNames.contains('chunks')) {
          const chunksStore = db.createObjectStore('chunks', { keyPath: 'id' });
          chunksStore.createIndex('by-docHash', 'docHash');
          chunksStore.createIndex('by-docHash-index', ['docHash', 'chunkIndex']);
          console.log('[DB] Created chunks store');
        }

        if (!db.objectStoreNames.contains('chunkTasks')) {
          const chunkTasksStore = db.createObjectStore('chunkTasks', { keyPath: 'taskId' });
          chunkTasksStore.createIndex('by-docHash', 'docHash');
          chunkTasksStore.createIndex('by-status', 'status');
          console.log('[DB] Created chunkTasks store');
        }
      }

      // Version 3: Add highlights
      if (oldVersion < 3) {
        if (!db.objectStoreNames.contains('highlights')) {
          const highlightsStore = db.createObjectStore('highlights', { keyPath: 'id' });
          highlightsStore.createIndex('by-docHash', 'docHash');
          highlightsStore.createIndex('by-page', ['docHash', 'page']);
          console.log('[DB] Created highlights store');
        }
      }

      // Version 4: Add notes (with migration for any existing notes from rect -> rects)
      if (oldVersion < 4) {
        if (!db.objectStoreNames.contains('notes')) {
          const notesStore = db.createObjectStore('notes', { keyPath: 'id' });
          notesStore.createIndex('by-docHash', 'docHash');
          notesStore.createIndex('by-page', ['docHash', 'page']);
          console.log('[DB] Created notes store');
        } else {
          // Migrate existing notes from rect to rects array
          const notesStore = transaction.objectStore('notes');
          const allNotes = await notesStore.getAll();

          console.log(`[DB] Migrating ${allNotes.length} notes from rect to rects[]`);

          for (const note of allNotes) {
            const noteAny = note as any;
            if (noteAny.rect && !noteAny.rects) {
              console.log(`[DB] Migrating note ${noteAny.id}`);
              noteAny.rects = [noteAny.rect];
              delete noteAny.rect;
              await notesStore.put(noteAny);
            }
          }

          console.log('[DB] Finished migrating notes');
        }
      }
    },
  });

  return dbInstance;
}

// Doc operations
export async function getDoc(docHash: string): Promise<DocRecord | undefined> {
  const db = await getDB();
  return db.get('docs', docHash);
}

export async function putDoc(doc: DocRecord): Promise<void> {
  const db = await getDB();
  await db.put('docs', doc);
}

export async function updateDocState(docHash: string, updates: Partial<Pick<DocRecord, 'lastPage' | 'lastZoom'>>): Promise<void> {
  const db = await getDB();
  const doc = await db.get('docs', docHash);
  if (doc) {
    await db.put('docs', { ...doc, ...updates, updatedAt: Date.now() });
  }
}

export async function getAllDocs(): Promise<DocRecord[]> {
  const db = await getDB();
  return db.getAllFromIndex('docs', 'by-updatedAt');
}

// Page operations
export async function getPage(docHash: string, page: number): Promise<PageRecord | undefined> {
  const db = await getDB();
  return db.get('pages', [docHash, page]);
}

export async function putPage(pageData: PageRecord): Promise<void> {
  const db = await getDB();
  await db.put('pages', pageData);
}

export async function getPagesByDoc(docHash: string): Promise<PageRecord[]> {
  const db = await getDB();
  return db.getAllFromIndex('pages', 'by-docHash', docHash);
}

// Chunk operations
export async function putChunk(chunk: ChunkRecord): Promise<void> {
  const db = await getDB();
  await db.put('chunks', chunk);
}

export async function getChunk(id: string): Promise<ChunkRecord | undefined> {
  const db = await getDB();
  return db.get('chunks', id);
}

export async function getChunksByDoc(docHash: string): Promise<ChunkRecord[]> {
  const db = await getDB();
  return db.getAllFromIndex('chunks', 'by-docHash', docHash);
}

export async function deleteChunksByDoc(docHash: string): Promise<void> {
  const db = await getDB();
  const chunks = await getChunksByDoc(docHash);
  const tx = db.transaction('chunks', 'readwrite');
  await Promise.all(chunks.map(chunk => tx.store.delete(chunk.id)));
  await tx.done;
}

// Chunk task operations
export async function putChunkTask(task: ChunkTaskRecord): Promise<void> {
  const db = await getDB();
  await db.put('chunkTasks', task);
}

export async function getChunkTask(taskId: string): Promise<ChunkTaskRecord | undefined> {
  const db = await getDB();
  return db.get('chunkTasks', taskId);
}

export async function getChunkTaskByDoc(docHash: string): Promise<ChunkTaskRecord | undefined> {
  const db = await getDB();
  const tasks = await db.getAllFromIndex('chunkTasks', 'by-docHash', docHash);
  return tasks[0];
}

export async function updateChunkTask(taskId: string, updates: Partial<ChunkTaskRecord>): Promise<void> {
  const db = await getDB();
  const task = await db.get('chunkTasks', taskId);
  if (task) {
    await db.put('chunkTasks', { ...task, ...updates, updatedAt: Date.now() });
  }
}

export async function getPendingChunkTasks(): Promise<ChunkTaskRecord[]> {
  const db = await getDB();
  return db.getAllFromIndex('chunkTasks', 'by-status', 'pending');
}

// Highlight operations
export async function putHighlight(highlight: HighlightRecord): Promise<void> {
  const db = await getDB();
  await db.put('highlights', highlight);
}

export async function getHighlight(id: string): Promise<HighlightRecord | undefined> {
  const db = await getDB();
  return db.get('highlights', id);
}

export async function getHighlightsByDoc(docHash: string): Promise<HighlightRecord[]> {
  const db = await getDB();
  return db.getAllFromIndex('highlights', 'by-docHash', docHash);
}

export async function deleteHighlight(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('highlights', id);
}

export async function deleteHighlightsByDoc(docHash: string): Promise<void> {
  const db = await getDB();
  const highlights = await getHighlightsByDoc(docHash);
  const tx = db.transaction('highlights', 'readwrite');
  await Promise.all(highlights.map(h => tx.store.delete(h.id)));
  await tx.done;
}

// Note operations
export async function putNote(note: NoteRecord): Promise<void> {
  const db = await getDB();
  await db.put('notes', note);
}

export async function getNote(id: string): Promise<NoteRecord | undefined> {
  const db = await getDB();
  return db.get('notes', id);
}

export async function getNotesByDoc(docHash: string): Promise<NoteRecord[]> {
  const db = await getDB();
  return db.getAllFromIndex('notes', 'by-docHash', docHash);
}

export async function deleteNote(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('notes', id);
}

export async function deleteNotesByDoc(docHash: string): Promise<void> {
  const db = await getDB();
  const notes = await getNotesByDoc(docHash);
  const tx = db.transaction('notes', 'readwrite');
  await Promise.all(notes.map(n => tx.store.delete(n.id)));
  await tx.done;
}
