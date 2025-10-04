// IndexedDB Manager for storing embeddings and last page visited

export class IndexedDBManager {
  private db: IDBDatabase | null = null;
  private readonly DB_NAME = 'documind';
  private readonly DB_VERSION = 1;
  private readonly CHUNKS_STORE = 'chunks';
  private readonly PAGES_STORE = 'lastPages';

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

      request.onerror = () => {
        reject(new Error('Failed to open IndexedDB'));
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('IndexedDB initialized');
        resolve();
      };

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create chunks store
        if (!db.objectStoreNames.contains(this.CHUNKS_STORE)) {
          const chunksStore = db.createObjectStore(this.CHUNKS_STORE, { keyPath: 'pdfUrl' });
          chunksStore.createIndex('pdfUrl', 'pdfUrl', { unique: true });
        }

        // Create last pages store
        if (!db.objectStoreNames.contains(this.PAGES_STORE)) {
          const pagesStore = db.createObjectStore(this.PAGES_STORE, { keyPath: 'pdfUrl' });
          pagesStore.createIndex('pdfUrl', 'pdfUrl', { unique: true });
        }

        console.log('IndexedDB schema created');
      };
    });
  }

  async saveChunks(pdfUrl: string, chunks: any[]): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.CHUNKS_STORE], 'readwrite');
      const store = transaction.objectStore(this.CHUNKS_STORE);

      const data = {
        pdfUrl,
        chunks,
        timestamp: Date.now()
      };

      const request = store.put(data);

      request.onsuccess = () => {
        console.log('Chunks saved to IndexedDB');
        resolve();
      };

      request.onerror = () => {
        reject(new Error('Failed to save chunks'));
      };
    });
  }

  async getChunks(pdfUrl: string): Promise<any[] | null> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.CHUNKS_STORE], 'readonly');
      const store = transaction.objectStore(this.CHUNKS_STORE);
      const request = store.get(pdfUrl);

      request.onsuccess = () => {
        if (request.result) {
          resolve(request.result.chunks);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => {
        reject(new Error('Failed to get chunks'));
      };
    });
  }

  async saveLastPage(pdfUrl: string, pageNumber: number): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.PAGES_STORE], 'readwrite');
      const store = transaction.objectStore(this.PAGES_STORE);

      const data = {
        pdfUrl,
        pageNumber,
        timestamp: Date.now()
      };

      const request = store.put(data);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(new Error('Failed to save last page'));
      };
    });
  }

  async getLastPage(pdfUrl: string): Promise<number | null> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.PAGES_STORE], 'readonly');
      const store = transaction.objectStore(this.PAGES_STORE);
      const request = store.get(pdfUrl);

      request.onsuccess = () => {
        if (request.result) {
          resolve(request.result.pageNumber);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => {
        reject(new Error('Failed to get last page'));
      };
    });
  }

  async clearAll(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.CHUNKS_STORE, this.PAGES_STORE], 'readwrite');
      
      transaction.objectStore(this.CHUNKS_STORE).clear();
      transaction.objectStore(this.PAGES_STORE).clear();

      transaction.oncomplete = () => {
        console.log('All data cleared from IndexedDB');
        resolve();
      };

      transaction.onerror = () => {
        reject(new Error('Failed to clear data'));
      };
    });
  }
}
