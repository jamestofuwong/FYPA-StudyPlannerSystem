import type { AtRiskReport, RiskFactor, RiskSeverity } from '../../shared/types/risk';
import type { ScrapedStudent } from '../../shared/types/student';

export function assessRisk(
  student: ScrapedStudent,
  matchPayload: any,
  plannerTemplate: any | null,
): AtRiskReport {
  const studentYear = deriveStudentYear(student.enrollmentDate);
  const factors: RiskFactor[] = [];

  try { factors.push(...assessCreditTrajectory(student)); } catch {}
  try { factors.push(...assessFailedUnits(student, matchPayload)); } catch {}
  try { factors.push(...assessYearLevelGap(matchPayload, plannerTemplate, studentYear)); } catch {}
  try { factors.push(...assessMajorCoreRate(matchPayload, studentYear)); } catch {}
  try { factors.push(...assessCGPA(student)); } catch {}
  try { factors.push(...assessNoMajorLate(matchPayload, studentYear)); } catch {}

  const level = aggregateSeverity(factors);

  return {
    level,
    studentYear,
    factors,
    recommendedActions: buildRecommendations(factors),
    estimatedGraduationDeficit: getDeficit(factors),
  };
}

function deriveStudentYear(enrollmentDate: string | undefined): number {
  if (!enrollmentDate) return 1;
  try {
    const enrolled = new Date(enrollmentDate);
    const now = new Date();
    const monthsElapsed =
      (now.getFullYear() - enrolled.getFullYear()) * 12 +
      (now.getMonth() - enrolled.getMonth());
    return Math.min(4, Math.max(1, Math.ceil(monthsElapsed / 12)));
  } catch {
    return 1;
  }
}

function aggregateSeverity(factors: RiskFactor[]): RiskSeverity {
  const order: RiskSeverity[] = ['low', 'medium', 'high', 'critical'];
  return factors.reduce<RiskSeverity>(
    (max, f) => (order.indexOf(f.severity) > order.indexOf(max) ? f.severity : max),
    'low',
  );
}

function getDeficit(factors: RiskFactor[]): number | undefined {
  const traj = factors.find(f => f.id === 'credit_trajectory');
  return traj?.data?.deficit as number | undefined;
}

function assessCreditTrajectory(student: ScrapedStudent): RiskFactor[] {
  const { creditsCompleted, creditsRequired, enrollmentDate, graduationDate } = student;
  if (!creditsRequired || creditsCompleted == null || !enrollmentDate) return [];

  const enrolled = new Date(enrollmentDate);
  const now = new Date();
  const semestersElapsed = Math.max(
    1,
    ((now.getFullYear() - enrolled.getFullYear()) * 12 +
      (now.getMonth() - enrolled.getMonth())) /
      6,
  );
  const creditsPerSemester = creditsCompleted / semestersElapsed;

  if (creditsPerSemester <= 0) {
    return [{
      id: 'credit_trajectory',
      severity: 'critical',
      title: 'No Credit Progress',
      description: 'Student has earned no credits. Immediate advisor intervention required.',
      data: { creditsCompleted, creditsRequired, deficit: 99 },
    }];
  }

  const creditsRemaining = creditsRequired - creditsCompleted;
  const semestersNeeded = Math.ceil(creditsRemaining / creditsPerSemester);

  let semestersAvailable = 8 - Math.floor(semestersElapsed);
  if (graduationDate) {
    const grad = new Date(graduationDate);
    semestersAvailable = Math.max(
      0,
      Math.round(
        ((grad.getFullYear() - now.getFullYear()) * 12 +
          (grad.getMonth() - now.getMonth())) /
          6,
      ),
    );
  }

  const deficit = semestersNeeded - semestersAvailable;
  if (deficit <= 0) return [];

  const severity: RiskSeverity = deficit > 2 ? 'critical' : deficit > 1 ? 'high' : 'medium';
  return [{
    id: 'credit_trajectory',
    severity,
    title: 'Credit Deficit',
    description: `At current pace (${creditsPerSemester.toFixed(1)} credits/semester), student needs ${semestersNeeded} more semester(s) but only has ${semestersAvailable} available.`,
    data: { deficit, semestersNeeded, semestersAvailable, creditsPerSemester },
  }];
}

function assessFailedUnits(student: ScrapedStudent, matchPayload: any): RiskFactor[] {
  if (!student.courseList?.length) return [];
  const unmatchedCore: string[] = matchPayload?.unmatchedCore ?? [];

  const failedUnits = student.courseList.filter(
    u => u.grade === 'F' || u.status?.toLowerCase().includes('withdrawn'),
  );

  if (!failedUnits.length) return [];

  const failedRequired = failedUnits.filter(u => unmatchedCore.includes(u.courseId));
  const severity: RiskSeverity = failedRequired.length > 0 ? 'high' : 'medium';

  return [{
    id: 'failed_units',
    severity,
    title: 'Failed or Withdrawn Units',
    description: `Student has ${failedUnits.length} failed/withdrawn unit(s)${failedRequired.length > 0 ? `, including ${failedRequired.length} required unit(s)` : ''}.`,
    affectedUnits: failedUnits.map(u => u.courseId),
    data: { count: failedUnits.length, requiredCount: failedRequired.length },
  }];
}

function assessYearLevelGap(matchPayload: any, plannerTemplate: any, studentYear: number): RiskFactor[] {
  if (!plannerTemplate || !matchPayload?.unmatchedCore?.length) return [];
  const units: any[] = plannerTemplate.units ?? [];
  const unmatchedCore: string[] = matchPayload.unmatchedCore ?? [];

  const lateUnits = units.filter((u: any) => {
    const code = u.unit?.unit_code ?? u.unitCode ?? '';
    const yearLevel = u.year_level ?? u.yearLevel ?? 0;
    return unmatchedCore.includes(code) && yearLevel > 0 && yearLevel < studentYear;
  });

  if (!lateUnits.length) return [];

  const severity: RiskSeverity = studentYear >= 3 ? 'critical' : 'high';
  return [{
    id: 'year_level_gap',
    severity,
    title: 'Behind on Year-Level Core Units',
    description: `${lateUnits.length} core unit(s) from earlier year(s) are still incomplete in Year ${studentYear}.`,
    affectedUnits: lateUnits.map((u: any) => u.unit?.unit_code ?? u.unitCode).filter(Boolean),
  }];
}

function assessMajorCoreRate(matchPayload: any, studentYear: number): RiskFactor[] {
  const ranked = matchPayload?.rankedPlanners;
  if (!ranked?.length) return [];

  const top = ranked[0];
  const majorCoreScore: number =
    top?.majorCoreScore ?? top?.scores?.majorCore ?? top?.breakdown?.majorCore?.matchPct ?? 0;

  let severity: RiskSeverity | null = null;
  let description = '';

  if (studentYear >= 4) {
    if (majorCoreScore < 0.5) {
      severity = 'critical';
      description = `Only ${Math.round(majorCoreScore * 100)}% of major core completed in final year.`;
    } else if (majorCoreScore < 0.7) {
      severity = 'high';
      description = `${Math.round(majorCoreScore * 100)}% major core completed — should be higher in Year 4.`;
    }
  } else if (studentYear >= 3) {
    if (majorCoreScore < 0.4) {
      severity = 'high';
      description = `Only ${Math.round(majorCoreScore * 100)}% of major core completed in Year 3.`;
    } else if (majorCoreScore < 0.6) {
      severity = 'medium';
      description = `${Math.round(majorCoreScore * 100)}% major core completed — pace may need to increase.`;
    }
  }

  if (!severity) return [];
  return [{
    id: 'major_core_rate',
    severity,
    title: 'Low Major Core Completion',
    description,
    data: { majorCoreScore, studentYear },
  }];
}

function assessCGPA(student: ScrapedStudent): RiskFactor[] {
  const cgpa = student.cgpa;
  if (cgpa == null || isNaN(Number(cgpa))) return [];
  const val = Number(cgpa);
  if (val < 2.0) {
    return [{
      id: 'cgpa',
      severity: 'critical',
      title: 'Low CGPA — Academic Probation',
      description: `CGPA of ${val.toFixed(2)} is below the 2.0 academic probation threshold.`,
      data: { cgpa: val },
    }];
  }
  if (val < 2.5) {
    return [{
      id: 'cgpa',
      severity: 'high',
      title: 'Low CGPA',
      description: `CGPA of ${val.toFixed(2)} is low and may affect graduation eligibility.`,
      data: { cgpa: val },
    }];
  }
  if (val < 3.0) {
    return [{
      id: 'cgpa',
      severity: 'medium',
      title: 'Below-Average CGPA',
      description: `CGPA of ${val.toFixed(2)} is below average.`,
      data: { cgpa: val },
    }];
  }
  return [];
}

function assessNoMajorLate(matchPayload: any, studentYear: number): RiskFactor[] {
  if (matchPayload?.status !== 'noMajorDetected') return [];
  const severity: RiskSeverity =
    studentYear >= 3 ? 'critical' : studentYear >= 2 ? 'high' : 'medium';
  return [{
    id: 'no_major_late',
    severity,
    title: 'No Major Detected',
    description: `No clear major alignment detected for a Year ${studentYear} student. Unit selections may not match any study planner.`,
  }];
}

function buildRecommendations(factors: RiskFactor[]): string[] {
  const recs: string[] = [];
  for (const f of factors) {
    if (f.severity !== 'critical' && f.severity !== 'high') continue;
    switch (f.id) {
      case 'credit_trajectory':
        recs.push(
          `Student must increase credit load to close the graduation deficit of ${f.data?.deficit} semester(s).`,
        );
        break;
      case 'failed_units':
        recs.push(
          `Advise student to re-enrol in failed/withdrawn units: ${f.affectedUnits?.join(', ')}.`,
        );
        break;
      case 'year_level_gap':
        recs.push(
          `Student is missing core units from earlier years: ${f.affectedUnits?.join(', ')}. Prioritise immediately.`,
        );
        break;
      case 'major_core_rate':
        recs.push(
          'Increase major core unit completion rate — current pace is insufficient for timely graduation.',
        );
        break;
      case 'cgpa':
        recs.push(
          'CGPA is critically low. Academic support or probation review may be required.',
        );
        break;
      case 'no_major_late':
        recs.push(
          'Review unit selections with the student — no major alignment detected. Consider formal major change process.',
        );
        break;
    }
  }
  return recs;
}
