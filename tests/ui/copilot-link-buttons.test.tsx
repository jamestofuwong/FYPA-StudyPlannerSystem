/** @jest-environment jsdom */
// @ts-nocheck
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import CopilotPage from '@/app/(pages)/copilot/page';
import { ThemeProvider } from '@/styles/themeProvider';

const enc = new TextEncoder();

function ndjson(events) {
  const chunks = events.map((e) => enc.encode(JSON.stringify(e) + '\n'));
  let i = 0;
  return { getReader: () => ({ read: async () => (i < chunks.length ? { done: false, value: chunks[i++] } : { done: true, value: undefined }) }) };
}

function mockServer(events) {
  global.fetch = jest.fn((url) => {
    if (String(url).includes('/api/ollama/status')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ollama: 'available', model: 'ready', pullProgress: 100, pullError: null }) });
    }
    if (String(url).includes('/api/copilot/chat')) {
      return Promise.resolve({ ok: true, body: ndjson(events) });
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
  });
}

async function ask(text) {
  const box = await screen.findByPlaceholderText(/Ask about a student/i);
  fireEvent.change(box, { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
}

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  Element.prototype.scrollIntoView = jest.fn();
});

describe('buttons under a copilot answer', () => {
  it('shows one button per link and opens the page with its query and section', async () => {
    mockServer([
      { type: 'token', content: 'Software Development' },
      {
        type: 'reply',
        content: 'Software Development',
        workflowId: 'get_student_major',
        links: [
          { label: 'View match results', target: 'dashboard', section: 'ranked-planners', query: { studentId: '102780123', enrollMode: 'latest', handoff: 'h1' } },
          { label: 'View planner', target: 'planners', query: { plannerId: 'p1' } },
        ],
      },
    ]);
    render(<CopilotPage />);
    await ask('what major is 102780123');

    fireEvent.click(await screen.findByRole('button', { name: /View match results/ }));
    const href = useRouter().push.mock.calls[0][0];
    expect(href.startsWith('/dashboard?')).toBe(true);
    const params = new URLSearchParams(href.split('?')[1]);
    expect(params.get('handoff')).toBe('h1');
    expect(params.get('section')).toBe('ranked-planners');

    fireEvent.click(screen.getByRole('button', { name: /View planner/ }));
    expect(useRouter().push).toHaveBeenLastCalledWith('/planners?plannerId=p1');
  });

  it('shows as many buttons as the answer carries', async () => {
    const links = Array.from({ length: 5 }, (_, i) => ({ label: `Planner ${i}`, target: 'planners', query: { plannerId: `p${i}` } }));
    mockServer([{ type: 'reply', content: 'Found five', workflowId: 'find_planner_by_major', links }]);
    render(<CopilotPage />);
    await ask('find planners');
    await waitFor(() => expect(screen.getAllByRole('button', { name: /^Planner \d/ })).toHaveLength(5));
  });

  it('shows no buttons when the answer has none', async () => {
    mockServer([{ type: 'reply', content: "Sorry, I can't help with that." }]);
    render(<CopilotPage />);
    await ask('weather?');
    await screen.findByText(/can't help with that/);
    expect(screen.queryByText('→')).toBeNull();
  });

  it('drops malformed links instead of breaking the page', async () => {
    mockServer([{ type: 'reply', content: 'Done', links: [{ label: 'bad', target: 'nowhere' }, { label: 'Good', target: 'units', query: { q: 'COS10009' } }] }]);
    render(<CopilotPage />);
    await ask('unit');
    expect(await screen.findByRole('button', { name: /Good/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /bad/ })).toBeNull();
  });

  it('keeps the buttons after the chat is reloaded from storage', async () => {
    mockServer([{ type: 'reply', content: 'Done', links: [{ label: 'Open Study Planners', target: 'planners' }] }]);
    const first = render(<CopilotPage />);
    await ask('list planners');
    await screen.findByRole('button', { name: /Open Study Planners/ });
    first.unmount();

    mockServer([]);
    render(<CopilotPage />);
    expect(await screen.findByRole('button', { name: /Open Study Planners/ })).toBeTruthy();
  });
});

describe('in the Meadow design', () => {
  beforeEach(() => {
    localStorage.setItem('designPreference', 'meadow');
    localStorage.setItem('themePreference', 'light');
  });

  it('shows the same buttons and opens the same pages', async () => {
    mockServer([
      {
        type: 'reply',
        content: 'Software Development',
        workflowId: 'get_student_major',
        links: [
          { label: 'View match results', target: 'dashboard', section: 'ranked-planners', query: { studentId: '102780123', handoff: 'h1' } },
          { label: 'View planner', target: 'planners', query: { plannerId: 'p1' } },
        ],
      },
    ]);
    render(<ThemeProvider><CopilotPage /></ThemeProvider>);
    await waitFor(() => expect(document.documentElement.dataset.design).toBe('meadow'));
    await ask('what major is 102780123');

    fireEvent.click(await screen.findByRole('button', { name: /View match results/ }));
    expect(useRouter().push.mock.calls.pop()[0]).toContain('/dashboard?');
    fireEvent.click(screen.getByRole('button', { name: /View planner/ }));
    expect(useRouter().push).toHaveBeenLastCalledWith('/planners?plannerId=p1');
  });

  it('shows no buttons when the answer has none', async () => {
    mockServer([{ type: 'reply', content: "Sorry, I can't help with that." }]);
    render(<ThemeProvider><CopilotPage /></ThemeProvider>);
    await waitFor(() => expect(document.documentElement.dataset.design).toBe('meadow'));
    await ask('weather?');
    await screen.findByText(/can't help with that/);
    expect(screen.queryByText('→')).toBeNull();
  });
});
