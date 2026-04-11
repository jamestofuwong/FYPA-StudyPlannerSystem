'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './PortalLoginModal.module.css';
import { usePortalAuth } from '../providers/PortalAuthContext';
import {
  isMicrosoftLoginUrl,
  isLoggedInPortalUrl,
  TARGET_URL,
} from '../../../core/services/scrapper/advisorScraperService';

type LoginStatus = 'connecting' | 'signing-in' | 'done';

export default function PortalLoginModal() {
  const { isModalOpen, partitionId, setLoggedIn, closeLoginModal } = usePortalAuth();

  const webviewRef                    = useRef<ElectronWebviewTag | null>(null);
  const [webviewReady, setWebviewReady] = useState(false);
  const [runtime, setRuntime]          = useState<'unknown' | 'electron' | 'web'>('unknown');
  const [status, setStatus]            = useState<LoginStatus>('connecting');

  useEffect(() => {
    const w = globalThis as any;
    setRuntime(w?.native?.versions?.electron ? 'electron' : 'web');
  }, []);

  // Reset status label each time the modal is opened
  useEffect(() => {
    if (isModalOpen) setStatus('connecting');
  }, [isModalOpen]);

  // Attach navigation listeners to detect login completion
  useEffect(() => {
    const wv = webviewRef.current;
    if (!wv) return;

    const checkUrl = () => {
      let url = '';
      try { url = wv.getURL(); } catch { return; }
      if (!url) return;
      if (isMicrosoftLoginUrl(url)) {
        setStatus('signing-in');
      } else if (isLoggedInPortalUrl(url)) {
        setStatus('done');
        setLoggedIn(true);
        setTimeout(() => closeLoginModal(), 900);
      }
    };

    const onNavigate = (e: any) => {
      const url = typeof e?.url === 'string' ? e.url : '';
      if (url) {
        if (isMicrosoftLoginUrl(url)) { setStatus('signing-in'); return; }
        if (isLoggedInPortalUrl(url)) {
          setStatus('done');
          setLoggedIn(true);
          setTimeout(() => closeLoginModal(), 900);
        }
      } else {
        checkUrl();
      }
    };

    wv.addEventListener('did-navigate',            onNavigate);
    wv.addEventListener('did-navigate-in-page',    onNavigate);
    wv.addEventListener('did-redirect-navigation', onNavigate);
    wv.addEventListener('did-finish-load',         checkUrl);

    return () => {
      wv.removeEventListener('did-navigate',            onNavigate);
      wv.removeEventListener('did-navigate-in-page',    onNavigate);
      wv.removeEventListener('did-redirect-navigation', onNavigate);
      wv.removeEventListener('did-finish-load',         checkUrl);
    };
  }, [webviewReady, setLoggedIn, closeLoginModal]);

  // Don't render in the web (non-Electron) environment
  if (runtime !== 'electron') return null;

  const statusLabel =
    status === 'done'       ? '● Logged in'   :
    status === 'signing-in' ? '● Signing in…' :
                              '● Connecting…';

  const statusClass =
    status === 'done'       ? styles.pillDone      :
    status === 'signing-in' ? styles.pillSigningIn :
                              styles.pillConnecting;

  // The overlay is ALWAYS in the DOM — hiding via CSS keeps the webview alive
  // and pre-loaded so there is no wait when the user opens the modal.
  return (
    <div
      className={styles.overlay}
      style={{
        visibility:    isModalOpen ? 'visible' : 'hidden',
        opacity:       isModalOpen ? 1 : 0,
        pointerEvents: isModalOpen ? 'auto' : 'none',
        transition: 'opacity 0.15s',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) closeLoginModal(); }}
    >
      <div className={styles.modal}>
        {/* Header */}
        <div className={styles.header}>
          <span className={styles.title}>Sign in to Student Portal</span>
          <span className={`${styles.statusPill} ${statusClass}`}>{statusLabel}</span>
          <button className={styles.closeBtn} onClick={closeLoginModal}>✕</button>
        </div>

        {/* Webview — key forces remount when partition changes (session reset) */}
        <div className={styles.webviewWrap}>
          <webview
            key={partitionId}
            ref={(el: any) => {
              webviewRef.current = el;
              setWebviewReady(!!el);
              if (el && typeof el.setAttribute === 'function') {
                el.setAttribute('allowpopups', 'true');
              }
            }}
            src={TARGET_URL}
            partition={partitionId}
            style={{ width: '100%', height: '100%', display: 'flex' }}
          />
        </div>
      </div>
    </div>
  );
}
