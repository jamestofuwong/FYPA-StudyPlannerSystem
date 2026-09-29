type Enrollment = { EnrollId: number; EnrollmentDesc: string };

const isMpu = (e: Enrollment) =>
  e.EnrollmentDesc.toLowerCase().includes('mata pelajaran umum');

/**
 * Selects a single enrollment from the list based on the given mode.
 * - latest   : non-MPU enrollment with the highest EnrollId
 * - earliest : non-MPU enrollment with the lowest EnrollId
 * - mpu      : the MPU enrollment
 * Returns null if no matching enrollment exists.
 */
export function selectEnrollment(
  enrollments: Enrollment[],
  mode = 'latest',
): Enrollment | null {
  if (mode === 'mpu') {
    return enrollments.find(isMpu) ?? null;
  }
  const nonMpu = enrollments.filter((e) => !isMpu(e));
  if (nonMpu.length === 0) return null;
  if (mode === 'earliest') {
    return nonMpu.reduce((a, b) => (a.EnrollId < b.EnrollId ? a : b));
  }
  // default: latest
  return nonMpu.reduce((a, b) => (a.EnrollId > b.EnrollId ? a : b));
}
