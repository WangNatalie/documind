// Chunkr.ai service for semantic document segmentation

export interface Chunk {
  text: string;
  index: number;
  page?: number;
  embedding?: number[];
}

export class ChunkrService {
  private apiKey: string = '';
  private apiUrl: string = 'https://api.chunkr.ai/v1/chunk';

  constructor() {
    // In production, API key should be stored securely
    // For now, we'll use a placeholder or fallback to local chunking
    this.apiKey = this.getApiKey();
  }

  private getApiKey(): string {
    // Try to get from chrome.storage
    // For demo purposes, return empty string and use fallback
    return '';
  }

  async chunkDocument(text: string): Promise<Chunk[]> {
    // If no API key, use local chunking fallback
    if (!this.apiKey) {
      console.log('No Chunkr API key found, using local chunking');
      return this.localChunking(text);
    }

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          text: text,
          chunk_size: 'auto'
        })
      });

      if (!response.ok) {
        throw new Error(`Chunkr API error: ${response.status}`);
      }

      const data = await response.json();
      return this.normalizeChunks(data.chunks || []);
    } catch (error) {
      console.error('Chunkr API error, falling back to local chunking:', error);
      return this.localChunking(text);
    }
  }

  private localChunking(text: string): Chunk[] {
    // Simple fallback: split by paragraphs and create chunks
    const paragraphs = text.split(/\n\n+/);
    const chunks: Chunk[] = [];
    let currentChunk = '';
    let chunkIndex = 0;
    const maxChunkSize = 1000; // characters

    for (const para of paragraphs) {
      if (!para.trim()) continue;

      if (currentChunk.length + para.length > maxChunkSize && currentChunk.length > 0) {
        chunks.push({
          text: currentChunk.trim(),
          index: chunkIndex++
        });
        currentChunk = para;
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + para;
      }
    }

    if (currentChunk.trim()) {
      chunks.push({
        text: currentChunk.trim(),
        index: chunkIndex++
      });
    }

    console.log(`Created ${chunks.length} chunks locally`);
    return chunks;
  }

  private normalizeChunks(rawChunks: any[]): Chunk[] {
    return rawChunks.map((chunk, index) => ({
      text: chunk.text || chunk.content || '',
      index: index,
      page: chunk.page
    }));
  }
}
