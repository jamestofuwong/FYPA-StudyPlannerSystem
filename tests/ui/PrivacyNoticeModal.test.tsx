/** @jest-environment jsdom */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PrivacyNoticeModal from '@/components/privacy/PrivacyNoticeModal';
import { PRIVACY_NOTICE } from '@/lib/privacyNoticeContent';

const presentedAt = new Date('2026-10-01T08:00:00.000Z');
const ackButton = (label: string) => screen.getByRole('button', { name: new RegExp(label.slice(0, 12), 'i') });

/** jsdom has no layout, so give the scroll box a size and scroll position by hand. */
function scrollBody(container: HTMLElement, { top, client, height }: { top: number; client: number; height: number }) {
  const body = Array.from(container.querySelectorAll('div')).find((d) => d.className.includes('body'))!;
  Object.defineProperty(body, 'clientHeight', { configurable: true, value: client });
  Object.defineProperty(body, 'scrollHeight', { configurable: true, value: height });
  body.scrollTop = top;
  fireEvent.scroll(body);
}

beforeEach(() => { global.fetch = jest.fn().mockResolvedValue({ ok: true }) as never; });

describe('PrivacyNoticeModal (PDPA gate)', () => {
  test('shows the notice in English and the acknowledge button is disabled until the end is reached', () => {
    render(<PrivacyNoticeModal presentedAt={presentedAt} onAcknowledged={jest.fn()} />);
    expect(screen.getByText(PRIVACY_NOTICE.en.title)).toBeTruthy();
    expect(ackButton(PRIVACY_NOTICE.en.buttonLabel)).toBeDisabled();
    expect(screen.getByText(/scroll to the bottom/i)).toBeTruthy();
  });

  test('scrolling part of the way does not unlock it; reaching the bottom does', () => {
    const { container } = render(<PrivacyNoticeModal presentedAt={presentedAt} onAcknowledged={jest.fn()} />);
    scrollBody(container, { top: 100, client: 400, height: 1000 });
    expect(ackButton(PRIVACY_NOTICE.en.buttonLabel)).toBeDisabled();
    scrollBody(container, { top: 600, client: 400, height: 1000 });
    expect(ackButton(PRIVACY_NOTICE.en.buttonLabel)).toBeEnabled();
    expect(screen.queryByText(/scroll to the bottom/i)).toBeNull();
  });

  test('switching language shows the Malay text and locks the button again', () => {
    const { container } = render(<PrivacyNoticeModal presentedAt={presentedAt} onAcknowledged={jest.fn()} />);
    scrollBody(container, { top: 600, client: 400, height: 1000 });
    fireEvent.click(screen.getByRole('button', { name: 'BM' }));
    expect(screen.getByText(PRIVACY_NOTICE.ms.title)).toBeTruthy();
    expect(ackButton(PRIVACY_NOTICE.ms.buttonLabel)).toBeDisabled();
  });

  test('acknowledging sends the time the notice was shown, then tells the parent', async () => {
    const onAcknowledged = jest.fn();
    const { container } = render(<PrivacyNoticeModal presentedAt={presentedAt} onAcknowledged={onAcknowledged} />);
    scrollBody(container, { top: 600, client: 400, height: 1000 });
    fireEvent.click(ackButton(PRIVACY_NOTICE.en.buttonLabel));
    await waitFor(() => expect(onAcknowledged).toHaveBeenCalledTimes(1));
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('/api/privacy/acknowledge');
    expect(JSON.parse(init.body)).toEqual({ presented_at: '2026-10-01T08:00:00.000Z' });
  });

  test('if the server refuses, the modal stays, shows an error and lets the user retry', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false });
    const onAcknowledged = jest.fn();
    const { container } = render(<PrivacyNoticeModal presentedAt={presentedAt} onAcknowledged={onAcknowledged} />);
    scrollBody(container, { top: 600, client: 400, height: 1000 });
    fireEvent.click(ackButton(PRIVACY_NOTICE.en.buttonLabel));
    expect(await screen.findByText(/failed to record/i)).toBeTruthy();
    expect(onAcknowledged).not.toHaveBeenCalled();
    expect(ackButton(PRIVACY_NOTICE.en.buttonLabel)).toBeEnabled();
  });

  test('a network error is reported the same way', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('offline'));
    const { container } = render(<PrivacyNoticeModal presentedAt={presentedAt} onAcknowledged={jest.fn()} />);
    scrollBody(container, { top: 600, client: 400, height: 1000 });
    fireEvent.click(ackButton(PRIVACY_NOTICE.en.buttonLabel));
    expect(await screen.findByText('offline')).toBeTruthy();
  });
});
