'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PortalAuthState = {
  isLoggedIn: boolean;
  partitionId: string;
  isModalOpen: boolean;
  setLoggedIn: (v: boolean) => void;
  openLoginModal: () => void;
  closeLoginModal: () => void;
  resetSession: () => void;
};

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const PortalAuthContext = createContext<PortalAuthState | null>(null);

function makePartitionId(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return `persist:sisportal-advisor-${(crypto as any).randomUUID()}`;
    }
  } catch {}
  return `persist:sisportal-advisor-${Date.now()}`;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function PortalAuthProvider({ children }: { children: ReactNode }) {
  const [isLoggedIn, setLoggedIn] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [partitionId, setPartitionId] = useState(() => {
    try {
      return localStorage.getItem('advisor-partition-id') ?? 'persist:sisportal-advisor';
    } catch {
      return 'persist:sisportal-advisor';
    }
  });

  const openLoginModal  = useCallback(() => setIsModalOpen(true),  []);
  const closeLoginModal = useCallback(() => setIsModalOpen(false), []);

  const resetSession = useCallback(() => {
    const next = makePartitionId();
    try { localStorage.setItem('advisor-partition-id', next); } catch {}
    setPartitionId(next);
    setLoggedIn(false);
  }, []);

  return (
    <PortalAuthContext.Provider
      value={{ isLoggedIn, partitionId, isModalOpen, setLoggedIn, openLoginModal, closeLoginModal, resetSession }}
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
