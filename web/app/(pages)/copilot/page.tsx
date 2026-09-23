'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import styles from './page.module.css';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  workflowId?: string;
}

interface OllamaStatus {
  ollama: 'unknown' | 'available' | 'unavailable';
  model: 'unknown' | 'ready' | 'pulling' | 'unavailable';
  pullProgress: number;
  pullError: string | null;
}

type SetupState = 'checking' | 'ollama-unavailable' | 'model-unavailable' | 'pulling' | 'ready';

const WINDOW_SIZE = 10;
const COPILOT_MODEL = 'qwen2.5:3b';

const WELCOME: Message = {
  role: 'assistant',
  content: "Hi! I'm your study planner assistant. I can check a student's detected major, graduation status, completed units, list available planners, or check system status. How can I help?",
};

export default function CopilotPage() {
  const [setupState, setSetupState] = useState<SetupState>('checking');
  const [pullProgress, setPullProgress] = useState(0);
  const [pullError, setPullError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
        // available but model not downloaded
        setSetupState('model-unavailable');
        setDownloading(false);
      }
    } catch {
      setSetupState('ollama-unavailable');
    }
  }, []);

  // Initial check on mount
  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  // Poll every 2 s while pulling
  useEffect(() => {
    if (setupState === 'pulling') {
      pollRef.current = setInterval(checkStatus, 2000);
    } else {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [setupState, checkStatus]);

  // Scroll to bottom as messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

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

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = { role: 'user', content: text };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput('');
    setLoading(true);

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
            const event = JSON.parse(line) as { type: string; message?: string; content?: string; workflowId?: string };
            if (event.type === 'status') {
              setStatusMessage(event.message ?? null);
              setStreamingContent(null);
            } else if (event.type === 'token') {
              setStatusMessage(null);
              setStreamingContent((prev) => (prev ?? '') + (event.content ?? ''));
            } else if (event.type === 'reply') {
              setMessages([...next, { role: 'assistant', content: event.content ?? 'No response received.', workflowId: event.workflowId }]);
              setStatusMessage(null);
              setStreamingContent(null);
            }
          } catch { /* ignore malformed chunks */ }
        }
      }
    } catch {
      setMessages([...next, { role: 'assistant', content: 'Failed to reach the AI service. Check that Ollama is running.' }]);
      setStatusMessage(null);
      setStreamingContent(null);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
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
      <div className={styles.sectionTitle}>AI Copilot</div>

      {/* ── Setup states ── */}
      {setupState === 'checking' && (
        <div className={styles.setupCard}>
          <div className={styles.setupIcon}>⏳</div>
          <div className={styles.setupTitle}>Checking AI status…</div>
        </div>
      )}

      {setupState === 'ollama-unavailable' && (
        <div className={styles.setupCard}>
          <div className={styles.setupIcon}>⚠️</div>
          <div className={styles.setupTitle}>Ollama is not running</div>
          <div className={styles.setupBody}>
            The AI copilot requires Ollama to be running locally. Start Ollama, then come back to this page.
          </div>
          <button className={styles.setupBtn} onClick={checkStatus}>
            Check again
          </button>
        </div>
      )}

      {setupState === 'model-unavailable' && (
        <div className={styles.setupCard}>
          <div className={styles.setupIcon}>🤖</div>
          <div className={styles.setupTitle}>AI model not downloaded</div>
          <div className={styles.setupBody}>
            The copilot uses <strong>{COPILOT_MODEL}</strong>. The model is not installed yet (~2 GB). Download it once and the copilot will be available.
          </div>
          {pullError && <div className={styles.setupError}>{pullError}</div>}
          <button
            className={styles.setupBtn}
            onClick={handleDownload}
            disabled={downloading}
          >
            {downloading ? 'Starting download…' : 'Download model'}
          </button>
        </div>
      )}

      {setupState === 'pulling' && (
        <div className={styles.setupCard}>
          <div className={styles.setupIcon}>⬇️</div>
          <div className={styles.setupTitle}>Downloading {COPILOT_MODEL}…</div>
          <div className={styles.setupBody}>
            This may take a few minutes depending on your connection. Do not close the app.
          </div>
          <div className={styles.progressTrack}>
            <div
              className={styles.progressBar}
              style={{ width: `${pullProgress}%` }}
            />
          </div>
          <div className={styles.progressLabel}>{pullProgress}%</div>
        </div>
      )}

      {/* ── Chat UI (model ready) ── */}
      {setupState === 'ready' && (
        <div className={styles.chatContainer}>
          <div className={styles.messageList}>
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`${styles.message} ${msg.role === 'user' ? styles.messageUser : styles.messageAssistant}`}
              >
                <div className={styles.messageBubble}>
                  <pre className={styles.messageText}>{msg.content}</pre>
                </div>
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
                <div className={styles.messageBubble}>
                  {streamingContent !== null ? (
                    <pre className={styles.messageText}>{streamingContent}</pre>
                  ) : statusMessage ? (
                    <div className={styles.statusLine}>
                      <span className={styles.statusDot} />
                      <span className={styles.statusText}>{statusMessage}</span>
                    </div>
                  ) : (
                    <div className={styles.typingIndicator}>
                      <span /><span /><span />
                    </div>
                  )}
                </div>
                <div className={styles.messageRole}>Copilot</div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

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
              onClick={handleSend}
              disabled={loading || !input.trim()}
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
