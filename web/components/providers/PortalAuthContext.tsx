'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PortalAuthState = {
  isLoggedIn: boolean;
  isPortalLoading: boolean;
  partitionId: string;
  isModalOpen: boolean;
  setLoggedIn: (v: boolean) => void;
  setPortalLoading: (v: boolean) => void;
  openLoginModal: () => void;
  closeLoginModal: () => void;
  resetSession: () => void;
};

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const PortalAuthContext = createContext<PortalAuthState | null>(null);

const PORTAL_PARTITION = 'persist:sisportal-advisor';

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function PortalAuthProvider({ children }: { children: ReactNode }) {
  const [isLoggedIn, setLoggedIn] = useState(false);
  const [isPortalLoading, setPortalLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const partitionId = PORTAL_PARTITION;

  const openLoginModal  = useCallback(() => setIsModalOpen(true),  []);
  const closeLoginModal = useCallback(() => setIsModalOpen(false), []);

  const resetSession = useCallback(() => {
    try { window.portalAPI?.clearSession(); } catch {}
    setLoggedIn(false);
  }, []);

  return (
    <PortalAuthContext.Provider
      value={{ isLoggedIn, isPortalLoading, partitionId, isModalOpen, setLoggedIn, setPortalLoading, openLoginModal, closeLoginModal, resetSession }}
    >
      {children}
    </PortalAuthContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePortalAuth(): PortalAuthState {
  const ctx = useContext(PortalAuthContext);
  if (!ctx) throw new Error('usePortalAuth must be used inside PortalAuthProvider');
  return ctx;
}
