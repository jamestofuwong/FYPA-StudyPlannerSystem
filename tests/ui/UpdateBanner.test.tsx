/** @jest-environment jsdom */
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import UpdateBanner from '@/components/layout/UpdateBanner';

type Cb = (p: Record<string, unknown>) => void;
let push: Cb;
const api = { onStatus: jest.fn((cb: Cb) => { push = cb; }), download: jest.fn(), install: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  (window as any).updaterAPI = api;
});
afterEach(() => { delete (window as any).updaterAPI; });

const emit = (p: Record<string, unknown>) => act(() => push(p));

describe('UpdateBanner', () => {
  test('renders nothing in a browser without the Electron bridge', () => {
    delete (window as any).updaterAPI;
    const { container } = render(<UpdateBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  test.each(['idle', 'checking', 'not-available'])('stays hidden while status is %s', (status) => {
    const { container } = render(<UpdateBanner />);
    emit({ status });
    expect(container).toBeEmptyDOMElement();
  });

  test('offers a download when a version is available, and "Later" hides it', () => {
    const { container } = render(<UpdateBanner />);
    emit({ status: 'available', version: '1.4.0' });
    expect(screen.getByText('1.4.0')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    expect(api.download).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
    expect(container).toBeEmptyDOMElement();
  });

  test('shows download progress', () => {
    render(<UpdateBanner />);
    emit({ status: 'downloading', percent: 42 });
    expect(screen.getByText(/42%/)).toBeTruthy();
  });

  test('offers "Restart & Install" once the update is downloaded', () => {
    render(<UpdateBanner />);
    emit({ status: 'downloaded', version: '1.4.0' });
    fireEvent.click(screen.getByRole('button', { name: /restart & install/i }));
    expect(api.install).toHaveBeenCalledTimes(1);
    expect(api.download).not.toHaveBeenCalled();
  });

  test('shows the error message and can be dismissed', () => {
    const { container } = render(<UpdateBanner />);
    emit({ status: 'error', message: 'no network' });
    expect(screen.getByText(/update check failed: no network/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(container).toBeEmptyDOMElement();
  });
});
