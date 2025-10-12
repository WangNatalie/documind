// Central helper to read AI settings from chrome.storage.local
export interface GeminiSettings {
  chatEnabled: boolean;
  chunkingEnabled: boolean;
  embeddingsEnabled: boolean;
  termsEnabled: boolean;
  tocEnabled: boolean;
}

export interface AISettings {
  gemini: GeminiSettings;
  chunkrEnabled: boolean; // legacy chunkr pipeline
  elevenLabsEnabled: boolean;
}

const DEFAULT_SETTINGS: AISettings = {
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
      };
    }
  } catch (e) {
    console.error('[AI Settings] Error reading settings:', e);
  }
  return DEFAULT_SETTINGS;
}

export async function setAISettings(settings: Partial<AISettings>): Promise<void> {
  try {
    const current = await getAISettings();
    // Deep merge for gemini sub-object
    const merged = {
      ...current,
      ...settings,
      gemini: { ...current.gemini, ...(settings.gemini || {}) },
    } as AISettings;
    await chrome.storage.local.set({ aiSettings: merged });
  } catch (e) {
    console.error('[AI Settings] Error saving settings:', e);
  }
}
