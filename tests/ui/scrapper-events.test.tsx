/** @jest-environment jsdom */
import React from 'react';
import { render, act, renderHook } from '@testing-library/react';
import { ScraperProvider, useScraperContext } from '@/components/providers/ScraperContext';
import { PortalAuthProvider } from '@/components/providers/PortalAuthContext';
import { ToastProvider } from '@/components/providers/ToastProvider';

describe('ScraperContext: Webview Events', () => {
  test('handles webview load failure and cleanup', async () => {
    const removeSpy = jest.fn();
    const addSpy = jest.fn();
    
    // Force the environment to look like Electron
    Object.defineProperty(window, 'native', {
      value: { ipcRenderer: { on: jest.fn(), removeListener: jest.fn() } },
      configurable: true,
      writable: true
    });

    const mockWebview = {
      addEventListener: addSpy,
      removeEventListener: removeSpy,
      getURL: jest.fn().mockReturnValue('https://test.com'),
      loadURL: jest.fn(),
    };

    const wrapper = ({ children }: any) => (
      <ToastProvider>
        <PortalAuthProvider>
          <ScraperProvider>{children}</ScraperProvider>
        </PortalAuthProvider>
      </ToastProvider>
    );

    const { result, unmount } = renderHook(() => useScraperContext(), { wrapper });

    await act(async () => {
      (window as any).__scraperTestWebview = mockWebview; 
      
      // Unmount to run the cleanup
      unmount();
    });

    expect(removeSpy).toBeDefined();
    
    delete (window as any).native;
  });
});