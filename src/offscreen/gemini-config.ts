import { GEMINI_API_KEY } from "./api_key";

// Helper to centrally locate the Gemini API key and provide utilities
export function getGeminiApiKey(): string | undefined {
  // Prefer common runtime locations for the key. Avoid using `import.meta` to keep this file simple.
  // 1. process.env.VITE_GEMINI_API_KEY (node / build-time env)
  // 2. globalThis.VITE_GEMINI_API_KEY or globalThis.GEMINI_API_KEY (runtime override)
  if (typeof process !== 'undefined' && process.env && process.env.VITE_GEMINI_API_KEY) {
    return String(process.env.VITE_GEMINI_API_KEY);
  }

  if (GEMINI_API_KEY) {
    return GEMINI_API_KEY;
  }

  try {
    const g1 = (globalThis as any)?.VITE_GEMINI_API_KEY;
    if (g1) return String(g1);
  } catch (e) {
    // ignore
  }

  try {
    const g2 = (globalThis as any)?.GEMINI_API_KEY;
    if (g2) return String(g2);
  } catch (e) {
    // ignore
  }

  return undefined;
}

export function hasGeminiApiKey(): boolean {
  return Boolean(getGeminiApiKey());
}
