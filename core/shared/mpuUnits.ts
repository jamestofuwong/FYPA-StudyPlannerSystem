// MPU (Mata Pelajaran Umum) units are the university-wide general studies units. Shared so the advisor app and the student
// website decide in the same way what an MPU unit is.

type MpuLike = { category?: string | null; code?: string | null; courseId?: string | null; unit_code?: string | null };

/** True for a planner row or a transcript row of an MPU unit: the category says so, or the code starts with MPU. */
export function isMpuUnit(unit: MpuLike | null | undefined): boolean {
  if (!unit) return false;
  if (unit.category === 'mpu') return true;
  const code = unit.code ?? unit.courseId ?? unit.unit_code ?? '';
  return code.trim().toUpperCase().startsWith('MPU');
}
