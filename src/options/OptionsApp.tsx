import React, { useEffect, useState } from "react";
import { Eye, EyeOff } from 'lucide-react';
import {
  getAISettings,
  setAISettings,
  onAISettingsChanged,
} from "../utils/ai-settings";

export const OptionsApp: React.FC = () => {
  const [settings, setSettings] = useState<any>(null);
  const [formSettings, setFormSettings] = useState<any>(null);
  const [saved, setSaved] = useState<boolean>(false);
  const [showGeminiKey, setShowGeminiKey] = useState<boolean>(false);
  const [showChunkrKey, setShowChunkrKey] = useState<boolean>(false);
  const [showElevenKey, setShowElevenKey] = useState<boolean>(false);

  useEffect(() => {
    getAISettings().then((s) => {
      setSettings(s);
      setFormSettings(s);
    });
    onAISettingsChanged((s) => {
      setSettings(s);
      setFormSettings(s);
    });
  }, []);

  // Warn on page close if there are unsaved changes
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      try {
        const unchanged = JSON.stringify(formSettings) === JSON.stringify(settings);
        if (!unchanged) {
          e.preventDefault();
          e.returnValue = '';
          return '';
        }
      } catch (err) {
        // ignore serialization errors and don't block unload
      }
      return undefined;
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [formSettings, settings]);

  if (!formSettings) return <div className="p-6">Loading…</div>;

  // Merge helper for nested partial updates
  const updateForm = (partial: any) => {
    setFormSettings((prev: any) => {
      const merged = { ...(prev || {}), ...partial };
      // Merge nested apiKeys and gemini specifically when present in partial
      if (prev?.apiKeys || partial?.apiKeys) {
        merged.apiKeys = {
          ...(prev?.apiKeys || {}),
          ...(partial?.apiKeys || {}),
        };
      }
      if (prev?.gemini || partial?.gemini) {
        merged.gemini = { ...(prev?.gemini || {}), ...(partial?.gemini || {}) };
      }
      return merged;
    });
  };

  const handleSave = async () => {
    if (!formSettings) return;
    await setAISettings(formSettings);
    const s = await getAISettings();
    setSettings(s);
    setFormSettings(s);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    console.log("[OptionsApp] saved settings ->", s);
  };

  const isUnchanged = JSON.stringify(formSettings) === JSON.stringify(settings);



  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-2xl font-bold mb-4">DocuMind AI Settings</h1>

      <section className="mb-6">
        <h2 className="font-semibold">Gemini (Google GenAI)</h2>
        <div className="mt-2 mb-3">
          <label className="text-sm block mb-1">Gemini API Key</label>
          <div className="relative">
            <input
              type={showGeminiKey ? 'text' : 'password'}
              value={formSettings.apiKeys?.geminiApiKey || ""}
              onChange={(e) => {
                const newKey = e.target.value;
                const partial: any = {
                  apiKeys: {
                    ...(formSettings.apiKeys || {}),
                    geminiApiKey: newKey,
                  },
                };
                if (!newKey) {
                  // If key cleared, also disable all Gemini features in the form
                  partial.gemini = {
                    chatEnabled: false,
                    chunkingEnabled: false,
                    embeddingsEnabled: false,
                    termsEnabled: false,
                    tocEnabled: false,
                  };
                }
                updateForm(partial);
              }}
              className="w-full px-2 py-1 border rounded bg-white text-neutral-800 pr-10"
              placeholder="Enter Gemini API key"
            />
            <button
              type="button"
              onClick={() => setShowGeminiKey(s => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-600"
              aria-label={showGeminiKey ? 'Hide Gemini API key' : 'Show Gemini API key'}
            >
                {showGeminiKey ? (
                  <EyeOff className="h-5 w-5" />
                ) : (
                  <Eye className="h-5 w-5" />
                )}
            </button>
          </div>
        </div>
        <div className="mt-2 space-y-2">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={formSettings.gemini.chatEnabled}
              onChange={(e) =>
                updateForm({ gemini: { chatEnabled: e.target.checked } })
              }
              disabled={!formSettings.apiKeys?.geminiApiKey}
            />
            <span
              className={
                !formSettings.apiKeys?.geminiApiKey ? "text-neutral-400" : ""
              }
            >
              Enable Chat
            </span>
          </label>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={formSettings.gemini.chunkingEnabled}
              onChange={(e) =>
                updateForm({ gemini: { chunkingEnabled: e.target.checked } })
              }
              disabled={!formSettings.apiKeys?.geminiApiKey}
            />
            <span
              className={
                !formSettings.apiKeys?.geminiApiKey ? "text-neutral-400" : ""
              }
            >
              Enable Gemini Chunking
            </span>
          </label>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={formSettings.gemini.embeddingsEnabled}
              onChange={(e) =>
                updateForm({ gemini: { embeddingsEnabled: e.target.checked } })
              }
              disabled={!formSettings.apiKeys?.geminiApiKey}
            />
            <span
              className={
                !formSettings.apiKeys?.geminiApiKey ? "text-neutral-400" : ""
              }
            >
              Enable Gemini Embeddings
            </span>
          </label>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={formSettings.gemini.termsEnabled}
              onChange={(e) =>
                updateForm({ gemini: { termsEnabled: e.target.checked } })
              }
              disabled={!formSettings.apiKeys?.geminiApiKey}
            />
            <span
              className={
                !formSettings.apiKeys?.geminiApiKey ? "text-neutral-400" : ""
              }
            >
              Enable Term Extraction & Summaries
            </span>
          </label>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={formSettings.gemini.tocEnabled}
              onChange={(e) =>
                updateForm({ gemini: { tocEnabled: e.target.checked } })
              }
              disabled={!formSettings.apiKeys?.geminiApiKey}
            />
            <span
              className={
                !formSettings.apiKeys?.geminiApiKey ? "text-neutral-400" : ""
              }
            >
              Enable AI Table of Contents
            </span>
          </label>
        </div>
      </section>

      <section className="mb-6">
        <h2 className="font-semibold">Other Integrations</h2>
          <div className="mt-2 mb-3">
          <label className="text-sm block mb-1">Chunkr API Key (legacy)</label>
          <div className="relative">
            <input
              type={showChunkrKey ? 'text' : 'password'}
              value={formSettings.apiKeys?.chunkrApiKey || ""}
              onChange={(e) => {
                const newKey = e.target.value;
                const partial: any = {
                  apiKeys: {
                    ...(formSettings.apiKeys || {}),
                    chunkrApiKey: newKey,
                  },
                };
                if (!newKey) partial.chunkrEnabled = false;
                updateForm(partial);
              }}
              className="w-full px-2 py-1 border rounded bg-white text-neutral-800 pr-10"
              placeholder="Enter Chunkr API key"
            />
            <button
              type="button"
              onClick={() => setShowChunkrKey(s => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-600"
              aria-label={showChunkrKey ? 'Hide Chunkr API key' : 'Show Chunkr API key'}
            >
              {showChunkrKey ? (
                <EyeOff className="h-5 w-5" />
              ) : (
                <Eye className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>
        <div className="mt-2 space-y-2">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={formSettings.chunkrEnabled}
              onChange={(e) => updateForm({ chunkrEnabled: e.target.checked })}
              disabled={!formSettings.apiKeys?.chunkrApiKey}
            />
            <span
              className={
                !formSettings.apiKeys?.chunkrApiKey ? "text-neutral-400" : ""
              }
            >
              Enable Chunkr (legacy)
            </span>
          </label>
          <div className="mt-4 mb-3">
            <label className="text-sm block mb-1">ElevenLabs API Key</label>
            <div className="relative">
            <input
              type={showElevenKey ? 'text' : 'password'}
              value={formSettings.apiKeys?.elevenLabsApiKey || ""}
              onChange={(e) => {
                const newKey = e.target.value;
                const partial: any = {
                  apiKeys: {
                    ...(formSettings.apiKeys || {}),
                    elevenLabsApiKey: newKey,
                  },
                };
                if (!newKey) partial.elevenLabsEnabled = false;
                updateForm(partial);
              }}
              className="w-full px-2 py-1 border rounded bg-white text-neutral-800 pr-10"
              placeholder="Enter ElevenLabs API key"
            />
            <button
              type="button"
              onClick={() => setShowElevenKey(s => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-600"
              aria-label={showElevenKey ? 'Hide ElevenLabs API key' : 'Show ElevenLabs API key'}
            >
              {showElevenKey ? (
                <EyeOff className="h-5 w-5" />
              ) : (
                <Eye className="h-5 w-5" />
              )}
            </button>
            </div>
          </div>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={formSettings.elevenLabsEnabled}
              onChange={(e) =>
                updateForm({ elevenLabsEnabled: e.target.checked })
              }
              disabled={!formSettings.apiKeys?.elevenLabsApiKey}
            />
            <span
              className={
                !formSettings.apiKeys?.elevenLabsApiKey
                  ? "text-neutral-400"
                  : ""
              }
            >
              Enable ElevenLabs (TTS)
            </span>
          </label>
        </div>
      </section>

      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            className={`px-3 py-1 rounded border bg-blue-600 text-white disabled:opacity-50`}
            onClick={handleSave}
            disabled={isUnchanged}
          >
            Save
          </button>
          {saved && <div className="text-sm text-green-600">Saved</div>}
        </div>
      </div>
    </div>
  );
};

export default OptionsApp;
