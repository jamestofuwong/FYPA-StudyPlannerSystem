import {
  PASS_GRADES,
  FAIL_GRADES,
  classifyGrade,
  isPassingGrade,
  isFailingGrade,
  normaliseGrade,
  normaliseUnitCode,
  resolveUnitOutcomes,
  resolveUnitStates,
  getCompletedUnitCodes,
  getFailedUnitCodes,
  getConcededPassUnitCodes,
  findGradeCreditAnomalies,
} from '@core/shared/constants/grades';

function row(
  courseId: string,
  grade: string,
  status = 'Complete',
  creditsEarned = 12.5,
) {
  return { courseId, grade, status, creditsEarned, credits: 12.5 };
}

describe('classifyGrade', () => {
  test.each(['HD', 'D', 'C', 'P', 'SP'])('%s is a pass', (grade) => {
    expect(classifyGrade(grade)).toBe('pass');
    expect(isPassingGrade(grade)).toBe(true);
    expect(isFailingGrade(grade)).toBe(false);
  });

  // Credit-bearing, but it cannot satisfy a prerequisite, so it is its own outcome
  test('CP is a conceded pass, still credit-bearing', () => {
    expect(classifyGrade('CP')).toBe('conceded_pass');
    expect(isPassingGrade('CP')).toBe(true);
    expect(isFailingGrade('CP')).toBe(false);
  });

  test.each(['N', 'SN'])('%s is a fail', (grade) => {
    expect(classifyGrade(grade)).toBe('fail');
    expect(isFailingGrade(grade)).toBe(true);
    expect(isPassingGrade(grade)).toBe(false);
  });

  test.each(['', '   ', null, undefined])('%p is ungraded', (grade) => {
    expect(classifyGrade(grade as string | null | undefined)).toBe('ungraded');
  });

  test.each(['W', 'DEF', 'XYZ', 'F', 'A'])(
    'unrecognised code %s is ungraded, not a fail',
    (grade) => {
      expect(classifyGrade(grade)).toBe('ungraded');
      expect(isFailingGrade(grade)).toBe(false);
      expect(isPassingGrade(grade)).toBe(false);
    },
  );

  test('normalises casing and surrounding whitespace', () => {
    expect(classifyGrade('  sn ')).toBe('fail');
    expect(classifyGrade('hd')).toBe('pass');
    expect(classifyGrade(' Cp')).toBe('conceded_pass');
    expect(normaliseGrade('  n ')).toBe('N');
    expect(normaliseGrade(null)).toBe('');
    expect(normaliseUnitCode(' cos10009 ')).toBe('COS10009');
    expect(normaliseUnitCode(undefined)).toBe('');
  });

  test('PASS_GRADES and FAIL_GRADES are disjoint', () => {
    const overlap = [...PASS_GRADES].filter((g) => FAIL_GRADES.has(g));
    expect(overlap).toEqual([]);
  });
});

describe('resolveUnitOutcomes', () => {
  test('a supplementary pass supersedes the original fail', () => {
    const outcomes = resolveUnitOutcomes([row('COS101', 'N'), row('COS101', 'SP')]);
    expect(outcomes.get('COS101')).toBe('pass');
  });

  test('a failed supplementary leaves the unit failed', () => {
    const outcomes = resolveUnitOutcomes([row('COS101', 'N'), row('COS101', 'SN')]);
    expect(outcomes.get('COS101')).toBe('fail');
  });

  test('row order does not affect the result', () => {
    const forward = resolveUnitOutcomes([row('COS101', 'N'), row('COS101', 'SP')]);
    const reversed = resolveUnitOutcomes([row('COS101', 'SP'), row('COS101', 'N')]);
    expect([...reversed]).toEqual([...forward]);

    const failForward = resolveUnitOutcomes([row('COS102', 'N'), row('COS102', 'SN')]);
    const failReversed = resolveUnitOutcomes([row('COS102', 'SN'), row('COS102', 'N')]);
    expect([...failReversed]).toEqual([...failForward]);
  });

  test('an ungraded row does not downgrade a pass, and outranks a fail', () => {
    expect(resolveUnitOutcomes([row('COS101', 'HD'), row('COS101', '')]).get('COS101')).toBe('pass');
    expect(resolveUnitOutcomes([row('COS101', 'N'), row('COS101', 'W')]).get('COS101')).toBe('ungraded');
  });

  test('rows with an empty or missing courseId are skipped', () => {
    const outcomes = resolveUnitOutcomes([
      row('', 'HD'),
      row('   ', 'HD'),
      { grade: 'HD', status: 'Complete' },
      row('COS101', 'HD'),
    ]);
    expect([...outcomes.keys()]).toEqual(['COS101']);
  });

  test('a nullish array is safe', () => {
    expect(resolveUnitOutcomes(null).size).toBe(0);
    expect(resolveUnitOutcomes(undefined).size).toBe(0);
    expect(resolveUnitOutcomes([]).size).toBe(0);
  });
});

describe('resolveUnitStates', () => {
  test('a passing grade is passed', () => {
    expect(resolveUnitStates([row('U1', 'HD')]).get('U1')).toBe('passed');
  });

  test('a failing grade is must_retake, whichever fail code', () => {
    expect(resolveUnitStates([row('U1', 'N')]).get('U1')).toBe('must_retake');
    expect(resolveUnitStates([row('U2', 'SN')]).get('U2')).toBe('must_retake');
  });

  test('ungraded and Current is in_progress', () => {
    expect(resolveUnitStates([row('U1', '', 'Current', 0)]).get('U1')).toBe('in_progress');
  });

  test('ungraded and Complete is passed — credit transfer or unmapped code', () => {
    expect(resolveUnitStates([row('U1', '', 'Complete')]).get('U1')).toBe('passed');
    expect(resolveUnitStates([row('U2', 'W', 'Complete')]).get('U2')).toBe('passed');
  });

  test('anything else, including Future, is not_taken', () => {
    expect(resolveUnitStates([row('U1', '', 'Future', 0)]).get('U1')).toBe('not_taken');
    expect(resolveUnitStates([row('U2', '', 'Withdrawn', 0)]).get('U2')).toBe('not_taken');
  });

  test('a failing grade beats status — Complete with N is still must_retake', () => {
    expect(resolveUnitStates([row('U1', 'N', 'Complete', 0)]).get('U1')).toBe('must_retake');
  });

  test('best state wins when a unit appears twice, in either order', () => {
    expect(resolveUnitStates([
      row('U1', 'N', 'Complete', 0),
      row('U1', '', 'Current', 0),
    ]).get('U1')).toBe('in_progress');

    expect(resolveUnitStates([
      row('U1', '', 'Current', 0),
      row('U1', 'N', 'Complete', 0),
    ]).get('U1')).toBe('in_progress');

    expect(resolveUnitStates([
      row('U2', '', 'Future', 0),
      row('U2', 'SN', 'Complete', 0),
    ]).get('U2')).toBe('must_retake');
  });
});

describe('getCompletedUnitCodes', () => {
  test('includes passed and in-progress, excludes N, SN and Future', () => {
    const codes = getCompletedUnitCodes([
      row('PASSED', 'HD'),
      row('DOING', '', 'Current', 0),
      row('FAILED-N', 'N', 'Complete', 0),
      row('FAILED-SN', 'SN', 'Complete', 0),
      row('FUTURE', '', 'Future', 0),
    ]);
    expect(codes.sort()).toEqual(['DOING', 'PASSED']);
  });

  test('no duplicates when a unit appears in both lists', () => {
    const courseList = [row('MPU3113', 'C')];
    const mpuCourseList = [row('mpu3113', 'C')];
    expect(getCompletedUnitCodes([...courseList, ...mpuCourseList])).toEqual(['MPU3113']);
  });

  test('a nullish array is safe', () => {
    expect(getCompletedUnitCodes(null)).toEqual([]);
    expect(getCompletedUnitCodes(undefined)).toEqual([]);
  });
});

describe('getFailedUnitCodes', () => {
  test('returns both fail codes', () => {
    const codes = getFailedUnitCodes([
      row('FAILED-N', 'N', 'Complete', 0),
      row('FAILED-SN', 'SN', 'Complete', 0),
      row('PASSED', 'P'),
    ]);
    expect(codes.sort()).toEqual(['FAILED-N', 'FAILED-SN']);
  });

  test('excludes a unit later passed on supplementary', () => {
    const codes = getFailedUnitCodes([
      row('COS101', 'N', 'Complete', 0),
      row('COS101', 'SP', 'Complete'),
      row('COS102', 'N', 'Complete', 0),
    ]);
    expect(codes).toEqual(['COS102']);
  });
});

describe('Conceded Pass', () => {
  test('CP resolves to passed and stays in getCompletedUnitCodes', () => {
    const rows = [row('COS101', 'CP')];
    expect(resolveUnitStates(rows).get('COS101')).toBe('passed');
    expect(getCompletedUnitCodes(rows)).toEqual(['COS101']);
  });

  test('getConcededPassUnitCodes returns CP units only', () => {
    const codes = getConcededPassUnitCodes([
      row('COS101', 'CP'),
      row('COS102', 'P'),
      row('COS103', 'N', 'Complete', 0),
      row(' cos104 ', 'cp'),
    ]);
    expect(codes.sort()).toEqual(['COS101', 'COS104']);
  });

  test('a full pass on the same unit supersedes the CP, in either order', () => {
    const forward = [row('COS101', 'CP'), row('COS101', 'P')];
    const reversed = [row('COS101', 'P'), row('COS101', 'CP')];
    expect(resolveUnitOutcomes(forward).get('COS101')).toBe('pass');
    expect(resolveUnitOutcomes(reversed).get('COS101')).toBe('pass');
    expect(getConcededPassUnitCodes(forward)).toEqual([]);
    expect(getConcededPassUnitCodes(reversed)).toEqual([]);
  });

  test('CP outranks ungraded and fail', () => {
    expect(resolveUnitOutcomes([row('U1', 'N'), row('U1', 'CP')]).get('U1')).toBe('conceded_pass');
    expect(resolveUnitOutcomes([row('U1', 'CP'), row('U1', '')]).get('U1')).toBe('conceded_pass');
  });
});

describe('findGradeCreditAnomalies', () => {
  test('one CP is not an anomaly', () => {
    expect(findGradeCreditAnomalies([row('U1', 'CP'), row('U2', 'HD')])).toEqual([]);
  });

  test('more than one CP flags each of them, without throwing', () => {
    const anomalies = findGradeCreditAnomalies([
      row('U1', 'CP'),
      row('U2', 'CP'),
      row('U3', 'HD'),
    ]);
    expect(anomalies.map((a) => a.code)).toEqual(['U1', 'U2']);
    expect(anomalies[0].reason).toMatch(/at most 1/);
  });

  test('a CP later passed outright does not count toward the limit', () => {
    expect(findGradeCreditAnomalies([
      row('U1', 'CP'),
      row('U1', 'C'),
      row('U2', 'CP'),
    ])).toEqual([]);
  });

  test('a CP that earned no credit is flagged', () => {
    const anomalies = findGradeCreditAnomalies([row('U1', 'CP', 'Complete', 0)]);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]).toMatchObject({ code: 'U1', grade: 'CP', creditsEarned: 0 });
  });

  test('flags a passing grade that earned no credit', () => {
    const anomalies = findGradeCreditAnomalies([row('U1', 'HD', 'Complete', 0)]);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]).toMatchObject({ code: 'U1', grade: 'HD', creditsEarned: 0 });
  });

  test('flags a failing grade that earned credit', () => {
    const anomalies = findGradeCreditAnomalies([row('U1', 'SN', 'Complete', 12.5)]);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]).toMatchObject({ code: 'U1', grade: 'SN', creditsEarned: 12.5 });
  });

  test('flags an unmapped non-blank code that earned credit', () => {
    const anomalies = findGradeCreditAnomalies([row('U1', 'XYZ', 'Complete', 12.5)]);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]).toMatchObject({ code: 'U1', grade: 'XYZ', creditsEarned: 12.5 });
  });

  test('a clean transcript produces no anomalies', () => {
    const anomalies = findGradeCreditAnomalies([
      row('U1', 'HD', 'Complete', 12.5),
      row('U2', 'N', 'Complete', 0),
      row('U3', '', 'Current', 0),
      row('U4', '', 'Future', 0),
      // Blank grade with credit is a credit transfer, not an anomaly
      row('U5', '', 'Complete', 12.5),
    ]);
    expect(anomalies).toEqual([]);
  });

  test('a nullish array is safe and nothing throws', () => {
    expect(findGradeCreditAnomalies(null)).toEqual([]);
    expect(findGradeCreditAnomalies([{ courseId: 'U1' }])).toEqual([]);
  });
});
