/** @jest-environment jsdom */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { themes, meadowThemes, paletteFor } from '@/styles/theme';
import { ThemeProvider, useTheme } from '@/styles/themeProvider';
import SettingsPage from '@/app/(pages)/settings/page';

// Classic has two colour modes (light and dark). The old "Original Portal" mode is gone.

beforeEach(() => {
  localStorage.clear();
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({ value: '60', sessionStatus: 'idle' }) }),
  ) as unknown as typeof fetch;
});

describe('colour modes', () => {
  test('Classic has a light and a dark palette and nothing else', () => {
    expect(Object.keys(themes).sort()).toEqual(['dark', 'light']);
    expect(Object.keys(meadowThemes).sort()).toEqual(['dark', 'light']);
    expect(paletteFor('classic', 'dark')).toBe(themes.dark);
    expect(paletteFor('meadow', 'light')).toBe(meadowThemes.light);
  });

  test('a saved "portal" preference from an earlier version falls back to following the system', async () => {
    localStorage.setItem('themePreference', 'portal');
    function Show() { const { preference } = useTheme(); return <span>pref:{preference}</span>; }
    render(<ThemeProvider><Show /></ThemeProvider>);
    await waitFor(() => expect(screen.getByText('pref:system')).toBeTruthy());
  });

  test('Settings offers System, Light and Dark, and no Original Portal', async () => {
    render(<ThemeProvider><SettingsPage /></ThemeProvider>);
    await waitFor(() => expect(screen.getAllByText('Light').length).toBeGreaterThan(0));
    expect(screen.getAllByText('Dark').length).toBeGreaterThan(0);
    expect(screen.getAllByText('System').length).toBeGreaterThan(0);
    expect(screen.queryByText(/original portal/i)).toBeNull();
  });
});
