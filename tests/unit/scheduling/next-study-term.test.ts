import { calendarTermFor, resolveNextStudyTerm } from '../../../core/services/scheduling/customPlannerScheduler';

const row = (term: string, status = 'Complete') => ({ term, status });
const SEP_2025 = { year: 2025, semester: 2 as const };   // Aug/Sept intake
const MAR_2024 = { year: 2024, semester: 1 as const };   // Feb/Mar intake

describe('resolveNextStudyTerm', () => {
  describe('reading calendar terms', () => {
    it('starts at the intake semester when nothing has been taken', () => {
      expect(resolveNextStudyTerm([], SEP_2025)).toMatchObject({ startYear: 1, startSemester: 1 });
    });

    it('continues straight on after consecutive semesters', () => {
      // Sep 2025 intake, Sep 2025 and Mar 2026 done: next is Sep 2026, the first semester of Year 2
      const r = resolveNextStudyTerm([row('2025_SEP_S2'), row('2026_MAR_S1')], SEP_2025);
      expect(r).toMatchObject({ startYear: 2, startSemester: 1 });
      expect(calendarTermFor(r.startSemester, 2)).toBe(2);   // runs in the Aug/Sept semester
    });

    it('counts a deferred semester as time passed', () => {
      // Sep 2025, then a year away, then Sep 2026 attended. The next real semester is Mar 2027.
      const r = resolveNextStudyTerm([row('2025_SEP_S2'), row('2026_SEP_S2')], SEP_2025);
      expect(r).toMatchObject({ startYear: 2, startSemester: 2 });
      expect(calendarTermFor(r.startSemester, 2)).toBe(1);   // runs in the Feb/Mar semester
    });

    it('works for a Feb/Mar intake', () => {
      const r = resolveNextStudyTerm([row('2024_FEB_S1'), row('2024_SEP_S2'), row('2025_MAR_S1')], MAR_2024);
      expect(r).toMatchObject({ startYear: 2, startSemester: 2 });
      expect(calendarTermFor(r.startSemester, 1)).toBe(2);
    });

    it('starts after a semester that is in progress', () => {
      const r = resolveNextStudyTerm([row('2025_SEP_S2'), row('2026_MAR_S1', 'Current')], SEP_2025);
      expect(r).toMatchObject({ startYear: 2, startSemester: 1 });
    });

    it('ignores pre-enrolled (Future) rows, so that semester is planned again', () => {
      const r = resolveNextStudyTerm([row('2025_SEP_S2'), row('2026_MAR_S1'), row('2026_SEP_S2', 'Future')], SEP_2025);
      expect(r).toMatchObject({ startYear: 2, startSemester: 1 });
    });

    it('ignores short terms and exemptions with no term', () => {
      const r = resolveNextStudyTerm([row('2025_SEP_S2'), row('2026_JAN_ST'), row(''), row('2026_JUN_WT')], SEP_2025);
      expect(r).toMatchObject({ startYear: 1, startSemester: 2 });
    });

    it('uses the latest term whatever order the rows come in', () => {
      const r = resolveNextStudyTerm([row('2026_MAR_S1'), row('2025_SEP_S2')], SEP_2025);
      expect(r).toMatchObject({ startYear: 2, startSemester: 1 });
    });
  });

  describe('falling back to counting terms', () => {
    it('is used when no intake is given', () => {
      const r = resolveNextStudyTerm([row('2025_SEP_S2'), row('2026_MAR_S1'), row('2026_SEP_S2')]);
      expect(r).toMatchObject({ startYear: 2, startSemester: 2, enrolledTermsCount: 3 });
    });

    it('is used when the terms cannot be read as calendar terms', () => {
      const r = resolveNextStudyTerm([row('T1_S1'), row('T2_S2')], SEP_2025);
      expect(r).toMatchObject({ startYear: 2, startSemester: 1, enrolledTermsCount: 2 });
    });

    it('is used when the latest term is earlier than the intake (inconsistent data)', () => {
      const r = resolveNextStudyTerm([row('2020_MAR_S1')], SEP_2025);
      expect(r.enrolledTermsCount).toBe(1);
      expect(r).toMatchObject({ startYear: 1, startSemester: 2 });
    });

    it('starts at year 1 semester 1 for an empty transcript with no intake', () => {
      expect(resolveNextStudyTerm([])).toMatchObject({ startYear: 1, startSemester: 1, enrolledTermsCount: 0 });
    });
  });
});
