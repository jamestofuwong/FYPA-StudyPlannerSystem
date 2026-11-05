/**
 * MPU (Mata Pelajaran Umum) units are the university-wide general studies units. Some advisors do not need to see
 * them, so the Major Detection and Student Pathway pages can hide them. Hiding only changes what is drawn: matching,
 * the graduation check and the scheduler still see every unit.
 */

type MpuLike = { category?: string | null; code?: string | null; courseId?: string | null; unit_code?: string | null };

/** True for a planner row or a transcript row of an MPU unit: the category says so, or the code starts with MPU. */
export function isMpuUnit(unit: MpuLike | null | undefined): boolean {
  if (!unit) return false;
  if (unit.category === 'mpu') return true;
  const code = unit.code ?? unit.courseId ?? unit.unit_code ?? '';
  return code.trim().toUpperCase().startsWith('MPU');
}

export const SHOW_MPU_STORAGE_KEY = 'showMpuUnits';

/** The remembered choice, or true (shown) when nothing was saved or the browser does not allow storage. */
export function readShowMpu(): boolean {
  try {
    return window.localStorage.getItem(SHOW_MPU_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function saveShowMpu(show: boolean): void {
  try {
    window.localStorage.setItem(SHOW_MPU_STORAGE_KEY, show ? 'true' : 'false');
  } catch {
    /* storage can be blocked; the choice then lasts until the page is closed */
  }
}
