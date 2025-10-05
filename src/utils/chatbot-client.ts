// Client utility for chatbot operations

export interface ChatResponse {
  response: string;
  sources: Array<{ page: number; similarity: number }>;
}

/**
 * Send a chat query and get a response with document context
 */
export async function sendChatQuery(
  query: string,
  docHash: string
): Promise<{ success: boolean; result?: ChatResponse; error?: string }> {
  try {
    console.log(`[ChatbotClient] Sending chat query for document ${docHash}`);

    const response = await chrome.runtime.sendMessage({
      type: 'CHAT_QUERY',
      payload: { query, docHash }
    });

    if (response && response.success) {
      console.log(`[ChatbotClient] Received response with ${response.result.sources.length} sources`);
      return { success: true, result: response.result };
    } else {
      console.error('[ChatbotClient] Chat query failed:', response?.error);
      return { success: false, error: response?.error || 'Unknown error' };
    }
  } catch (error: any) {
    console.error('[ChatbotClient] Error sending chat query:', error);
    return { success: false, error: error.message || 'Network error' };
  }
}
