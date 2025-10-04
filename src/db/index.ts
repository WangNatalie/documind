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
  highlights: {
    key: string;
    value: HighlightRecord;
    indexes: { 'by-docHash': string };
  };
}

let dbInstance: IDBPDatabase<PDFViewerDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<PDFViewerDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<PDFViewerDB>('pdf_viewer_v0', 2, {
    upgrade(db, oldVersion) {
      // Version 1 -> create docs and pages stores
      if (oldVersion < 1) {
        const docsStore = db.createObjectStore('docs', { keyPath: 'docHash' });
        docsStore.createIndex('by-updatedAt', 'updatedAt');

        const pagesStore = db.createObjectStore('pages', { keyPath: ['docHash', 'page'] });
        pagesStore.createIndex('by-docHash', 'docHash');
      }

      // Version 2 -> add highlights store if missing
      if (oldVersion < 2) {
        if (!db.objectStoreNames.contains('highlights')) {
          const highlightsStore = db.createObjectStore('highlights', { keyPath: 'id' });
          highlightsStore.createIndex('by-docHash', 'docHash');
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

// Highlight operations
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
  rects: HighlightRect[]; // relative to page element (CSS px)
  color: string; // color id e.g., 'yellow'
  text?: string;
  createdAt: number;
}

export async function putHighlight(h: HighlightRecord): Promise<void> {
  const db = await getDB();
  await db.put('highlights', h);
}

export async function getHighlightsByDoc(docHash: string): Promise<HighlightRecord[]> {
  const db = await getDB();
  return db.getAllFromIndex('highlights', 'by-docHash', docHash);
}

export async function deleteHighlight(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('highlights', id);
}
