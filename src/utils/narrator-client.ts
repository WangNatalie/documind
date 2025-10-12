// Browser-friendly narrator client using ElevenLabs SDK `convert` and returning an ArrayBuffer.
// We DO NOT call the SDK's `play()` helper because it relies on Node-only APIs.

import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';

const MODEL_ID = "eleven_flash_v2_5";
const VOICE_ID = "21m00Tcm4TlvDq8ikWAM";

let client: ElevenLabsClient | null = null;
async function getClient(): Promise<ElevenLabsClient> {
  // Dynamic import to avoid compile-time coupling with the private api_key file
  const keys = await import('../offscreen/api_key');
  const ELEVEN_LABS_API_KEY = (keys as any)?.ELEVEN_LABS_API_KEY;
  if (!ELEVEN_LABS_API_KEY) throw new Error("Missing ElevenLabs API key");
  if (!client) client = new ElevenLabsClient({ apiKey: ELEVEN_LABS_API_KEY });
  return client;
}

async function toArrayBuffer(audio: unknown): Promise<ArrayBuffer> {
  if (!audio) throw new Error("Empty audio result");
  if (audio instanceof ArrayBuffer) return audio;
  if (ArrayBuffer.isView(audio)) {
    const view = audio as ArrayBufferView;
    const length = view.byteLength;
    const out = new Uint8Array(length);
    out.set(new Uint8Array(view.buffer, view.byteOffset, length));
    return out.buffer;
  }
  if (typeof Blob !== 'undefined' && audio instanceof Blob) {
    return audio.arrayBuffer();
  }
  if (audio instanceof Response) {
    return audio.arrayBuffer();
  }
  if (typeof ReadableStream !== 'undefined' && audio instanceof ReadableStream) {
    return await new Response(audio).arrayBuffer();
  }
  if (typeof audio === 'object' && audio && 'arrayBuffer' in (audio as any)) {
    try { return await (audio as any).arrayBuffer(); } catch {/* ignore */}
  }
  if (typeof audio === 'object' && audio && 'data' in (audio as any)) {
    const data = (audio as any).data;
    if (data instanceof ArrayBuffer) return data;
    if (ArrayBuffer.isView(data)) {
      const view = data as ArrayBufferView;
      const length = view.byteLength;
      const out = new Uint8Array(length);
      out.set(new Uint8Array(view.buffer, view.byteOffset, length));
      return out.buffer;
    }
  }
  console.warn('[narrator-client] Unrecognized convert() return value', audio);
  throw new Error('Unrecognized audio format from ElevenLabs SDK');
}

export const getAudio = async (text: string): Promise<ArrayBuffer> => {
  try {
    const { getAISettings } = await import('../offscreen/ai-settings.js');
    const settings = await getAISettings();
    if (!settings.elevenLabsEnabled) {
      console.log('[narrator-client] ElevenLabs TTS disabled by settings');
      throw new Error('ElevenLabs disabled by settings');
    }
  } catch (e) {
    // If storage isn't available, continue and let key checks handle errors
  }
  const sdk = await getClient();
  const result = await sdk.textToSpeech.convert(VOICE_ID, {
    text,
    modelId: MODEL_ID,
    outputFormat: 'mp3_44100_128',
  });
  return toArrayBuffer(result);
};
