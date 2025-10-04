// Transformers.js service for generating text embeddings

export class EmbeddingService {
  private model: any = null;
  private isInitialized: boolean = false;

  async init(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Dynamically import Transformers.js
      const { pipeline } = await import('@xenova/transformers');
      
      console.log('Loading embedding model...');
      // Use a smaller, faster model for embeddings
      this.model = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
      
      this.isInitialized = true;
      console.log('Embedding model loaded successfully');
    } catch (error) {
      console.error('Error loading embedding model:', error);
      // Use fallback simple hash-based embeddings
      this.isInitialized = false;
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.isInitialized || !this.model) {
      // Fallback to simple hash-based embedding
      return this.fallbackEmbedding(text);
    }

    try {
      const output = await this.model(text, { pooling: 'mean', normalize: true });
      return Array.from(output.data);
    } catch (error) {
      console.error('Error generating embedding:', error);
      return this.fallbackEmbedding(text);
    }
  }

  private fallbackEmbedding(text: string): number[] {
    // Simple fallback: create a hash-based embedding
    // This is not ideal but allows the system to work without the model
    const embedding: number[] = new Array(384).fill(0);
    
    for (let i = 0; i < text.length; i++) {
      const charCode = text.charCodeAt(i);
      const index = charCode % 384;
      embedding[index] += 1;
    }
    
    // Normalize
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      for (let i = 0; i < embedding.length; i++) {
        embedding[i] /= magnitude;
      }
    }
    
    return embedding;
  }

  async findSimilarChunks(queryEmbedding: number[], chunkEmbeddings: Array<{text: string, embedding: number[]}>): Promise<Array<{text: string, similarity: number}>> {
    const results = chunkEmbeddings.map(chunk => ({
      text: chunk.text,
      similarity: this.cosineSimilarity(queryEmbedding, chunk.embedding)
    }));

    // Sort by similarity (descending)
    results.sort((a, b) => b.similarity - a.similarity);
    
    return results.slice(0, 5); // Return top 5 similar chunks
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    
    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      magnitudeA += a[i] * a[i];
      magnitudeB += b[i] * b[i];
    }
    
    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);
    
    if (magnitudeA === 0 || magnitudeB === 0) return 0;
    
    return dotProduct / (magnitudeA * magnitudeB);
  }
}
