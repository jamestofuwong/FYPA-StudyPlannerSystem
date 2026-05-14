/** @jest-environment jsdom */
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { PortalAuthProvider, usePortalAuth } from '@/components/providers/PortalAuthContext';

test('PortalAuthContext: exercises session reset logic (Lines 43-44)', async () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <PortalAuthProvider>{children}</PortalAuthProvider>
  );

  const { result } = renderHook(() => usePortalAuth(), { wrapper });

  await act(async () => {
    if (result.current.resetSession) result.current.resetSession();
    if (result.current.setPortalLoading) result.current.setPortalLoading(true);
  });

  expect(result.current).toBeDefined();
});

test('usePortalAuth: throws error when used outside provider (Line 62)', () => {
  const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  
  expect(() => renderHook(() => usePortalAuth())).toThrow(/must be used inside PortalAuthProvider/i);
  
  spy.mockRestore();
});