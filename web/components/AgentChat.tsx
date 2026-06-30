'use client';

import { useState, useRef, useEffect } from 'react';
import styles from './AgentChat.module.css';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface AgentChatProps {
  isOpen: boolean;
  onClose: () => void;
}

const TOOL_LABELS: Record<string, string> = {
  fetch_student:        'Scraping student data…',
  run_major_detection:  'Running major detection…',
  get_all_planners:     'Fetching study planners…',
  export_student_report:'Preparing export…',
};

export default function AgentChat({ isOpen, onClose }: AgentChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [statusLabel, setStatusLabel] = useState<string>('Thinking…');
  const [history, setHistory] = useState<any[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading, statusLabel]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setIsLoading(true);
    setStatusLabel('Thinking…');

    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history }),
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.error ?? 'Unknown error'}` }]);
        return;
      }

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
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));

            if (event.type === 'thinking') {
              setStatusLabel('Thinking…');
            } else if (event.type === 'tool_start') {
              setStatusLabel(TOOL_LABELS[event.tool] ?? `Running ${event.tool}…`);
            } else if (event.type === 'tool_done') {
              setStatusLabel('Thinking…');
            } else if (event.type === 'reply') {
              setMessages(prev => [...prev, { role: 'assistant', content: event.reply }]);
              setHistory(event.history ?? []);
              if (event.pendingExport) handlePendingExport(event.pendingExport);
            } else if (event.type === 'error') {
              setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${event.error}` }]);
            }
          } catch { /* malformed SSE line — skip */ }
        }
      }
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Network error: ${e.message}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePendingExport = async (pendingExport: any) => {
    try {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student: pendingExport.student,
          dashboardData: pendingExport.matchResult?.data,
          sections: pendingExport.sections,
        }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `StudentReport.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch { /* silent */ }
  };

  const handleClear = async () => {
    await fetch('/api/agent', { method: 'DELETE' });
    setMessages([]);
    setHistory([]);
  };

  if (!isOpen) return null;

  return (
    <div className={styles.drawer}>
      <div className={styles.header}>
        <span className={styles.title}>AI Advisor Agent</span>
        <div className={styles.headerActions}>
          <button className={styles.clearBtn} onClick={handleClear} title="Clear conversation">Clear</button>
          <button className={styles.closeBtn} onClick={onClose} title="Close">&#x2715;</button>
        </div>
      </div>
      <div className={styles.messages}>
        {messages.length === 0 && (
          <div className={styles.emptyState}>
            <p>Ask me about a student&apos;s academic progress.</p>
            <p className={styles.example}>Example: &quot;Check if student 12345678 is on track for graduation&quot;</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? styles.userMessage : styles.assistantMessage}>
            <span className={styles.roleLabel}>{m.role === 'user' ? 'You' : 'Agent'}</span>
            <div className={styles.messageContent}>{m.content}</div>
          </div>
        ))}
        {isLoading && (
          <div className={styles.assistantMessage}>
            <span className={styles.roleLabel}>Agent</span>
            <div className={styles.thinking}>
              <span className={styles.dot} />
              <span className={styles.dot} />
              <span className={styles.dot} />
              <span className={styles.statusLabel}>{statusLabel}</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className={styles.inputArea}>
        <input
          className={styles.input}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
          placeholder="Ask about a student..."
          disabled={isLoading}
        />
        <button className={styles.sendBtn} onClick={sendMessage} disabled={isLoading || !input.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}
