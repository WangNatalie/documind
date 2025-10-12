// Offscreen shim that re-exports the canonical implementation from utils but
// also supports a runtime-synced in-memory cache. Background/service-worker
// will send a SYNC_AI_SETTINGS message to the offscreen document before
// delegating work so the offscreen context doesn't need to rely on
// chrome.storage.local being available in all executions.

import {
	getAISettings as _getAISettings,
	setAISettings as _setAISettings,
	onAISettingsChanged as _onAISettingsChanged,
} from '../utils/ai-settings';
import type { AISettings } from '../utils/ai-settings';

let cachedSettings: AISettings | null = null;

export function syncAISettings(settings: AISettings | null) {
	console.log('[offscreen/ai-settings] syncAISettings called, hasSettings=', !!settings);
	cachedSettings = settings || null;
}

export async function getAISettings(): Promise<AISettings> {
	if (cachedSettings) {
		// Return the cached copy if available (fast, avoids storage access in offscreen)
		return cachedSettings;
	}
	// Fall back to canonical implementation which reads from chrome.storage.local
	return _getAISettings();
}

export async function setAISettings(settings: Partial<AISettings>): Promise<void> {
	// Update cache optimistically (merge with existing values)
	try {
		const current = cachedSettings || (await _getAISettings());
		const merged = {
			...current,
			...settings,
			gemini: { ...current.gemini, ...(settings.gemini || {}) },
			apiKeys: { ...(current as any).apiKeys || {}, ...((settings as any).apiKeys || {}) },
		} as AISettings;
		cachedSettings = merged;
	} catch (e) {
		console.warn('[offscreen/ai-settings] Could not merge into cache before set:', e);
	}

	return _setAISettings(settings);
}

export function onAISettingsChanged(cb: (s: AISettings) => void) {
	return _onAISettingsChanged(cb);
}

export default { getAISettings, setAISettings, onAISettingsChanged, syncAISettings };
