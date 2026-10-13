/** @jest-environment jsdom */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Sidebar from '@/components/layout/Sidebar';
import { ThemeProvider, useTheme } from '@/styles/themeProvider';
import { NAV_SECTIONS } from '@/lib/navigation';

// The Meadow design only changes colour, type and layout: the switch must
// persist, and the Meadow sidebar must navigate exactly like the classic one.

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('themePreference', 'light');
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({ sessionStatus: 'idle' }) }),
  ) as unknown as typeof fetch;
});

function DesignToggle() {
  const { design, setDesign } = useTheme();
  return (
    <button onClick={() => setDesign(design === 'meadow' ? 'classic' : 'meadow')}>
      design:{design}
    </button>
  );
}

describe('design switch', () => {
  test('defaults to classic and switching to Meadow sets the attribute and persists', async () => {
    render(<ThemeProvider><DesignToggle /></ThemeProvider>);
    await waitFor(() => expect(document.documentElement.dataset.design).toBe('classic'));

    fireEvent.click(screen.getByText('design:classic'));
    await waitFor(() => expect(document.documentElement.dataset.design).toBe('meadow'));
    expect(localStorage.getItem('designPreference')).toBe('meadow');

    fireEvent.click(screen.getByText('design:meadow'));
    await waitFor(() => expect(document.documentElement.dataset.design).toBe('classic'));
    expect(localStorage.getItem('designPreference')).toBe('classic');
  });

  test('a saved Meadow preference is restored on load', async () => {
    localStorage.setItem('designPreference', 'meadow');
    render(<ThemeProvider><DesignToggle /></ThemeProvider>);
    await waitFor(() => expect(screen.getByText('design:meadow')).toBeTruthy());
    expect(document.documentElement.dataset.design).toBe('meadow');
  });
});

describe('Meadow sidebar keeps the same navigation', () => {
  async function renderMeadowSidebar(onNavigate = jest.fn()) {
    localStorage.setItem('designPreference', 'meadow');
    render(
      <ThemeProvider>
        <Sidebar activePanel="dashboard" onNavigate={onNavigate} isCollapsed={false} onToggleCollapse={() => {}} />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByText('Advising')).toBeTruthy());
    return onNavigate;
  }

  test('every NAV_SECTIONS item, User Guide and Settings navigate to their panel', async () => {
    const onNavigate = await renderMeadowSidebar();
    const targets = [
      ...NAV_SECTIONS.flatMap((s) => s.items.map((i) => [i.label, i.id] as const)),
      ['User Guide', 'user-guide'] as const,
      ['Settings', 'settings'] as const,
    ];
    for (const [label, id] of targets) {
      onNavigate.mockClear();
      fireEvent.click(screen.getByRole('button', { name: label }));
      expect(onNavigate).toHaveBeenCalledWith(id);
    }
  });

  test('the active panel is marked as the current page', async () => {
    await renderMeadowSidebar();
    expect(screen.getByRole('button', { name: 'Major Detection' }).getAttribute('aria-current')).toBe('page');
  });

  test('the portal login moved from the top bar still posts to the login endpoint', async () => {
    await renderMeadowSidebar();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Log in to Portal/ }));
    });
    expect(global.fetch).toHaveBeenCalledWith('/api/scraper/login', { method: 'POST' });
  });
});
