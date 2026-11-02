import { auditGraduation, type AuditPlanner } from '../../../core/services/graduation/graduationAudit';

// A student who has passed everything the planner lists. Only the credit total changes in these tests.
const planned = (code: string, category: string, semester = 1) => ({ unit: { unit_code: code, unit_name: code }, category, semester });
const planner: AuditPlanner = { units: [planned('CORE1', 'core'), planned('MAJ1', 'major_core', 2)], elective_groups: [], core_cp: 12.5, major_cp: 12.5, elective_cp: 0, wil_cp: 0 };
const pass = (code: string, earned = 12.5) => ({ courseId: code, courseTitle: code, level: '', credits: 12.5, creditsEarned: earned, status: 'Complete', grade: 'D', term: '2025_SEP_S2' });
const rows = [pass('CORE1'), pass('MAJ1')];

describe('the credit total of a graduation check', () => {
  test('the default requirement is 300 credit points: 300 is enough', () => {
    expect(auditGraduation(planner, rows, { creditsCompleted: 300 }).eligible).toBe(true);
  });

  test('the default requirement is 300 credit points: 299.5 is not, and the reason says how far short', () => {
    const a = auditGraduation(planner, rows, { creditsCompleted: 299.5 });
    expect(a.eligible).toBe(false);
    expect(a.creditsRequired).toBe(300);
    expect(a.reasons).toContain('299.5 of 300 credits completed');
  });

  test('a course with another requirement uses it', () => {
    expect(auditGraduation(planner, rows, { creditsCompleted: 240, creditsRequired: 240 }).eligible).toBe(true);
    expect(auditGraduation(planner, rows, { creditsCompleted: 239, creditsRequired: 240 }).eligible).toBe(false);
  });

  test.each([[0], [null], [undefined]])('a missing requirement (%s) falls back to 300, never to "no requirement"', (creditsRequired) => {
    const a = auditGraduation(planner, rows, { creditsCompleted: 120, creditsRequired });
    expect(a.creditsRequired).toBe(300);
    expect(a.eligible).toBe(false);
  });

  test('when the portal gives no total, the total is the credit the transcript earned', () => {
    const a = auditGraduation(planner, [pass('CORE1', 12.5), pass('MAJ1', 12.5)], {});
    expect(a.creditsCompleted).toBe(25);
    expect(a.eligible).toBe(false);
  });

  test('credit that was not earned (a fail) does not count towards the transcript total', () => {
    const a = auditGraduation(planner, [pass('CORE1', 12.5), { ...pass('MAJ1', 0), grade: 'N' }], {});
    expect(a.creditsCompleted).toBe(12.5);
  });
});
