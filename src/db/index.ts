import { openDB, DBSchema, IDBPDatabase } from 'idb';

// Database version history:
// v1: Initial - docs, pages
// v2: Added chunks, chunkTasks
// v3: Added highlights
// v4: Added notes (with rects array)
// v5: Added comments object store
// v6: Added chunkEmbeddings
// v7: Added tableOfContents
const DB_VERSION = 7;

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

export interface NoteRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface NoteRecord {
  id: string;
  docHash: string;
  page: number;
  rects: NoteRect[];
  color: string;
  text?: string; // Optional text for this note
  createdAt: number;
}

export interface CommentRecord {
  id: string;
  docHash: string;
  page: number;
  rects: NoteRect[];
  text: string;
  createdAt: number;
}

export interface ChunkEmbeddingRecord {
  id: string; // Same as chunkId for easy lookup
  chunkId: string;
  docHash: string;
  embedding: number[]; // Vector representation
  model: string; // e.g., "text-embedding-3-small", "text-embedding-ada-002"
  dimensions: number; // e.g., 1536, 3072
  source: 'content' | 'description'; // What was embedded
  createdAt: number;
}

export interface TOCItem {
  title: string;
  page: number;
  chunkId?: string; // Optional link to chunk
  bbox?: { x: number; y: number; width: number; height: number }; // Optional bounding box
  level?: number; // Hierarchy level (0 = top level)
}

export interface TableOfContentsRecord {
  docHash: string;
  items: TOCItem[];
  source: 'pdf-outline' | 'ai-generated'; // How it was created
  model?: string; // If AI-generated, which model
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
  notes: {
    key: string;
    value: NoteRecord;
    indexes: { 'by-docHash': string; 'by-page': [string, number] };
  };
  comments: {
    key: string;
    value: CommentRecord;
    indexes: { 'by-docHash': string; 'by-page': [string, number] };
  };
  chunkEmbeddings: {
    key: string;
    value: ChunkEmbeddingRecord;
    indexes: { 'by-docHash': string; 'by-chunkId': string };
  };
  tableOfContents: {
    key: string;
    value: TableOfContentsRecord;
    indexes: { 'by-docHash': string };
  };
}

let dbInstance: IDBPDatabase<PDFViewerDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<PDFViewerDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<PDFViewerDB>('pdf_viewer_v0', DB_VERSION, {
    async upgrade(db, oldVersion, newVersion) {
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

      // Version 3: Add notes
      if (oldVersion < 3) {
        if (!db.objectStoreNames.contains('notes')) {
          const notesStore = db.createObjectStore('notes', { keyPath: 'id' });
          notesStore.createIndex('by-docHash', 'docHash');
          notesStore.createIndex('by-page', ['docHash', 'page']);
          console.log('[DB] Created notes store');
        }
      }

      // Version 4: Rename highlights to notes (migration handled in version 3)
      if (oldVersion < 4) {
        // This version was for notes migration, now handled in v3
      }

      // Version 5: Add comments store
      if (oldVersion < 5) {
        if (!db.objectStoreNames.contains('comments')) {
          const commentsStore = db.createObjectStore('comments', { keyPath: 'id' });
          commentsStore.createIndex('by-docHash', 'docHash');
          commentsStore.createIndex('by-page', ['docHash', 'page']);
          console.log('[DB] Created comments store');
        }
      }


      // Version 6: Add chunk embeddings
      if (oldVersion < 6) {
        if (!db.objectStoreNames.contains('chunkEmbeddings')) {
          const embeddingsStore = db.createObjectStore('chunkEmbeddings', { keyPath: 'id' });
          embeddingsStore.createIndex('by-docHash', 'docHash');
          embeddingsStore.createIndex('by-chunkId', 'chunkId');
          console.log('[DB] Created chunkEmbeddings store');
        }
      }

      // Version 7: Add table of contents
      if (oldVersion < 7) {
        if (!db.objectStoreNames.contains('tableOfContents')) {
          const tocStore = db.createObjectStore('tableOfContents', { keyPath: 'docHash' });
          tocStore.createIndex('by-docHash', 'docHash');
          console.log('[DB] Created tableOfContents store');
        }
      }
    },
  });

  return dbInstance;
}

// Reset DB connection (useful after migrations or errors)
export function resetDB(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    console.log('[DB] Database connection reset');
  }
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

// Chunk Embedding operations
export async function putChunkEmbedding(embedding: ChunkEmbeddingRecord): Promise<void> {
  const db = await getDB();
  await db.put('chunkEmbeddings', embedding);
}

export async function getChunkEmbedding(chunkId: string): Promise<ChunkEmbeddingRecord | undefined> {
  const db = await getDB();
  return db.get('chunkEmbeddings', chunkId);
}

export async function getChunkEmbeddingsByDoc(docHash: string): Promise<ChunkEmbeddingRecord[]> {
  const db = await getDB();
  return db.getAllFromIndex('chunkEmbeddings', 'by-docHash', docHash);
}

export async function deleteChunkEmbedding(chunkId: string): Promise<void> {
  const db = await getDB();
  await db.delete('chunkEmbeddings', chunkId);
}

export async function deleteChunkEmbeddingsByDoc(docHash: string): Promise<void> {
  const db = await getDB();
  const embeddings = await getChunkEmbeddingsByDoc(docHash);
  const tx = db.transaction('chunkEmbeddings', 'readwrite');
  await Promise.all(embeddings.map(e => tx.store.delete(e.id)));
  await tx.done;
}

/**
 * Check which chunks are missing embeddings
 * Returns array of chunk IDs that need embeddings
 */
export async function getMissingEmbeddings(docHash: string): Promise<string[]> {
  const chunks = await getChunksByDoc(docHash);
  const embeddings = await getChunkEmbeddingsByDoc(docHash);
  
  const embeddedChunkIds = new Set(embeddings.map(e => e.chunkId));
  const missingChunkIds = chunks
    .filter(chunk => !embeddedChunkIds.has(chunk.id))
    .map(chunk => chunk.id);
  
  return missingChunkIds;
}

// Comment operations
export async function putComment(comment: CommentRecord): Promise<void> {
  const db = await getDB();
  await db.put('comments', comment);
}

export async function getComment(id: string): Promise<CommentRecord | undefined> {
  const db = await getDB();
  return db.get('comments', id);
}

export async function getCommentsByDoc(docHash: string): Promise<CommentRecord[]> {
  const db = await getDB();
  return db.getAllFromIndex('comments', 'by-docHash', docHash);
}

export async function deleteComment(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('comments', id);
}

export async function deleteCommentsByDoc(docHash: string): Promise<void> {
  const db = await getDB();
  const comments = await getCommentsByDoc(docHash);
  const tx = db.transaction('comments', 'readwrite');
  await Promise.all(comments.map(c => tx.store.delete(c.id)));
  await tx.done;
}

// Table of Contents operations
export async function putTableOfContents(toc: TableOfContentsRecord): Promise<void> {
  const db = await getDB();
  await db.put('tableOfContents', toc);
}

export async function getTableOfContents(docHash: string): Promise<TableOfContentsRecord | undefined> {
  const db = await getDB();
  return db.get('tableOfContents', docHash);
}

export async function deleteTableOfContents(docHash: string): Promise<void> {
  const db = await getDB();
  await db.delete('tableOfContents', docHash);
}
