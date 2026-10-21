import { auditGraduation, type AuditPlanner } from '../../../core/services/graduation/graduationAudit';

const planned = (code: string, category: string, semester = 1) => ({ unit: { unit_code: code, unit_name: `${code} name` }, category, semester });
const base = (over: Partial<AuditPlanner> = {}): AuditPlanner => ({
  units: [planned('CORE1', 'core'), planned('MAJ1', 'major_core', 2), planned('PRE1', 'prescribed_elective'), planned('ELE1', 'elective', 2), planned('WIL1', 'wil', 3)],
  elective_groups: [], core_cp: 12.5, major_cp: 12.5, elective_cp: 25, wil_cp: 25, ...over,
});
const row = (courseId: string, grade: string, status = 'Complete', creditsEarned?: number) => ({
  courseId, courseTitle: courseId, level: '', credits: courseId === 'WIL1' ? 25 : 12.5,
  creditsEarned: creditsEarned ?? (['N', 'SN', ''].includes(grade) && status !== 'Complete' ? 0 : grade === 'N' || grade === 'SN' ? 0 : courseId === 'WIL1' ? 25 : 12.5),
  status, grade, term: '2025_SEP_S2',
});
const allPassed = () => [row('CORE1', 'D'), row('MAJ1', 'C'), row('PRE1', 'P'), row('ELE1', 'D'), row('WIL1', 'HD')];

describe('auditGraduation', () => {
  it('is eligible when every requirement is met', () => {
    const a = auditGraduation(base(), allPassed(), { creditsCompleted: 300 });
    expect(a.eligible).toBe(true);
    expect(a.reasons).toEqual([]);
  });

  it('lists a core unit that has not been passed', () => {
    const a = auditGraduation(base(), allPassed().filter((r) => r.courseId !== 'CORE1'), { creditsCompleted: 300 });
    expect(a.eligible).toBe(false);
    expect(a.coreMissing.map((u) => u.code)).toEqual(['CORE1']);
  });

  it('a failed unit stays missing, and a later pass clears it', () => {
    const failed = auditGraduation(base(), [...allPassed().filter((r) => r.courseId !== 'CORE1'), row('CORE1', 'N')], { creditsCompleted: 300 });
    expect(failed.coreMissing.map((u) => u.code)).toEqual(['CORE1']);
    const retaken = auditGraduation(base(), [...allPassed(), row('CORE1', 'N'), row('CORE1', 'SP')], { creditsCompleted: 300 });
    expect(retaken.eligible).toBe(true);
  });

  it('requires the work placement', () => {
    const a = auditGraduation(base(), allPassed().filter((r) => r.courseId !== 'WIL1'), { creditsCompleted: 300 });
    expect(a.eligible).toBe(false);
    expect(a.wilMissing?.code).toBe('WIL1');
  });

  it('is not eligible while a unit is in progress', () => {
    const rows = [...allPassed().filter((r) => r.courseId !== 'ELE1'), row('ELE1', '', 'Current', 0), row('XTRA', 'D')];
    const a = auditGraduation(base({ elective_cp: 12.5 }), rows, { creditsCompleted: 300 });
    expect(a.inProgress).toEqual(['ELE1']);
    expect(a.eligible).toBe(false);
  });

  describe('Conceded Passes', () => {
    it('allows one', () => {
      const rows = allPassed().map((r) => (r.courseId === 'ELE1' ? { ...r, grade: 'CP' } : r));
      const a = auditGraduation(base(), rows, { creditsCompleted: 300 });
      expect(a.concededPasses).toEqual(['ELE1']);
      expect(a.concededOverLimit).toBe(false);
      expect(a.eligible).toBe(true);
    });
    it('blocks graduation with two', () => {
      const rows = allPassed().map((r) => (['ELE1', 'PRE1'].includes(r.courseId) ? { ...r, grade: 'CP' } : r));
      const a = auditGraduation(base(), rows, { creditsCompleted: 300 });
      expect(a.concededOverLimit).toBe(true);
      expect(a.eligible).toBe(false);
      expect(a.reasons.join(' ')).toMatch(/2 Conceded Passes/);
    });
  });

  describe('elective credit', () => {
    it('is short when the electives are not taken', () => {
      const a = auditGraduation(base(), allPassed().filter((r) => r.courseId !== 'ELE1'), { creditsCompleted: 300 });
      expect(a.electiveShortfallUnits).toBe(1);
      expect(a.eligible).toBe(false);
    });
    it('counts any non-compulsory unit the student passed', () => {
      const rows = [...allPassed().filter((r) => r.courseId !== 'ELE1'), row('SOMETHING', 'D')];
      expect(auditGraduation(base(), rows, { creditsCompleted: 300 }).electiveShortfallUnits).toBe(0);
    });
    it('does not count a missing prescribed elective twice', () => {
      const a = auditGraduation(base(), allPassed().filter((r) => r.courseId !== 'PRE1'), { creditsCompleted: 300 });
      expect(a.prescribedMissing.map((u) => u.code)).toEqual(['PRE1']);
      expect(a.electiveShortfallUnits).toBe(0);
    });
    it('on older planners (no wil_cp) the placement is worth two electives', () => {
      const older = base({ wil_cp: null, elective_cp: 50 });
      const rows = allPassed().filter((r) => r.courseId !== 'ELE1');   // PRE1 12.5 + WIL 25 = 37.5 of 50
      expect(auditGraduation(older, rows, { creditsCompleted: 300 }).electiveShortfallUnits).toBe(1);
      expect(auditGraduation(older, [...rows, row('SOMETHING', 'D')], { creditsCompleted: 300 }).electiveShortfallUnits).toBe(0);
    });
    it('on newer planners (wil_cp set) the placement is separate from the electives', () => {
      const rows = allPassed().filter((r) => r.courseId !== 'ELE1');
      expect(auditGraduation(base({ elective_cp: 25 }), rows, { creditsCompleted: 300 }).electiveShortfallUnits).toBe(1);
    });
  });

  it('is not eligible when credits are short, using the portal figure', () => {
    const a = auditGraduation(base(), allPassed(), { creditsCompleted: 287.5, creditsRequired: 300 });
    expect(a.creditsOk).toBe(false);
    expect(a.eligible).toBe(false);
  });

  it('treats an exemption (complete, no grade) as passed', () => {
    const rows = allPassed().map((r) => (r.courseId === 'CORE1' ? { ...r, grade: '', term: '' } : r));
    expect(auditGraduation(base(), rows, { creditsCompleted: 300 }).coreMissing).toEqual([]);
  });

  it('ignores MPU units', () => {
    const a = auditGraduation(base(), [...allPassed(), row('MPU3412', 'N')], { creditsCompleted: 300 });
    expect(a.eligible).toBe(true);
  });

  it('reads nothing as eligible for an empty planner and transcript only by credits', () => {
    const a = auditGraduation({ units: [] }, [], { creditsCompleted: 300 });
    expect(a.eligible).toBe(true);
  });
});
