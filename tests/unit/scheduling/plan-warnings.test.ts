import { describePlanWarning } from '@core/shared/scheduling/planWarnings';

const describe_ = (w: Parameters<typeof describePlanWarning>[0]) => describePlanWarning(w, 20, 1);

describe('describePlanWarning', () => {
  test('a missing prerequisite names what is missing', () => {
    expect(describe_({ kind: 'requisite_violation', unitCode: 'COS20001', missing: ['COS10001', 'COS10002'] }))
      .toBe('COS20001 needs COS10001 and COS10002, which are not in this plan');
  });

  test('a summer or winter only unit says the plan does not schedule those terms', () => {
    expect(describe_({ kind: 'short_term_only', unitCode: 'WIN1', offeringTerms: [4] }))
      .toBe('WIN1 is only offered in summer/winter, which this plan does not schedule');
  });

  test('names terms by their months', () => {
    expect(describe_({ kind: 'not_offered', unitCode: 'X1', offeringTerms: [2] }))
      .toBe('X1 only runs in Aug/Sep, and no Aug/Sep term was available within the plan');
  });

  test('a unit that could not be placed in time says how many semesters were tried', () => {
    expect(describe_({ kind: 'budget_exhausted', unitCodes: ['A', 'B'] }))
      .toBe('2 units could not be placed within 20 semesters: A, B');
  });

  test('routine warnings say nothing', () => {
    expect(describe_({ kind: 'conceded_pass_retake', unitCode: 'A', blockedUnitCodes: ['B'] })).toBeNull();
  });
});
