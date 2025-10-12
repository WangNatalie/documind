import React, { useEffect, useState } from 'react';
import { getAISettings, setAISettings, onAISettingsChanged } from '../utils/ai-settings';

export const OptionsApp: React.FC = () => {
  const [settings, setSettings] = useState<any>(null);

  useEffect(() => {
    getAISettings().then(s => setSettings(s));
    onAISettingsChanged((s) => setSettings(s));
  }, []);

  if (!settings) return <div className="p-6">Loading…</div>;

  const update = async (partial: any) => {
    await setAISettings(partial);
    const s = await getAISettings();
    setSettings(s);
    console.log('[OptionsApp] saved', partial, '->', s);
  };

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-2xl font-bold mb-4">DocuMind AI Settings</h1>

      <section className="mb-6">
        <h2 className="font-semibold">Gemini (Google GenAI)</h2>
        <div className="mt-2 mb-3">
          <label className="text-sm block mb-1">Gemini API Key</label>
          <input
            type="password"
            value={settings.apiKeys?.geminiApiKey || ''}
            onChange={(e) => {
              const newKey = e.target.value;
              const partial: any = { apiKeys: { ...(settings.apiKeys || {}), geminiApiKey: newKey } };
              if (!newKey) {
                // If key cleared, also disable all Gemini features
                partial.gemini = { chatEnabled: false, chunkingEnabled: false, embeddingsEnabled: false, termsEnabled: false, tocEnabled: false };
              }
              update(partial);
            }}
            className="w-full px-2 py-1 border rounded bg-white dark:bg-neutral-800 dark:text-neutral-100"
            placeholder="Enter Gemini API key"
          />
        </div>
        <div className="mt-2 space-y-2">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={settings.gemini.chatEnabled}
              onChange={(e) => update({ gemini: { chatEnabled: e.target.checked } })}
              disabled={!settings.apiKeys?.geminiApiKey}
            />
            <span className={!settings.apiKeys?.geminiApiKey ? 'text-neutral-400 dark:text-neutral-500' : ''}>Enable Chat</span>
          </label>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={settings.gemini.chunkingEnabled}
              onChange={(e) => update({ gemini: { chunkingEnabled: e.target.checked } })}
              disabled={!settings.apiKeys?.geminiApiKey}
            />
            <span className={!settings.apiKeys?.geminiApiKey ? 'text-neutral-400 dark:text-neutral-500' : ''}>Enable Gemini Chunking</span>
          </label>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={settings.gemini.embeddingsEnabled}
              onChange={(e) => update({ gemini: { embeddingsEnabled: e.target.checked } })}
              disabled={!settings.apiKeys?.geminiApiKey}
            />
            <span className={!settings.apiKeys?.geminiApiKey ? 'text-neutral-400 dark:text-neutral-500' : ''}>Enable Gemini Embeddings</span>
          </label>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={settings.gemini.termsEnabled}
              onChange={(e) => update({ gemini: { termsEnabled: e.target.checked } })}
              disabled={!settings.apiKeys?.geminiApiKey}
            />
            <span className={!settings.apiKeys?.geminiApiKey ? 'text-neutral-400 dark:text-neutral-500' : ''}>Enable Term Extraction & Summaries</span>
          </label>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={settings.gemini.tocEnabled}
              onChange={(e) => update({ gemini: { tocEnabled: e.target.checked } })}
              disabled={!settings.apiKeys?.geminiApiKey}
            />
            <span className={!settings.apiKeys?.geminiApiKey ? 'text-neutral-400 dark:text-neutral-500' : ''}>Enable AI Table of Contents</span>
          </label>
        </div>
      </section>

      <section className="mb-6">
        <h2 className="font-semibold">Other Integrations</h2>
        <div className="mt-2 mb-3">
          <label className="text-sm block mb-1">Chunkr API Key (legacy)</label>
          <input
            type="password"
            value={settings.apiKeys?.chunkrApiKey || ''}
            onChange={(e) => {
              const newKey = e.target.value;
              const partial: any = { apiKeys: { ...(settings.apiKeys || {}), chunkrApiKey: newKey } };
              if (!newKey) partial.chunkrEnabled = false;
              update(partial);
            }}
            className="w-full px-2 py-1 border rounded bg-white dark:bg-neutral-800 dark:text-neutral-100"
            placeholder="Enter Chunkr API key"
          />
        </div>
        <div className="mt-2 space-y-2">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={settings.chunkrEnabled}
              onChange={(e) => update({ chunkrEnabled: e.target.checked })}
              disabled={!settings.apiKeys?.chunkrApiKey}
            />
            <span className={!settings.apiKeys?.chunkrApiKey ? 'text-neutral-400 dark:text-neutral-500' : ''}>Enable Chunkr (legacy)</span>
          </label>
          <div className="mt-4 mb-3">
            <label className="text-sm block mb-1">ElevenLabs API Key</label>
            <input
              type="password"
              value={settings.apiKeys?.elevenLabsApiKey || ''}
              onChange={(e) => {
                const newKey = e.target.value;
                const partial: any = { apiKeys: { ...(settings.apiKeys || {}), elevenLabsApiKey: newKey } };
                if (!newKey) partial.elevenLabsEnabled = false;
                update(partial);
              }}
              className="w-full px-2 py-1 border rounded bg-white dark:bg-neutral-800 dark:text-neutral-100"
              placeholder="Enter ElevenLabs API key"
            />
          </div>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={settings.elevenLabsEnabled}
              onChange={(e) => update({ elevenLabsEnabled: e.target.checked })}
              disabled={!settings.apiKeys?.elevenLabsApiKey}
            />
            <span className={!settings.apiKeys?.elevenLabsApiKey ? 'text-neutral-400 dark:text-neutral-500' : ''}>Enable ElevenLabs (TTS)</span>
          </label>
        </div>
      </section>

      <div className="mt-4 text-sm text-neutral-600">
        Changes are saved automatically to extension storage. Close this tab when done.
      </div>
    </div>
  );
};

export default OptionsApp;
