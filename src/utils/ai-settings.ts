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
  try {
    const result = await chrome.storage.local.get(['aiSettings']);
    if (result && result.aiSettings) {
      const g = result.aiSettings.gemini || {};
      return {
        gemini: {
          chatEnabled: !!g.chatEnabled,
          chunkingEnabled: !!g.chunkingEnabled,
          embeddingsEnabled: !!g.embeddingsEnabled,
          termsEnabled: !!g.termsEnabled,
          tocEnabled: !!g.tocEnabled,
        },
        chunkrEnabled: !!result.aiSettings.chunkrEnabled,
        elevenLabsEnabled: !!result.aiSettings.elevenLabsEnabled,
        apiKeys: {
          geminiApiKey: result.aiSettings.apiKeys?.geminiApiKey || '',
          chunkrApiKey: result.aiSettings.apiKeys?.chunkrApiKey || '',
          elevenLabsApiKey: result.aiSettings.apiKeys?.elevenLabsApiKey || '',
        },
      };
    }
  } catch (e) {
    console.error('[AI Settings] Error reading settings:', e);
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

export async function setAISettings(settings: Partial<AISettings>): Promise<void> {
  try {
    const current = await getAISettings();
    const merged = {
      ...current,
      ...settings,
      gemini: { ...current.gemini, ...(settings.gemini || {}) },
      apiKeys: { ...((current as any).apiKeys || {}), ...((settings as any).apiKeys || {}) },
    } as AISettings;
    await chrome.storage.local.set({ aiSettings: merged });
  } catch (e) {
    console.error('[AI Settings] Error saving settings:', e);
  }
}

export function onAISettingsChanged(callback: (settings: AISettings) => void) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.aiSettings) {
      // Normalize value into AISettings shape
      getAISettings().then((s) => callback(s));
    }
  });
}

export default { getAISettings, setAISettings, onAISettingsChanged };
