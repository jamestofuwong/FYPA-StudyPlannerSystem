import { POST } from '../../web/app/api/copilot/chat/route';

// Run the real HTTP handler and real router, substituting only external dependencies.
// The registry is synthetic so importing it cannot restore a real portal session.
const mockExecute = jest.fn();
const mockStudentExecute = jest.fn();
const mockWorkflow = { id: 'list_planners', description: 'List available study planners', params: [], execute: mockExecute };
const mockStudentWorkflow = { id: 'student_major', description: 'Find the major of a student',
  params: [{ name: 'studentId', type: 'string', required: true }], execute: mockStudentExecute };
jest.mock('../../core/services/copilot/workflowRegistry', () => ({
  get allWorkflows() { return [mockWorkflow, mockStudentWorkflow]; },
  workflowRegistry: { get: (id: string) => [mockWorkflow, mockStudentWorkflow].find(w => w.id === id) },
}));
jest.mock('../../core/services/portal/portalSessionService', () => ({ getStatus: () => ({ sessionStatus: 'idle' }) }));
jest.mock('../../core/services/copilot/responseFormatter', () => ({
  streamResponse: async function* () { yield 'Two '; yield 'planners available.'; },
}));
jest.mock('../../web/app/api/ollama/store', () => ({ ollamaStore: { ollama: 'available', model: 'ready' } }));

const mockFetch = jest.fn();
const originalFetch = global.fetch;
beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = mockFetch;
  mockFetch.mockResolvedValue({ ok: true, json: async () => ({ response: 'list_planners' }) });
  mockExecute.mockResolvedValue({ ok: true, data: { count: 2 } });
});
afterAll(() => { global.fetch = originalFetch; });
async function ask(content: string) {
  const response = await POST(new Request('http://localhost/api/copilot/chat', {
    method: 'POST', body: JSON.stringify({ messages: [{ role: 'user', content }] }),
  }));
  return (await response.text()).trim().split('\n').map(line => JSON.parse(line));
}

test('routes a non-student question, executes the workflow and emits a complete streamed reply', async () => {
  const events = await ask('What study planners are available?');
  expect(mockExecute).toHaveBeenCalledWith({}, { ollamaStatus: { ollama: 'available', model: 'ready' } });
  expect(events.filter(e => e.type === 'token').map(e => e.content).join('')).toBe('Two planners available.');
  expect(events.at(-1)).toEqual({ type: 'reply', content: 'Two planners available.', workflowId: 'list_planners' });
});
test('extracts a synthetic student ID and blocks execution while logged out', async () => {
  mockFetch.mockResolvedValue({ ok: true, json: async () => ({ response: 'student_major' }) });
  const events = await ask('What is the major of student 900000001?');
  expect(events.at(-1).content).toContain('Please log in to the portal first');
  expect(mockStudentExecute).not.toHaveBeenCalled();
});
test('asks for a missing student ID before running a workflow', async () => {
  mockFetch.mockResolvedValue({ ok: true, json: async () => ({ response: 'student_major' }) });
  const events = await ask('What is the student major?');
  expect(events.at(-1).content).toContain('studentId');
  expect(mockStudentExecute).not.toHaveBeenCalled();
});
test('unsupported model selection does not execute any workflow', async () => {
  mockFetch.mockResolvedValue({ ok: true, json: async () => ({ response: 'invented_workflow' }) });
  expect((await ask('hi')).at(-1).content).toContain("not able to help");
  expect(mockExecute).not.toHaveBeenCalled();
  expect(mockStudentExecute).not.toHaveBeenCalled();
});
test('model connection failure returns an unavailable reply', async () => {
  mockFetch.mockRejectedValue(new Error('Synthetic connection failure'));
  expect((await ask('List available planners')).at(-1).content).toContain('AI service is currently unavailable');
  expect(mockExecute).not.toHaveBeenCalled();
});
test('workflow failure is returned without a successful answer', async () => {
  mockExecute.mockResolvedValue({ ok: false, error: 'Synthetic planner failure' });
  const events = await ask('List available planners');
  expect(events.at(-1).content).toContain('Synthetic planner failure');
  expect(events.some(e => e.type === 'token')).toBe(false);
});
test('rejects invalid JSON and empty messages', async () => {
  for (const body of ['{', JSON.stringify({ messages: [] })]) {
    const response = await POST(new Request('http://localhost/api/copilot/chat', { method: 'POST', body }));
    expect(response.status).toBe(400);
  }
  expect(mockFetch).not.toHaveBeenCalled();
});
