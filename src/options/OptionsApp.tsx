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
        <div className="mt-2 space-y-2">
          <label className="flex items-center gap-3">
            <input type="checkbox" checked={settings.gemini.chatEnabled} onChange={(e) => update({ gemini: { chatEnabled: e.target.checked } })} />
            <span>Enable Chat</span>
          </label>
          <label className="flex items-center gap-3">
            <input type="checkbox" checked={settings.gemini.chunkingEnabled} onChange={(e) => update({ gemini: { chunkingEnabled: e.target.checked } })} />
            <span>Enable Gemini Chunking</span>
          </label>
          <label className="flex items-center gap-3">
            <input type="checkbox" checked={settings.gemini.embeddingsEnabled} onChange={(e) => update({ gemini: { embeddingsEnabled: e.target.checked } })} />
            <span>Enable Gemini Embeddings</span>
          </label>
          <label className="flex items-center gap-3">
            <input type="checkbox" checked={settings.gemini.termsEnabled} onChange={(e) => update({ gemini: { termsEnabled: e.target.checked } })} />
            <span>Enable Term Extraction & Summaries</span>
          </label>
          <label className="flex items-center gap-3">
            <input type="checkbox" checked={settings.gemini.tocEnabled} onChange={(e) => update({ gemini: { tocEnabled: e.target.checked } })} />
            <span>Enable AI Table of Contents</span>
          </label>
        </div>
      </section>

      <section className="mb-6">
        <h2 className="font-semibold">Other Integrations</h2>
        <div className="mt-2 space-y-2">
          <label className="flex items-center gap-3">
            <input type="checkbox" checked={settings.chunkrEnabled} onChange={(e) => update({ chunkrEnabled: e.target.checked })} />
            <span>Enable Chunkr (legacy)</span>
          </label>
          <label className="flex items-center gap-3">
            <input type="checkbox" checked={settings.elevenLabsEnabled} onChange={(e) => update({ elevenLabsEnabled: e.target.checked })} />
            <span>Enable ElevenLabs (TTS)</span>
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
