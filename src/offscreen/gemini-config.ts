// Helper to centrally locate the Gemini API key and provide utilities
// Async runtime getter that reads from chrome.storage.local.aiSettings.apiKeys.geminiApiKey if available
export async function getGeminiApiKeyRuntime(): Promise<string | undefined> {
  // Prefer asking the background/service worker for settings (worker owns keys)
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'GET_AI_SETTINGS' });
    if (resp && resp.success && resp.settings && resp.settings.apiKeys) {
      return String(resp.settings.apiKeys.geminiApiKey || '');
    }
  } catch (e) {
    console.warn('[gemini-config] GET_AI_SETTINGS message failed, falling back to storage:', e);
  }

  // Fallback to storage (legacy)
  try {
    const result = await chrome.storage.local.get(["aiSettings"]);
    console.log('[gemini-config] chrome.storage.local.aiSettings (runtime fallback):', result.aiSettings);
    if (
      result &&
      result.aiSettings &&
      result.aiSettings.apiKeys &&
      result.aiSettings.apiKeys.geminiApiKey
    ) {
      return String(result.aiSettings.apiKeys.geminiApiKey);
    }
  } catch (e) {
    console.warn('[gemini-config] Error reading aiSettings from storage fallback:', e);
  }

  return undefined;
}
