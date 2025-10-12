// Offscreen JS shim: re-export canonical implementation from utils but maintain
// an in-memory cache that the background/service-worker can push via
// SYNC_AI_SETTINGS. Some offscreen contexts don't have chrome.storage.local
// immediately available, so this cached path is used as the primary source
// when available.

import {
	getAISettings as _getAISettings,
	setAISettings as _setAISettings,
	onAISettingsChanged as _onAISettingsChanged,
} from '../utils/ai-settings';

let cachedSettings = null;

export function syncAISettings(settings) {
	try {
		console.log('[offscreen/ai-settings.js] syncAISettings called, hasSettings=', !!settings);
	} catch (e) {}
	cachedSettings = settings || null;
}

export async function getAISettings() {
	if (cachedSettings) return cachedSettings;
	return _getAISettings();
}

export async function setAISettings(settings) {
	try {
		const current = cachedSettings || (await _getAISettings());
		const merged = {
			...current,
			...settings,
			gemini: { ...(current && current.gemini ? current.gemini : {}), ...(settings && settings.gemini ? settings.gemini : {}) },
			apiKeys: { ...(current && current.apiKeys ? current.apiKeys : {}), ...(settings && settings.apiKeys ? settings.apiKeys : {}) },
		};
		cachedSettings = merged;
	} catch (e) {
		console.warn('[offscreen/ai-settings.js] Could not merge into cache before set:', e);
	}

	return _setAISettings(settings);
}

export function onAISettingsChanged(cb) {
	return _onAISettingsChanged(cb);
}

export default { getAISettings, setAISettings, onAISettingsChanged, syncAISettings };
