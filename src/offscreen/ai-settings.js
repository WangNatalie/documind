// ESM wrapper for ai-settings TypeScript helper to be usable in options page
export async function getAISettings() {
  try {
    const result = await chrome.storage.local.get(['aiSettings']);
    if (result && result.aiSettings) {
      const g = result.aiSettings.gemini || {};
      console.log('[AI Settings] getAISettings ->', result.aiSettings);
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

export async function setAISettings(settings) {
  try {
    const current = await getAISettings();
    const merged = Object.assign({}, current, settings);
    if (settings.gemini) {
      merged.gemini = Object.assign({}, current.gemini, settings.gemini);
    }
    console.log('[AI Settings] setAISettings -> saving merged:', merged);
    await chrome.storage.local.set({ aiSettings: merged });
  } catch (e) {
    console.error('[AI Settings] Error saving settings:', e);
  }
}

// Helper for UI: subscribe to storage changes for aiSettings
export function onAISettingsChanged(callback) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.aiSettings) {
      callback(changes.aiSettings.newValue);
    }
  });
}
