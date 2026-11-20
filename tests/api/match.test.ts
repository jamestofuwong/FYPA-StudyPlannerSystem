/**
 * /api/match checks the student it is sent before running the match. The matcher itself is mocked.
 */

const mockRunDashboardMatch = jest.fn();
jest.mock('../../core/services/matching/dashboardMatch', () => ({
  runDashboardMatch: (...a: unknown[]) => mockRunDashboardMatch(...a),
}));

import { POST } from '../../web/app/api/match/route';

const post = (body: unknown) =>
  POST(new Request('http://localhost/api/match', { method: 'POST', body: JSON.stringify(body) }));

const valid = { studentID: 'S1', intakeYear: 2024, intakeSemester: 2, completedUnitCodes: ['COS10009'], hasWIL: false };

describe('POST /api/match', () => {
  beforeEach(() => {
    mockRunDashboardMatch.mockReset().mockResolvedValue({ data: { status: 'detected' }, processingTime: 1 });
  });

  test('runs the match for a well-formed student', async () => {
    const res = await post({ student: valid });
    expect(res.status).toBe(200);
    expect(mockRunDashboardMatch).toHaveBeenCalledWith(valid);
  });

  // Regression: anything but a missing student reached the matcher and failed there with a 500.
  test.each([
    ['no student', {}],
    ['completed units that are not a list', { student: { ...valid, completedUnitCodes: 'COS10009' } }],
    ['a unit code that is not text', { student: { ...valid, completedUnitCodes: [42] } }],
    ['an intake year that is not a whole number', { student: { ...valid, intakeYear: '2024' } }],
    ['an intake semester other than 1 or 2', { student: { ...valid, intakeSemester: 3 } }],
  ])('rejects %s with 400, without running the match', async (_label, body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(mockRunDashboardMatch).not.toHaveBeenCalled();
  });
});
