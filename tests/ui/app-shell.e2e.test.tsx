/** @jest-environment jsdom */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AppLayout from '@/app/(pages)/layout';

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  prefetch: jest.fn(),
};

let mockPathname = '/dashboard';

jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => mockPathname,
  useSearchParams: () => new URLSearchParams(),
}));

function mockFetch({
  privacyAcknowledged = true,
  sessionStatus = 'idle',
  acknowledgeOk = true,
}: {
  privacyAcknowledged?: boolean;
  sessionStatus?: 'idle' | 'login-pending' | 'logged-in' | 'login-error';
  acknowledgeOk?: boolean;
} = {}) {
  global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url === '/api/privacy/status') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ acknowledged: privacyAcknowledged }),
      } as Response);
    }

    if (url === '/api/privacy/acknowledge') {
      return Promise.resolve({
        ok: acknowledgeOk,
        json: () => Promise.resolve({ acknowledged: acknowledgeOk }),
      } as Response);
    }

    if (url === '/api/scraper/status') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ sessionStatus }),
      } as Response);
    }

    if (url === '/api/scraper/login' || url === '/api/scraper/logout') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      } as Response);
    }

    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({}),
    } as Response);
  });
}

describe('main app shell end-to-end user flows', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPathname = '/dashboard';
    delete (window as any).dbAPI;
    delete (window as any).shutdownAPI;
    delete (window as any).updaterAPI;
    delete (globalThis as any).native;
  });

  test('starts on the dashboard shell and lets a user acknowledge the privacy notice', async () => {
    mockFetch({ privacyAcknowledged: false });

    const { container } = render(
      <AppLayout>
        <main>Dashboard page content</main>
      </AppLayout>
    );

    expect(await screen.findByText('Study Planner System')).toBeInTheDocument();
    expect(screen.getByText('Dashboard page content')).toBeInTheDocument();
    expect(await screen.findByText('Privacy Notice')).toBeInTheDocument();

    const acknowledge = screen.getByRole('button', { name: /acknowledge/i });
    expect(acknowledge).toBeDisabled();

    const bodies = container.querySelectorAll('.body');
    const privacyBody = bodies[bodies.length - 1] as HTMLElement;
    Object.defineProperties(privacyBody, {
      scrollTop: { configurable: true, value: 900 },
      clientHeight: { configurable: true, value: 300 },
      scrollHeight: { configurable: true, value: 1000 },
    });
    fireEvent.scroll(privacyBody);

    await waitFor(() => expect(acknowledge).toBeEnabled());
    fireEvent.click(acknowledge);

    await waitFor(() => {
      expect(screen.queryByText('Privacy Notice')).not.toBeInTheDocument();
    });
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/privacy/acknowledge',
      expect.objectContaining({ method: 'POST' })
    );
  });

  test('navigates through shell panels, opens tabs, switches tabs, and closes the active tab', async () => {
    mockFetch();

    const view = render(
      <AppLayout>
        <main>Dashboard page content</main>
      </AppLayout>
    );

    await screen.findByText('Study Planner System');
    fireEvent.click(screen.getByRole('button', { name: /study planners/i }));
    expect(mockRouter.push).toHaveBeenCalledWith('/planners');

    mockPathname = '/planners';
    view.rerender(
      <AppLayout>
        <main>Study planners page content</main>
      </AppLayout>
    );

    expect(await screen.findByText('Study planners page content')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /study planners/i })).toHaveAttribute(
      'aria-selected',
      'true'
    );

    fireEvent.click(screen.getByRole('tab', { name: /dashboard/i }));
    expect(mockRouter.push).toHaveBeenCalledWith('/dashboard');

    fireEvent.click(screen.getByLabelText(/close study planners/i));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith('/dashboard'));

    fireEvent.click(screen.getByRole('button', { name: /settings/i }));
    expect(mockRouter.push).toHaveBeenCalledWith('/settings');
  });

  test('uses the portal session controls from the top bar', async () => {
    mockFetch({ sessionStatus: 'idle' });

    const view = render(
      <AppLayout>
        <main>Dashboard page content</main>
      </AppLayout>
    );

    const login = await screen.findByRole('button', { name: /log in to portal/i });
    fireEvent.click(login);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/scraper/login', { method: 'POST' });
    });
    expect(screen.getByText(/logging in/i)).toBeInTheDocument();

    view.unmount();
    mockFetch({ sessionStatus: 'logged-in' });
    render(
      <AppLayout>
        <main>Dashboard page content</main>
      </AppLayout>
    );

    const logout = await screen.findByRole('button', { name: /log out/i });
    fireEvent.click(logout);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/scraper/logout', { method: 'POST' });
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /log in to portal/i })).toBeInTheDocument();
    });
  });
});

describe('main app shell failed paths', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPathname = '/dashboard';
    delete (window as any).dbAPI;
    delete (window as any).shutdownAPI;
    delete (window as any).updaterAPI;
    delete (globalThis as any).native;
  });

  test('shows the database startup overlay when the embedded database is not ready', async () => {
    mockFetch();
    (window as any).dbAPI = {
      isReady: jest.fn().mockResolvedValue(false),
      onReady: jest.fn(),
    };

    render(
      <AppLayout>
        <main>Dashboard page content</main>
      </AppLayout>
    );

    expect(await screen.findByText(/starting database/i)).toBeInTheDocument();
    expect((window as any).dbAPI.onReady).toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalledWith('/api/privacy/status');
  });

  test('continues into the app when privacy status lookup fails', async () => {
    global.fetch = jest.fn((input: RequestInfo | URL) => {
      const url = String(input);

      if (url === '/api/privacy/status') {
        return Promise.reject(new Error('privacy status unavailable'));
      }

      if (url === '/api/scraper/status') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ sessionStatus: 'idle' }),
        } as Response);
      }

      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      } as Response);
    });

    render(
      <AppLayout>
        <main>Dashboard page content</main>
      </AppLayout>
    );

    expect(await screen.findByText('Dashboard page content')).toBeInTheDocument();
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/privacy/status');
    });
    expect(screen.queryByText('Privacy Notice')).not.toBeInTheDocument();
  });

  test('falls back to the dashboard shell for an invalid route', async () => {
    mockFetch();
    mockPathname = '/not-a-real-panel';

    render(
      <AppLayout>
        <main>Fallback dashboard content</main>
      </AppLayout>
    );

    expect(await screen.findByText('Fallback dashboard content')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /dashboard/i })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getAllByText(/Dashboard/).length).toBeGreaterThan(0);
  });

  test('keeps shell navigation usable after the active tab is closed', async () => {
    mockFetch();

    render(
      <AppLayout>
        <main>Dashboard page content</main>
      </AppLayout>
    );

    await screen.findByText('Dashboard page content');
    fireEvent.click(screen.getByLabelText(/close dashboard/i));
    fireEvent.click(screen.getByRole('button', { name: /study planners/i }));

    expect(mockRouter.push).toHaveBeenCalledWith('/planners');
  });

  test('shows shutdown progress even when only one service reports completion', async () => {
    mockFetch();
    const shutdownCallbacks: {
      onShuttingDown?: () => void;
      onProgress?: (data: { service: string; done: boolean }) => void;
    } = {};

    (window as any).shutdownAPI = {
      onShuttingDown: jest.fn((callback: () => void) => {
        shutdownCallbacks.onShuttingDown = callback;
      }),
      onProgress: jest.fn((callback: (data: { service: string; done: boolean }) => void) => {
        shutdownCallbacks.onProgress = callback;
      }),
    };

    render(
      <AppLayout>
        <main>Dashboard page content</main>
      </AppLayout>
    );

    await screen.findByText('Dashboard page content');

    act(() => {
      shutdownCallbacks.onShuttingDown?.();
      shutdownCallbacks.onProgress?.({ service: 'server', done: true });
    });

    expect(screen.getByText(/shutting down/i)).toBeInTheDocument();
    expect(screen.getByText('Web server')).toBeInTheDocument();
    expect(screen.getByText('Database')).toBeInTheDocument();
    expect(screen.getByText('AI engine')).toBeInTheDocument();
  });
});
