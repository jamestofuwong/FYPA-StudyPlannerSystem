/**
 * The chat route attaches buttons to a successful answer and starts preparing
 * the dashboard data they open. Routing, the workflows and the language model are mocked.
 */

const mockRoute = jest.fn();
const mockExecute = jest.fn();
const mockRequestHandoff = jest.fn();
const mockStatus = jest.fn();

jest.mock('../../core/services/copilot/copilotService', () => ({
  routeAndExtract: (...a: unknown[]) => mockRoute(...a),
}));
jest.mock('../../core/services/copilot/responseFormatter', () => ({
  streamResponse: async function* () {
    yield 'The major is ';
    yield 'Software.';
  },
}));
jest.mock('../../core/services/copilot/workflowRegistry', () => {
  const make = (id: string, params: string[]) => ({
    id,
    description: id,
    params: params.map((name) => ({ name, type: 'string', required: true, description: '' })),
    execute: (...a: unknown[]) => mockExecute(...a),
  });
  const list = [make('get_student_major', ['studentId']), make('list_planners', [])];
  return { workflowRegistry: new Map(list.map((w) => [w.id, w])), allWorkflows: list };
});
jest.mock('../../core/services/copilot/handoff', () => ({
  requestDashboardHandoff: (...a: unknown[]) => mockRequestHandoff(...a),
}));
jest.mock('../../core/services/portal/portalSessionService', () => ({
  getStatus: () => mockStatus(),
}));
jest.mock('../../web/app/api/ollama/store', () => ({
  ollamaStore: { ollama: 'available', model: 'ready' },
}));

import { POST } from '../../web/app/api/copilot/chat/route';

async function ask(): Promise<any[]> {
  const res = await POST(
    new Request('http://localhost/api/copilot/chat', {
      method: 'POST',
      body: JSON.stringify({ messages: [{ role: 'user', content: 'what major is 102780123' }] }),
    }),
  );
  const text = await res.text();
  return text.trim().split('\n').map((l) => JSON.parse(l));
}

const replyOf = (events: any[]) => events.filter((e) => e.type === 'reply').pop();

beforeEach(() => {
  jest.clearAllMocks();
  mockStatus.mockReturnValue({ sessionStatus: 'logged-in' });
  mockRequestHandoff.mockReturnValue('handoff-1');
  mockExecute.mockResolvedValue({ ok: true, data: { detectedMajor: 'Software' } });
});

describe('POST /api/copilot/chat', () => {
  it('sends the buttons with the final reply, and prepares the student for the dashboard one', async () => {
    mockRoute.mockResolvedValue({ canHandle: true, workflowId: 'get_student_major', params: { studentId: '102780123' }, missingParams: [] });
    const reply = replyOf(await ask());

    expect(reply.content).toBe('The major is Software.');
    expect(mockRequestHandoff).toHaveBeenCalledWith({ studentId: '102780123', enrollMode: 'latest' });
    expect(reply.links).toEqual([
      {
        label: 'View match results',
        target: 'dashboard',
        section: 'ranked-planners',
        query: { studentId: '102780123', enrollMode: 'latest', handoff: 'handoff-1' },
      },
    ]);
    // the instruction to prepare the student is for the server only
    expect(JSON.stringify(reply.links)).not.toContain('"student"');
  });

  it('sends a plain link when the answer needs no prepared data', async () => {
    mockRoute.mockResolvedValue({ canHandle: true, workflowId: 'list_planners', params: {}, missingParams: [] });
    const reply = replyOf(await ask());
    expect(reply.links).toEqual([{ label: 'Open Study Planners', target: 'planners' }]);
    expect(mockRequestHandoff).not.toHaveBeenCalled();
  });

  it('still answers, without that button, if preparing the student cannot start', async () => {
    mockRoute.mockResolvedValue({ canHandle: true, workflowId: 'get_student_major', params: { studentId: '102780123' }, missingParams: [] });
    mockRequestHandoff.mockImplementation(() => { throw new Error('boom'); });
    const reply = replyOf(await ask());
    expect(reply.content).toBe('The major is Software.');
    expect(reply.links[0].query).toEqual({ studentId: '102780123', enrollMode: 'latest' });
  });

  it.each([
    ['a question it cannot handle', { canHandle: false, workflowId: null, params: {}, missingParams: [] }],
    ['a question missing details', { canHandle: true, workflowId: 'get_student_major', params: {}, missingParams: ['studentId'] }],
  ])('adds no buttons for %s', async (_name, route) => {
    mockRoute.mockResolvedValue(route);
    const reply = replyOf(await ask());
    expect(reply.links).toBeUndefined();
  });

  it('adds no buttons when the workflow fails', async () => {
    mockRoute.mockResolvedValue({ canHandle: true, workflowId: 'get_student_major', params: { studentId: '102780123' }, missingParams: [] });
    mockExecute.mockResolvedValue({ ok: false, error: 'Student not found' });
    const reply = replyOf(await ask());
    expect(reply.content).toMatch(/Student not found/);
    expect(reply.links).toBeUndefined();
    expect(mockRequestHandoff).not.toHaveBeenCalled();
  });
});
