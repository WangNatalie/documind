// OPFS (Origin Private File System) helpers for storing local PDFs

const PDF_DIR = 'pdf';

async function getOPFSRoot(): Promise<FileSystemDirectoryHandle> {
  return navigator.storage.getDirectory();
}

async function ensurePdfDir(): Promise<FileSystemDirectoryHandle> {
  const root = await getOPFSRoot();
  return root.getDirectoryHandle(PDF_DIR, { create: true });
}

export async function writeOPFSFile(uploadId: string, arrayBuffer: ArrayBuffer): Promise<void> {
  try {
    const pdfDir = await ensurePdfDir();
    const fileHandle = await pdfDir.getFileHandle(`${uploadId}.pdf`, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(arrayBuffer);
    await writable.close();
  } catch (error) {
    console.error('Failed to write OPFS file:', error);
    throw new Error('Failed to save PDF to local storage');
  }
}

export async function readOPFSFile(uploadId: string): Promise<ArrayBuffer> {
  try {
    const pdfDir = await ensurePdfDir();
    const fileHandle = await pdfDir.getFileHandle(`${uploadId}.pdf`);
    const file = await fileHandle.getFile();
    return file.arrayBuffer();
  } catch (error) {
    console.error('Failed to read OPFS file:', error);
    throw new Error('Failed to read PDF from local storage');
  }
}

export async function removeOPFSFile(uploadId: string): Promise<void> {
  try {
    const pdfDir = await ensurePdfDir();
    await pdfDir.removeEntry(`${uploadId}.pdf`);
  } catch (error) {
    console.error('Failed to remove OPFS file:', error);
    // Don't throw - file may not exist
  }
}

export async function requestPersistentStorage(): Promise<boolean> {
  if (navigator.storage && navigator.storage.persist) {
    const isPersisted = await navigator.storage.persist();
    console.log('Storage persisted:', isPersisted);
    return isPersisted;
  }
  return false;
}

export async function checkStorageQuota(): Promise<{ usage: number; quota: number; percent: number }> {
  if (navigator.storage && navigator.storage.estimate) {
    const estimate = await navigator.storage.estimate();
    const usage = estimate.usage || 0;
    const quota = estimate.quota || 0;
    return {
      usage,
      quota,
      percent: quota > 0 ? (usage / quota) * 100 : 0,
    };
  }
  return { usage: 0, quota: 0, percent: 0 };
}
