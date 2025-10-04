import { openDB, DBSchema, IDBPDatabase } from 'idb';

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
}

let dbInstance: IDBPDatabase<PDFViewerDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<PDFViewerDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<PDFViewerDB>('pdf_viewer_v0', 2, {
    upgrade(db, oldVersion) {
      // docs store
      if (!db.objectStoreNames.contains('docs')) {
        const docsStore = db.createObjectStore('docs', { keyPath: 'docHash' });
        docsStore.createIndex('by-updatedAt', 'updatedAt');
      }

      // pages store
      if (!db.objectStoreNames.contains('pages')) {
        const pagesStore = db.createObjectStore('pages', { keyPath: ['docHash', 'page'] });
        pagesStore.createIndex('by-docHash', 'docHash');
      }

      // chunks store (version 2)
      if (oldVersion < 2) {
        const chunksStore = db.createObjectStore('chunks', { keyPath: 'id' });
        chunksStore.createIndex('by-docHash', 'docHash');
        chunksStore.createIndex('by-docHash-index', ['docHash', 'chunkIndex']);
      }

      // chunk tasks store (version 2)
      if (oldVersion < 2) {
        const chunkTasksStore = db.createObjectStore('chunkTasks', { keyPath: 'taskId' });
        chunkTasksStore.createIndex('by-docHash', 'docHash');
        chunkTasksStore.createIndex('by-status', 'status');
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
