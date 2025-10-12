import React, { useRef, useState, useEffect } from 'react';
import { marked } from 'marked';
import { sendChatQuery } from '../utils/chatbot-client';
import { ArrowLeft } from 'lucide-react';
import type { BookmarkItem } from './TOC';
import { getAISettings, onAISettingsChanged } from '../utils/ai-settings';

const BOT_BUTTON_SIZE = 56;
const CHATBOX_MIN_WIDTH = 320;
const CHATBOX_MIN_HEIGHT = 400;
const CHATBOX_MAX_WIDTH = 480;
const CHATBOX_MAX_HEIGHT = 700;

interface ChatbotProps {
  docHash: string;
  currentPage?: number;
  onPageNavigate?: (page: number) => void;
  contextBookmarks?: BookmarkItem[];
  onRemoveContextBookmark?: (id: string) => void;
  openSignal?: number;
}

export const Chatbot: React.FC<ChatbotProps> = ({ docHash, currentPage, onPageNavigate, contextBookmarks = [], onRemoveContextBookmark, openSignal }) => {
  const [chatEnabled, setChatEnabled] = useState(true);

  useEffect(() => {
    let mounted = true;
    getAISettings().then((s) => {
      if (mounted) setChatEnabled(!!s?.gemini?.chatEnabled);
    });
    // subscribe for changes
    onAISettingsChanged((s) => {
      setChatEnabled(!!s?.gemini?.chatEnabled);
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Do not early-return when chat is disabled because that would skip hooks
  // instead, we'll conditionally render the UI inside the returned JSX so
  // hooks are always executed in the same order across renders.
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<{ text: string; sender: 'user' | 'bot'; sources?: Array<{ page: number }> }[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [dimensions, setDimensions] = useState({
    width: 360,
    height: 500,
  });
  const [resizing, setResizing] = useState(false);
  const [chatbotReturnPage, setChatbotReturnPage] = useState<number | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<HTMLDivElement>(null);
  const startPos = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const [pendingContext, setPendingContext] = useState<BookmarkItem[]>([]);

  // Extract an excerpt from the PDF text layer that intersects bookmark rects
  const getExcerptForBookmark = (b: BookmarkItem): string | undefined => {
    try {
      const pageNum = b.page;
      const pageEl = document.querySelector(`[data-page-num="${pageNum}"]`) as HTMLElement | null;
      if (!pageEl) return undefined;
      const pageBox = pageEl.getBoundingClientRect();
      const textLayer = (pageEl.querySelector('.text-layer') || pageEl.querySelector('.textLayer')) as HTMLElement | null;
      if (!textLayer) return undefined;

      // Convert normalized rects to absolute pixel rects
      const rects = (b.original as any)?.rects as Array<{ top: number; left: number; width: number; height: number }> | undefined;
      if (!rects || rects.length === 0) return undefined;
      const absRects = rects.map(r => ({
        top: pageBox.top + r.top * pageBox.height,
        left: pageBox.left + r.left * pageBox.width,
        width: r.width * pageBox.width,
        height: r.height * pageBox.height,
      }));

      const intersects = (a: DOMRect, b: { top: number; left: number; width: number; height: number }) => {
        const ar = { x1: a.left, y1: a.top, x2: a.left + a.width, y2: a.top + a.height };
        const br = { x1: b.left, y1: b.top, x2: b.left + b.width, y2: b.top + b.height };
        return !(ar.x2 < br.x1 || ar.x1 > br.x2 || ar.y2 < br.y1 || ar.y1 > br.y2);
      };

      const walker = document.createTreeWalker(textLayer, NodeFilter.SHOW_TEXT, null);
      const pieces: string[] = [];
      while (walker.nextNode()) {
        const node = walker.currentNode as Text;
        const parent = node.parentElement as HTMLElement | null;
        if (!parent) continue;
        const rect = parent.getBoundingClientRect();
        if (absRects.some(r => intersects(rect, r))) {
          if (node.textContent) pieces.push(node.textContent);
        }
      }

      const merged = pieces.join(' ').replace(/\s+/g, ' ').trim();
      if (!merged) return undefined;
      return merged.length > 400 ? merged.slice(0, 400) + '…' : merged;
    } catch {
      return undefined;
    }
  };

  // Sync contextBookmarks from props to local pendingContext for one-time use
  useEffect(() => {
    setPendingContext(contextBookmarks);
  }, [contextBookmarks]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (open && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, open]);

  // Handle resizing
  useEffect(() => {
    if (!resizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!startPos.current) return;
      const dx = startPos.current.x - e.clientX;
      const dy = startPos.current.y - e.clientY;
      setDimensions({
        width: Math.min(
          Math.max(CHATBOX_MIN_WIDTH, startPos.current.width + dx),
          CHATBOX_MAX_WIDTH
        ),
        height: Math.min(
          Math.max(CHATBOX_MIN_HEIGHT, startPos.current.height + dy),
          CHATBOX_MAX_HEIGHT
        ),
      });
    };

    const handleMouseUp = () => {
      setResizing(false);
      startPos.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizing]);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (input.trim() === '' || loading) return;

    const userMessage = input.trim();
    setInput('');

    // Add user message
    setMessages((msgs) => [...msgs, { text: userMessage, sender: 'user' }]);
    setLoading(true);

    try {
      // Build context string using bookmark note/comment text + extracted excerpt
      let contextString = '';
      if (pendingContext.length > 0) {
        contextString = pendingContext.map((b) => {
          const type = b.__type === 'note' ? 'Note' : 'Comment';
          const userText = (b.text || '').trim();
          const excerpt = getExcerptForBookmark(b);
          const parts: string[] = [];
          if (excerpt) parts.push(`Excerpt: "${excerpt}"`);
          if (userText) parts.push(`User ${type.toLowerCase()} text: ${userText}`);
          const details = parts.length > 0 ? `\n${parts.join('\n')}` : '';
          return `[${type} • Page ${b.page}]${details}`;
        }).join('\n---\n');
      }
      console.log('Sending bookmarks context:', contextString);
      // Send query to backend, including context if present
      const fullMessage = contextString ? `${contextString}\n\n${userMessage}` : userMessage;
      const result = await sendChatQuery(fullMessage, docHash);
      // Do NOT clear context after use
      if (result.success && result.result) {
        // Add bot response
        setMessages((msgs) => [...msgs, {
          text: result.result!.response,
          sender: 'bot',
          sources: result.result!.sources
        }]);
      } else {
        // Add error message
        setMessages((msgs) => [...msgs, {
          text: `Sorry, I encountered an error: ${result.error || 'Unknown error'}`,
          sender: 'bot'
        }]);
      }
    } catch (error) {
      console.error('[Teacher Chatbot] Error sending query:', error);
      setMessages((msgs) => [...msgs, {
        text: 'Sorry, I encountered an error processing your question. Please try again.',
        sender: 'bot'
      }]);
    } finally {
      setLoading(false);
    }
  };

  // Keyboard shortcut: Enter to send, Shift+Enter for newline
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Drag to resize from bottom right
  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setResizing(true);
    startPos.current = {
      x: e.clientX,
      y: e.clientY,
      width: dimensions.width,
      height: dimensions.height,
    };
  };

  // For animation: controls mounting/unmounting
  const [showBox, setShowBox] = useState(false);

  // Animate open/close
  useEffect(() => {
    if (open) {
      setShowBox(true);
    } else {
      // Wait for animation to finish before unmounting
      const timeout = setTimeout(() => setShowBox(false), 200);
      return () => clearTimeout(timeout);
    }
  }, [open]);

  // Open chatbot when external openSignal changes (ignore undefined/zero on initial render)
  useEffect(() => {
    if (typeof openSignal === 'number' && openSignal > 0) {
      setOpen(true);
    }
  }, [openSignal]);
  return (
    <>
      {chatEnabled ? (
        <>
          {/* Floating Chatbot Button */}
          {!open && (
            <button
              aria-label="Open Teacher"
              className="fixed z-50 bottom-6 right-6 bg-primary-600 hover:bg-primary-700 shadow-lg rounded-full flex items-center justify-center"
              style={{
                width: BOT_BUTTON_SIZE,
                height: BOT_BUTTON_SIZE,
                boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
              }}
              onClick={() => setOpen(true)}
            >
              {/* Speech bubble icon */}
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path
                  d="M4 12c0-3.314 3.134-6 7-6s7 2.686 7 6-3.134 6-7 6c-.69 0-1.36-.08-1.98-.23l-2.52.86a.5.5 0 0 1-.64-.64l.86-2.52C4.08 13.36 4 12.69 4 12z"
                  fill="#fff"
                  stroke="#633CB1"
                  strokeWidth="1.5"
                />
              </svg>
            </button>
          )}

          {/* Animated Chatbox */}
          {showBox && (
            <>
              {/* Return button - positioned outside chatbot at top left */}
              {chatbotReturnPage !== null && open && (
                <button
                  onClick={() => {
                    if (onPageNavigate && chatbotReturnPage !== null) {
                      onPageNavigate(chatbotReturnPage);
                      setChatbotReturnPage(null);
                    }
                  }}
                  className="fixed z-50 bg-primary-600 hover:bg-primary-800 text-white px-3 py-2 rounded-lg shadow-lg flex items-center gap-2 text-sm font-medium transition"
                  style={{
                    bottom: `${dimensions.height - 16}px`, // Beside chatbot
                    right: `${dimensions.width + 16}px`, // Align with left edge of chatbot
                  }}
                  title="Return to previous page"
                >
                  <ArrowLeft size={16} />
                  Return to last page
                </button>
              )}

              <div
                className={`fixed z-50 bottom-6 right-6 bg-white dark:bg-neutral-900 rounded-xl shadow-2xl flex flex-col border border-neutral-200 dark:border-neutral-700
              ${open ? 'chatbot-animate-in' : 'chatbot-animate-out'}`}
                style={{
                  width: dimensions.width,
                  height: dimensions.height,
                  minWidth: CHATBOX_MIN_WIDTH,
                  minHeight: CHATBOX_MIN_HEIGHT,
                  maxWidth: CHATBOX_MAX_WIDTH,
                  maxHeight: CHATBOX_MAX_HEIGHT,
                  transition: 'box-shadow 0.2s',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.22)',
                  resize: 'none',
                  overflow: 'hidden',
                }}
              >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-700 bg-primary-600 rounded-t-xl">
                  <div className="flex items-center gap-2">
                    <span className="font-lacquer text-xl text-primary-200">teacher</span>
                  </div>
                  <button
                    aria-label="Close Teacher"
                    className="text-white hover:bg-primary-700 rounded-full p-1 transition"
                    onClick={() => setOpen(false)}
                  >
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <path
                        d="M6 6l8 8M6 14L14 6"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                </div>

                {/* Chat messages */}
                <div
                  className="flex-1 overflow-y-auto px-4 py-3 space-y-2 bg-neutral-50 dark:bg-neutral-800"
                  style={{ fontSize: 15 }}
                >
                  {messages.length === 0 && (
                    <div className="text-neutral-400 text-center mt-8">Ask clarifying questions, learn more about a passage, etc.</div>
                  )}
                  {messages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`rounded-lg px-3 py-2 max-w-[80%] ${
                          msg.sender === 'user'
                            ? 'bg-primary-600 text-white'
                            : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100'
                        }`}
                      >
                        {msg.sender === 'bot' ? (
                          <div
                            className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0"
                            dangerouslySetInnerHTML={{ __html: marked(msg.text) as string }}
                          />
                        ) : (
                          msg.text
                        )}
                      </div>
                      {msg.sender === 'bot' && msg.sources && msg.sources.length > 0 && (
                        <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 px-1">
                          Sources: {msg.sources.map((s, i) => (
                            <span key={i}>
                              {i > 0 && ', '}
                              <button
                                onClick={() => {
                                  if (onPageNavigate && currentPage && currentPage !== s.page) {
                                    setChatbotReturnPage(currentPage);
                                    onPageNavigate(s.page);
                                  }
                                }}
                                className="text-primary-600 dark:text-primary-400 hover:underline cursor-pointer"
                                title={`Go to page ${s.page}`}
                              >
                                Page {s.page}
                              </button>
                            </span>
                          ))}
                          {/* Return link on a new line, styled as requested */}
                          {chatbotReturnPage !== null && currentPage !== chatbotReturnPage && (
                            <div className="mt-1">
                              <button
                                onClick={() => {
                                  if (onPageNavigate && chatbotReturnPage !== null) {
                                    onPageNavigate(chatbotReturnPage);
                                    setChatbotReturnPage(null);
                                  }
                                }}
                                className="text-xs text-neutral-700 dark:text-neutral-300 hover:underline cursor-pointer font-normal"
                                style={{ fontSize: '11px' }}
                              >
                                ← Return to previous page
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  {loading && (
                    <div className="flex justify-start">
                      <div className="bg-neutral-200 dark:bg-neutral-700 rounded-lg px-3 py-2">
                        <div className="flex gap-1">
                          <div className="w-2 h-2 rounded-full bg-neutral-400 animate-bounce" style={{ animationDelay: '0ms' }}></div>
                          <div className="w-2 h-2 rounded-full bg-neutral-400 animate-bounce" style={{ animationDelay: '150ms' }}></div>
                          <div className="w-2 h-2 rounded-full bg-neutral-400 animate-bounce" style={{ animationDelay: '300ms' }}></div>
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Context chips above input */}
                {pendingContext.length > 0 && (
                  <div className="flex flex-wrap gap-2 px-4 pt-2 pb-1">
                    {pendingContext.map((b) => (
                      <span key={b.id} className="inline-flex items-center rounded-full bg-primary-100 dark:bg-primary-900 text-primary-800 dark:text-primary-200 px-3 py-1 text-xs font-medium mr-2 mb-1">
                        {b.__type === 'note' ? 'Note' : 'Comment'} • Page {b.page}
                        <button
                          className="ml-2 text-primary-500 hover:text-primary-700 dark:hover:text-primary-300 focus:outline-none"
                          style={{ fontSize: 12, lineHeight: 1 }}
                          title="Remove context"
                          onClick={e => {
                            e.stopPropagation();
                            if (onRemoveContextBookmark) onRemoveContextBookmark(b.id);
                            setPendingContext((prev) => prev.filter((x) => x.id !== b.id));
                          }}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                {/* Input area */}
                <form
                  className="px-4 py-3 border-t border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 flex gap-2"
                  onSubmit={handleSend}
                >
                  <textarea
                    className="flex-1 resize-none rounded-lg border border-neutral-300 dark:border-neutral-700 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
                    rows={1}
                    placeholder="Type your message…"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleInputKeyDown}
                    style={{ minHeight: 36, maxHeight: 80, fontSize: 15 }}
                  />
                  <button
                    type="submit"
                    className="font-lacquer bg-primary-600 hover:bg-primary-700 text-primary-200 rounded-lg px-4 py-2 font-semibold transition disabled:opacity-60"
                    disabled={input.trim() === '' || loading}
                    tabIndex={0}
                  >
                    {loading ? 'sending...' : 'send'}
                  </button>
                </form>

                {/* Resize handle */}
                <div
                  ref={resizeRef}
                  onMouseDown={handleResizeMouseDown}
                  className="absolute"
                  style={{
                    top: 3,
                    left: 3,
                    width: 20,
                    height: 20,
                    zIndex: 20,
                    borderRadius: 4,
                    background: 'transparent',
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'flex-start',
                    cursor: 'nwse-resize',
                    userSelect: 'none',
                  }}
                >
                  {/* Diagonal lines for resize handle */}
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <line x1="3" y1="8" x2="8" y2="3" stroke="#ffffffff" strokeWidth="1" />
                    <line x1="3" y1="11" x2="11" y2="3" stroke="#ffffffff" strokeWidth="1" />
                  </svg>
                </div>
              </div>
            </>
          )}
        </>
      ) : null}
    </>
  );
};

export default Chatbot;