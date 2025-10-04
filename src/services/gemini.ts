// Google Gemini API service for table of contents generation

export interface TOCItem {
  title: string;
  page?: number;
  chunkIndex?: number;
}

export class GeminiService {
  private apiKey: string = '';
  private apiUrl: string = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent';

  constructor() {
    // API key will be loaded from chrome.storage when needed
  }

  private async getApiKey(): Promise<string> {
    try {
      const result = await chrome.storage.local.get(['geminiApiKey']);
      return result.geminiApiKey || '';
    } catch (error) {
      console.error('Error getting API key:', error);
      return '';
    }
  }

  async generateTableOfContents(chunkSummaries: any[]): Promise<TOCItem[]> {
    // Get API key from storage
    this.apiKey = await this.getApiKey();
    
    if (!this.apiKey) {
      console.log('No Gemini API key found, using fallback TOC generation');
      return this.fallbackTOC(chunkSummaries);
    }

    try {
      const prompt = this.createTOCPrompt(chunkSummaries);
      
      const response = await fetch(`${this.apiUrl}?key=${this.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: prompt
            }]
          }]
        })
      });

      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status}`);
      }

      const data = await response.json();
      const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      
      return this.parseTOCFromResponse(generatedText, chunkSummaries);
    } catch (error) {
      console.error('Gemini API error, using fallback:', error);
      return this.fallbackTOC(chunkSummaries);
    }
  }

  private createTOCPrompt(chunkSummaries: any[]): string {
    const summariesText = chunkSummaries
      .map(chunk => `Chunk ${chunk.index}: ${chunk.preview}`)
      .join('\n\n');

    return `Analyze the following document chunks and generate a table of contents with clear, descriptive titles for each major section. Return the response as a JSON array with objects containing "title" and "chunkIndex" fields.

Document chunks:
${summariesText}

Generate a comprehensive table of contents in JSON format like this:
[
  {"title": "Introduction", "chunkIndex": 0},
  {"title": "Main Topic", "chunkIndex": 3}
]`;
  }

  private parseTOCFromResponse(text: string, chunkSummaries: any[]): TOCItem[] {
    try {
      // Try to extract JSON from the response
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const items = JSON.parse(jsonMatch[0]);
        return items.map((item: any) => ({
          title: item.title,
          chunkIndex: item.chunkIndex,
          page: this.estimatePageFromChunk(item.chunkIndex, chunkSummaries.length)
        }));
      }
    } catch (error) {
      console.error('Error parsing Gemini response:', error);
    }

    return this.fallbackTOC(chunkSummaries);
  }

  private fallbackTOC(chunkSummaries: any[]): TOCItem[] {
    // Simple fallback: create sections based on chunks
    const tocItems: TOCItem[] = [];
    const sectionsPerDoc = Math.min(10, Math.max(3, Math.floor(chunkSummaries.length / 3)));
    const chunksPerSection = Math.ceil(chunkSummaries.length / sectionsPerDoc);

    for (let i = 0; i < sectionsPerDoc; i++) {
      const chunkIndex = i * chunksPerSection;
      if (chunkIndex >= chunkSummaries.length) break;

      const chunk = chunkSummaries[chunkIndex];
      const preview = chunk.preview.substring(0, 50).trim();
      const title = preview || `Section ${i + 1}`;

      tocItems.push({
        title: title,
        chunkIndex: chunkIndex,
        page: this.estimatePageFromChunk(chunkIndex, chunkSummaries.length)
      });
    }

    return tocItems;
  }

  private estimatePageFromChunk(chunkIndex: number, totalChunks: number): number {
    // Rough estimation: assume evenly distributed chunks across pages
    // This is a placeholder - in production, we'd track actual page numbers
    const estimatedTotalPages = Math.max(1, Math.ceil(totalChunks / 2));
    const estimatedPage = Math.max(1, Math.ceil((chunkIndex / totalChunks) * estimatedTotalPages));
    return estimatedPage;
  }
}
