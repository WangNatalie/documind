import { openDB } from 'idb';
import type { AISettings } from '../utils/ai-settings';

const DB_NAME = 'documind-worker-store';
const DB_VERSION = 1;
const STORE_NAME = 'settings';

async function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    },
  });
}

export async function getAISettingsFromStore(): Promise<AISettings | null> {
  try {
    const db = await getDB();
    const val = await db.get(STORE_NAME, 'aiSettings');
    return val || null;
  } catch (e) {
    console.error('[ai-store] Error reading aiSettings from IndexedDB:', e);
    return null;
  }
}

export async function setAISettingsInStore(settings: AISettings): Promise<void> {
  try {
    const db = await getDB();
    await db.put(STORE_NAME, settings, 'aiSettings');
    try {
      // Broadcast to any listeners that settings were updated
      await chrome.runtime.sendMessage({ type: 'AI_SETTINGS_UPDATED', payload: settings });
    } catch (e) {
      // Not critical if broadcast fails
      console.warn('[ai-store] Failed to broadcast AI_SETTINGS_UPDATED:', e);
    }
  } catch (e) {
    console.error('[ai-store] Error writing aiSettings to IndexedDB:', e);
    throw e;
  }
}

export async function clearAISettingsInStore(): Promise<void> {
  try {
    const db = await getDB();
    await db.delete(STORE_NAME, 'aiSettings');
  } catch (e) {
    console.error('[ai-store] Error clearing aiSettings in IndexedDB:', e);
  }
}

export default { getAISettingsFromStore, setAISettingsInStore, clearAISettingsInStore };
