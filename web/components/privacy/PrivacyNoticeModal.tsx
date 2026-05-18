'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './PrivacyNoticeModal.module.css';
import { PRIVACY_NOTICE, NOTICE_VERSION } from '../../lib/privacyNoticeContent';

type Lang = 'en' | 'ms';

interface Props {
  presentedAt: Date;
  onAcknowledged: () => void;
}

export default function PrivacyNoticeModal({ presentedAt, onAcknowledged }: Props) {
  const [lang, setLang] = useState<Lang>('en');
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const notice = PRIVACY_NOTICE[lang];

  // Reset scroll gate when language switches
  useEffect(() => {
    setScrolledToBottom(false);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [lang]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 12) {
      setScrolledToBottom(true);
    }
  }

  async function handleAcknowledge() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/privacy/acknowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ presented_at: presentedAt.toISOString() }),
      });
      if (!res.ok) throw new Error('Failed to record acknowledgement.');
      onAcknowledged();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'An error occurred. Please try again.');
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>

        {/* Title bar */}
        <div className={styles.titleBar}>
          <span className={styles.titleText}>{notice.title}</span>
          <span className={styles.versionPill}>v{NOTICE_VERSION} · PDPA 2010</span>
          <div className={styles.langToggle}>
            {(['en', 'ms'] as Lang[]).map(l => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={`${styles.langBtn} ${lang === l ? styles.langBtnActive : ''}`}
              >
                {l === 'en' ? 'English' : 'BM'}
              </button>
            ))}
          </div>
        </div>

        {/* Subtitle */}
        <div className={styles.subtitle}>{notice.subtitle}</div>

        {/* Scrollable body */}
        <div ref={scrollRef} onScroll={handleScroll} className={styles.body}>
          {notice.sections.map(section => (
            <div key={section.heading} className={styles.section}>
              <div className={styles.sectionHeading}>{section.heading}</div>
              {section.body.map((para, i) => (
                <p key={i} className={styles.para}>{para}</p>
              ))}
            </div>
          ))}

          {/* DPO card */}
          <div className={styles.section}>
            <div className={styles.sectionHeading}>{notice.dpo.heading}</div>
            <div className={styles.dpoCard}>
              <div className={styles.dpoName}>{notice.dpo.name}</div>
              <div>
                Email:{' '}
                <a href={`mailto:${notice.dpo.email}`} className={styles.dpoLink}>
                  {notice.dpo.email}
                </a>
              </div>
              <div className={styles.dpoMuted}>{notice.dpo.address}</div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          {!scrolledToBottom && (
            <p className={styles.scrollHint}>
              Scroll to the bottom to enable the acknowledge button.
            </p>
          )}
          {error && <div className={styles.error}>{error}</div>}
          <button
            onClick={handleAcknowledge}
            disabled={!scrolledToBottom || submitting}
            className={`${styles.ackBtn} ${scrolledToBottom ? styles.ackBtnReady : styles.ackBtnDisabled}`}
          >
            {submitting ? 'Recording…' : notice.buttonLabel}
          </button>
        </div>

      </div>
    </div>
  );
}
