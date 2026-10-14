'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import { StateCard } from '../../../components/common/MeadowBits';
import { useDesign } from '../../../styles/themeProvider';
import { Activity, Bot, Download, GraduationCap, Layers, ListChecks, MessageSquare, Plus, SendHorizontal, Sparkles, Trash2, TriangleAlert } from 'lucide-react';
import type { CopilotLink } from '../../../../core/services/copilot/types';
import { copilotLinkHref, parseCopilotLinks } from '../../../lib/copilotLinks';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  workflowId?: string;
  /** Buttons that open the page showing this answer's result. */
  links?: CopilotLink[];
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
}

interface OllamaStatus {
  ollama: 'unknown' | 'available' | 'unavailable';
  model: 'unknown' | 'ready' | 'pulling' | 'unavailable';
  pullProgress: number;
  pullError: string | null;
}

type SetupState = 'checking' | 'ollama-unavailable' | 'model-unavailable' | 'pulling' | 'ready';

const WINDOW_SIZE = 6;
const COPILOT_MODEL = 'qwen2.5:3b';
const STORAGE_KEY = 'copilot_conversations';
const ACTIVE_KEY = 'copilot_active_id';

const WELCOME: Message = {
  role: 'assistant',
  content: "Hi! I'm your study planner assistant. I can check a student's detected major, graduation status, completed units, list available planners, or check system status. How can I help?",
};

// Meadow: starting points shown in an empty chat. Prompts ending in a space
// need a student ID, so they fill the input instead of sending straight away.
const STARTERS = [
  { icon: GraduationCap, title: 'Detected major', prompt: 'What major is student ', hint: 'Add the student ID' },
  { icon: Activity, title: 'Student progress', prompt: 'Show the progress of student ', hint: 'Add the student ID' },
  { icon: Layers, title: 'Available planners', prompt: 'What planners are available?', hint: 'Lists every study planner' },
  { icon: ListChecks, title: 'Units with no prerequisites', prompt: 'Which units have no prerequisites?', hint: 'Good for first-year students' },
];

function formatChatDate(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return `Today, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
  }
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function newConversation(): Conversation {
  return {
    id: crypto.randomUUID(),
    title: 'New chat',
    messages: [WELCOME],
    createdAt: Date.now(),
  };
}

function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Conversation[];
  } catch {
    return [];
  }
}

function saveConversations(conversations: Conversation[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  } catch { /* storage full — non-fatal */ }
}

export default function CopilotPage() {
  const router = useRouter();
  const [setupState, setSetupState] = useState<SetupState>('checking');
  const [pullProgress, setPullProgress] = useState(0);
  const [pullError, setPullError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const isMeadow = useDesign() === 'meadow';

  // Buttons under an answer that open the page showing its result; both layouts use this.
  const renderAnswerLinks = (msg: Message) => {
    const links = msg.role === 'assistant' ? parseCopilotLinks(msg.links) : [];
    if (links.length === 0) return null;
    return (
      <div className={styles.messageActions}>
        {links.map((link, j) => (
          <button
            key={j}
            type="button"
            className={styles.linkBtn}
            onClick={() => router.push(copilotLinkHref(link))}
          >
            {link.label} <span aria-hidden="true">→</span>
          </button>
        ))}
      </div>
    );
  };

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Load from localStorage on mount ──────────────────────────────────────
  useEffect(() => {
    const saved = loadConversations();
    const savedActiveId = localStorage.getItem(ACTIVE_KEY);
    if (saved.length > 0) {
      setConversations(saved);
      const active = saved.find((c) => c.id === savedActiveId) ?? saved[0];
      setActiveId(active.id);
    } else {
      const first = newConversation();
      setConversations([first]);
      setActiveId(first.id);
    }
  }, []);

  // ── Persist to localStorage whenever conversations change ─────────────────
  useEffect(() => {
    if (conversations.length > 0) {
      saveConversations(conversations);
    }
  }, [conversations]);

  useEffect(() => {
    if (activeId) localStorage.setItem(ACTIVE_KEY, activeId);
  }, [activeId]);

  const activeConversation = conversations.find((c) => c.id === activeId) ?? null;
  const messages = activeConversation?.messages ?? [WELCOME];

  // ── Helpers to update conversations ──────────────────────────────────────
  const updateMessages = useCallback((id: string, next: Message[]) => {
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        // Title is first user message, truncated
        const firstUser = next.find((m) => m.role === 'user');
        const title = firstUser
          ? firstUser.content.slice(0, 42) + (firstUser.content.length > 42 ? '…' : '')
          : c.title;
        return { ...c, title, messages: next };
      })
    );
  }, []);

  // ── Ollama status ─────────────────────────────────────────────────────────
  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/ollama/status');
      const data = await res.json() as OllamaStatus;

      setPullProgress(data.pullProgress ?? 0);
      setPullError(data.pullError ?? null);

      if (data.ollama === 'unavailable') {
        setSetupState('ollama-unavailable');
      } else if (data.model === 'ready') {
        setSetupState('ready');
        setDownloading(false);
      } else if (data.model === 'pulling') {
        setSetupState('pulling');
      } else {
        setSetupState('model-unavailable');
        setDownloading(false);
      }
    } catch {
      setSetupState('ollama-unavailable');
    }
  }, []);

  useEffect(() => { checkStatus(); }, [checkStatus]);

  useEffect(() => {
    if (setupState === 'pulling') {
      pollRef.current = setInterval(checkStatus, 2000);
    } else {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [setupState, checkStatus]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // ── Conversation actions ──────────────────────────────────────────────────
  function handleNewChat() {
    const conv = newConversation();
    setConversations((prev) => [conv, ...prev]);
    setActiveId(conv.id);
    setInput('');
  }

  function handleDeleteChat(id: string) {
    setConversations((prev) => {
      const next = prev.filter((c) => c.id !== id);
      if (next.length === 0) {
        const fresh = newConversation();
        setActiveId(fresh.id);
        return [fresh];
      }
      if (id === activeId) {
        setActiveId(next[0].id);
      }
      return next;
    });
  }

  // ── Download model ────────────────────────────────────────────────────────
  async function handleDownload() {
    setDownloading(true);
    setPullError(null);
    try {
      await fetch('/api/ollama/pull', { method: 'POST' });
      setSetupState('pulling');
    } catch {
      setPullError('Failed to start download. Make sure Ollama is running.');
      setDownloading(false);
    }
  }

  // ── Send message ──────────────────────────────────────────────────────────
  async function handleSend(prompt?: string) {
    const text = (prompt ?? input).trim();
    if (!text || loading || !activeId) return;

    const userMsg: Message = { role: 'user', content: text };
    const next = [...messages, userMsg];
    updateMessages(activeId, next);
    setInput('');
    setLoading(true);
    setElapsed(0);
    elapsedRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);

    const nonWelcome = next.filter((_, i) => i > 0);
    const windowed = nonWelcome.slice(-WINDOW_SIZE);

    try {
      const res = await fetch('/api/copilot/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: windowed }),
      });

      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line) as { type: string; message?: string; content?: string; workflowId?: string; links?: unknown };
            if (event.type === 'status') {
              setStatusMessage(event.message ?? null);
              setStreamingContent(null);
            } else if (event.type === 'token') {
              setStatusMessage(null);
              setStreamingContent((prev) => (prev ?? '') + (event.content ?? ''));
            } else if (event.type === 'reply') {
              const links = parseCopilotLinks(event.links);
              const finalMessages = [...next, { role: 'assistant' as const, content: event.content ?? 'No response received.', workflowId: event.workflowId, ...(links.length > 0 ? { links } : {}) }];
              updateMessages(activeId, finalMessages);
              setStatusMessage(null);
              setStreamingContent(null);
            }
          } catch { /* ignore malformed chunks */ }
        }
      }
    } catch {
      updateMessages(activeId, [...next, { role: 'assistant', content: 'Failed to reach the AI service. Check that Ollama is running.' }]);
      setStatusMessage(null);
      setStreamingContent(null);
    } finally {
      if (elapsedRef.current) { clearInterval(elapsedRef.current); elapsedRef.current = null; }
      setLoading(false);
      setElapsed(0);
      inputRef.current?.focus();
    }
  }

  function handleStarter(prompt: string) {
    if (prompt.endsWith(' ')) {
      setInput(prompt);
      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(prompt.length, prompt.length);
      });
    } else {
      handleSend(prompt);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className={styles.panel}>
      {/* ── Setup states (full-width) ── */}
      {isMeadow && setupState !== 'ready' && (
        <div className={styles.mSetup}>
          {setupState === 'checking' && <StateCard busy title="Checking the AI service…" />}
          {setupState === 'ollama-unavailable' && (
            <StateCard icon={<TriangleAlert />} title="Ollama is not running">
              <span>The AI copilot requires Ollama to be running locally. Start Ollama, then come back to this page.</span>
              <button className={styles.setupBtn} onClick={checkStatus}>Check again</button>
            </StateCard>
          )}
          {setupState === 'model-unavailable' && (
            <StateCard icon={<Bot />} title="Download the AI model">
              <span>The copilot uses <strong>{COPILOT_MODEL}</strong>. The model is not installed yet (~2 GB). Download it once and the copilot will be available.</span>
              {pullError && <span className={styles.setupError}>{pullError}</span>}
              <button className={styles.setupBtn} onClick={handleDownload} disabled={downloading}>
                <Download aria-hidden="true" />{downloading ? 'Starting download…' : 'Download model'}
              </button>
            </StateCard>
          )}
          {setupState === 'pulling' && (
            <StateCard icon={<Download />} title={`Downloading ${COPILOT_MODEL}…`}>
              <span>This may take a few minutes depending on your connection. Do not close the app.</span>
              <div className={styles.progressTrack}>
                <div className={styles.progressBar} style={{ width: `${pullProgress}%` }} />
              </div>
              <span className={styles.progressLabel}>{pullProgress}%</span>
            </StateCard>
          )}
        </div>
      )}

      {!isMeadow && setupState === 'checking' && (
        <div className={styles.setupCard}>
          <div className={styles.setupIcon}>⏳</div>
          <div className={styles.setupTitle}>Checking AI status…</div>
        </div>
      )}

      {!isMeadow && setupState === 'ollama-unavailable' && (
        <div className={styles.setupCard}>
          <div className={styles.setupIcon}>⚠️</div>
          <div className={styles.setupTitle}>Ollama is not running</div>
          <div className={styles.setupBody}>
            The AI copilot requires Ollama to be running locally. Start Ollama, then come back to this page.
          </div>
          <button className={styles.setupBtn} onClick={checkStatus}>Check again</button>
        </div>
      )}

      {!isMeadow && setupState === 'model-unavailable' && (
        <div className={styles.setupCard}>
          <div className={styles.setupIcon}>🤖</div>
          <div className={styles.setupTitle}>AI model not downloaded</div>
          <div className={styles.setupBody}>
            The copilot uses <strong>{COPILOT_MODEL}</strong>. The model is not installed yet (~2 GB). Download it once and the copilot will be available.
          </div>
          {pullError && <div className={styles.setupError}>{pullError}</div>}
          <button className={styles.setupBtn} onClick={handleDownload} disabled={downloading}>
            {downloading ? 'Starting download…' : 'Download model'}
          </button>
        </div>
      )}

      {!isMeadow && setupState === 'pulling' && (
        <div className={styles.setupCard}>
          <div className={styles.setupIcon}>⬇️</div>
          <div className={styles.setupTitle}>Downloading {COPILOT_MODEL}…</div>
          <div className={styles.setupBody}>
            This may take a few minutes depending on your connection. Do not close the app.
          </div>
          <div className={styles.progressTrack}>
            <div className={styles.progressBar} style={{ width: `${pullProgress}%` }} />
          </div>
          <div className={styles.progressLabel}>{pullProgress}%</div>
        </div>
      )}

      {/* ── Ready: history sidebar + chat ── */}
      {setupState === 'ready' && (
        <div className={styles.chatLayout}>

          {/* History sidebar */}
          <div className={styles.historySidebar}>
            {isMeadow ? (
              <div className={styles.historyHeader}>
                <button className={styles.mNewChat} onClick={handleNewChat} disabled={loading}>
                  <Plus aria-hidden="true" />New chat
                </button>
                <span className={styles.historyTitle}>Recent chats</span>
              </div>
            ) : (
            <div className={styles.historyHeader}>
              <span className={styles.historyTitle}>Chats</span>
              <button className={styles.newChatBtn} onClick={handleNewChat} title="New chat">+</button>
            </div>
            )}
            <div className={styles.historyList}>
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  className={`${styles.historyItem} ${conv.id === activeId ? styles.historyItemActive : ''}`}
                  onClick={() => { if (!loading) setActiveId(conv.id); }}
                >
                  {isMeadow ? (
                    <>
                      <MessageSquare className={styles.mChatIcon} aria-hidden="true" />
                      <span className={styles.mChatText}>
                        <span className={styles.historyItemTitle}>{conv.title}</span>
                        <span className={styles.mChatDate}>{formatChatDate(conv.createdAt)}</span>
                      </span>
                    </>
                  ) : (
                  <span className={styles.historyItemTitle}>{conv.title}</span>
                  )}
                  <button
                    className={styles.historyItemDelete}
                    onClick={(e) => { e.stopPropagation(); handleDeleteChat(conv.id); }}
                    title="Delete chat"
                    aria-label={isMeadow ? `Delete chat: ${conv.title}` : undefined}
                  >
                    {isMeadow ? <Trash2 aria-hidden="true" /> : '×'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Chat area */}
          <div className={styles.chatContainer}>
            {isMeadow && (
              <div className={styles.mChatHead}>
                <div className={styles.mChatHeadText}>
                  <span className={styles.mChatHeadTitle}>{activeConversation?.title ?? 'New chat'}</span>
                  <span className={styles.mChatHeadSub}>Answers use the student portal and the planner database.</span>
                </div>
                <span className={styles.mModelChip}><span className={styles.mModelDot} />{COPILOT_MODEL}</span>
              </div>
            )}
            <div className={styles.messageList}>
              {isMeadow && messages.map((msg, i) => (
                <div key={i} className={`${styles.message} ${msg.role === 'user' ? styles.messageUser : styles.messageAssistant}`}>
                  {msg.role === 'assistant' && <span className={styles.mAvatar} aria-hidden="true"><Sparkles /></span>}
                  <div className={styles.msgBody}>
                    <div className={styles.messageBubble}>
                      <pre className={styles.messageText}>{msg.content}</pre>
                    </div>
                    {renderAnswerLinks(msg)}
                    <div className={styles.messageRole}>
                      {msg.role === 'user' ? 'You' : 'Copilot'}
                      {msg.role === 'assistant' && msg.workflowId && (
                        <span className={styles.workflowTag}>{msg.workflowId}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {isMeadow && messages.length === 1 && !loading && (
                <div className={styles.mStarters}>
                  <span className={styles.mStartersLabel}>Try asking</span>
                  <div className={styles.mStarterGrid}>
                    {STARTERS.map(({ icon: Icon, title, prompt, hint }) => (
                      <button key={title} type="button" className={styles.mStarter} onClick={() => handleStarter(prompt)}>
                        <span className={styles.mStarterIcon} aria-hidden="true"><Icon /></span>
                        <span className={styles.mStarterTitle}>{title}</span>
                        <span className={styles.mStarterHint}>{hint}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {!isMeadow && messages.map((msg, i) => (
                <div
                  key={i}
                  className={`${styles.message} ${msg.role === 'user' ? styles.messageUser : styles.messageAssistant}`}
                >
                  <div className={styles.messageBubble}>
                    <pre className={styles.messageText}>{msg.content}</pre>
                  </div>
                  {renderAnswerLinks(msg)}
                  <div className={styles.messageRole}>
                    {msg.role === 'user' ? 'You' : 'Copilot'}
                    {msg.role === 'assistant' && msg.workflowId && (
                      <span className={styles.workflowTag}>{msg.workflowId}</span>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className={`${styles.message} ${styles.messageAssistant}`}>
                  {isMeadow && <span className={styles.mAvatar} aria-hidden="true"><Sparkles /></span>}
                  <div className={styles.msgBody}>
                  <div className={styles.messageBubble}>
                    {streamingContent !== null ? (
                      <pre className={styles.messageText}>{streamingContent}</pre>
                    ) : statusMessage ? (
                      <div className={styles.statusLine}>
                        <span className={styles.statusDot} />
                        <span className={styles.statusText}>{statusMessage}{elapsed > 0 ? ` ${elapsed}s` : ''}</span>
                      </div>
                    ) : (
                      <div className={styles.typingIndicator}>
                        <span /><span /><span />
                      </div>
                    )}
                  </div>
                  <div className={styles.messageRole}>Copilot</div>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {isMeadow ? (
              <div className={styles.mComposerWrap}>
                <div className={styles.mComposer}>
                  <textarea
                    ref={inputRef}
                    className={styles.input}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask about a student's major, graduation status, or available planners…"
                    rows={2}
                    disabled={loading}
                    aria-label="Message the copilot"
                  />
                  <div className={styles.mComposerBar}>
                    <span className={styles.mComposerHint}>Enter to send · Shift + Enter for a new line</span>
                    <button className={styles.sendBtn} onClick={() => handleSend()} disabled={loading || !input.trim()}>
                      <SendHorizontal aria-hidden="true" />Send
                    </button>
                  </div>
                </div>
              </div>
            ) : (
            <div className={styles.inputRow}>
              <textarea
                ref={inputRef}
                className={styles.input}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about a student's major, graduation status, or available planners…"
                rows={2}
                disabled={loading}
              />
              <button
                className={styles.sendBtn}
                onClick={() => handleSend()}
                disabled={loading || !input.trim()}
              >
                Send
              </button>
            </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
