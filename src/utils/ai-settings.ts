// Frontend helper to read AI settings and subscribe to changes
export interface GeminiSettings {
  chatEnabled: boolean;
  chunkingEnabled: boolean;
  embeddingsEnabled: boolean;
  termsEnabled: boolean;
  tocEnabled: boolean;
}

export interface AISettings {
  gemini: GeminiSettings;
  chunkrEnabled: boolean;
  elevenLabsEnabled: boolean;
  apiKeys?: {
    geminiApiKey?: string;
    chunkrApiKey?: string;
    elevenLabsApiKey?: string;
  };
}

export async function getAISettings(): Promise<AISettings> {
  console.log("[AI Settings] getAISettings called");
  // The background worker is authoritative for AI settings. Ask it via
  // messaging; if that fails or returns no settings, return a safe default.
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'GET_AI_SETTINGS' });
    if (resp && resp.success && resp.settings) {
      return resp.settings as AISettings;
    }
    console.warn('[AI Settings] GET_AI_SETTINGS returned no settings, returning defaults');
  } catch (e) {
    console.warn('[AI Settings] GET_AI_SETTINGS messaging failed, returning defaults', e);
  }
  return {
    gemini: {
      chatEnabled: true,
      chunkingEnabled: true,
      embeddingsEnabled: true,
      termsEnabled: true,
      tocEnabled: true,
    },
    chunkrEnabled: true,
    elevenLabsEnabled: true,
  };
}

export async function setAISettings(
  settings: Partial<AISettings>
): Promise<void> {
  // Build merged settings and send to worker which is authoritative
  const current = await getAISettings();
  const merged = {
    ...current,
    ...settings,
    gemini: { ...current.gemini, ...(settings.gemini || {}) },
    apiKeys: {
      ...((current as any).apiKeys || {}),
      ...((settings as any).apiKeys || {}),
    },
  } as AISettings;

  const resp = await chrome.runtime.sendMessage({ type: 'SET_AI_SETTINGS', payload: merged });
  if (!resp || !resp.success) {
    throw new Error(resp?.error || 'SET_AI_SETTINGS failed');
  }
}

export function onAISettingsChanged(callback: (settings: AISettings) => void) {
  // Listen for storage changes (fallback) and also for an explicit worker
  // broadcast via runtime messages (background can broadcast after SET).
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.aiSettings) {
      getAISettings().then((s) => callback(s));
    }
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message && message.type === 'AI_SETTINGS_UPDATED') {
      getAISettings().then((s) => callback(s));
    }
  });
}

export default { getAISettings, setAISettings, onAISettingsChanged };
