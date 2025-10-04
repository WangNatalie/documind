export interface HashState {
  page?: number;
  zoom?: string; // "fitWidth" | "fitPage" | "150"
}

export function parseHash(hash: string): HashState {
  const params = new URLSearchParams(hash.replace('#', ''));
  const state: HashState = {};

  const page = params.get('page');
  if (page) state.page = parseInt(page, 10);

  const zoom = params.get('zoom');
  if (zoom) state.zoom = zoom;

  return state;
}

export function buildHash(state: HashState): string {
  const params = new URLSearchParams();
  if (state.page) params.set('page', state.page.toString());
  if (state.zoom) params.set('zoom', state.zoom);
  return params.toString() ? `#${params.toString()}` : '';
}

export function updateHash(state: HashState) {
  const newHash = buildHash(state);
  if (newHash !== window.location.hash) {
    window.history.replaceState(null, '', newHash || window.location.pathname + window.location.search);
  }
}

// Generate document hash for caching and tracking
export async function generateDocHash(source: { type: 'url' | 'uploadId'; value: string }, metadata?: {
  etag?: string;
  contentLength?: number;
  size?: number;
  firstBytes?: ArrayBuffer;
  lastBytes?: ArrayBuffer;
}): Promise<string> {
  const encoder = new TextEncoder();
  let data: Uint8Array;

  if (source.type === 'url') {
    // Hash: URL + ETag + Content-Length
    const parts = [
      source.value,
      metadata?.etag || '',
      metadata?.contentLength?.toString() || '',
    ];
    data = encoder.encode(parts.join('|'));
  } else {
    // Hash: uploadId + size + first/last 64KB
    const parts = [
      source.value,
      metadata?.size?.toString() || '',
    ];
    let combined = encoder.encode(parts.join('|'));

    // Append first/last bytes if available
    if (metadata?.firstBytes) {
      const firstArray = new Uint8Array(metadata.firstBytes);
      const temp = new Uint8Array(combined.length + firstArray.length);
      temp.set(combined);
      temp.set(firstArray, combined.length);
      combined = temp;
    }
    if (metadata?.lastBytes) {
      const lastArray = new Uint8Array(metadata.lastBytes);
      const temp = new Uint8Array(combined.length + lastArray.length);
      temp.set(combined);
      temp.set(lastArray, combined.length);
      combined = temp;
    }

    data = combined;
  }

  // Use SubtleCrypto to hash - create a new ArrayBuffer to ensure proper typing
  const buffer = new ArrayBuffer(data.length);
  const view = new Uint8Array(buffer);
  view.set(data);

  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
