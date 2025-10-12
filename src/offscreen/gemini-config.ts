// Helper to centrally locate the Gemini API key and provide utilities
// Async runtime getter that reads from chrome.storage.local.aiSettings.apiKeys.geminiApiKey if available
export async function getGeminiApiKeyRuntime(): Promise<string | undefined> {
  try {
    const result = await chrome.storage.local.get(["aiSettings"]);
    if (
      result &&
      result.aiSettings &&
      result.aiSettings.apiKeys &&
      result.aiSettings.apiKeys.geminiApiKey
    ) {
      return String(result.aiSettings.apiKeys.geminiApiKey);
    }
  } catch (e) {
    // ignore and fall back
    return undefined;
  }
}
