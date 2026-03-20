import type { ScrapedStudent } from '../../../../core/shared/types/student';
import styles from './page.module.css';

const MONTH_ORDER: Record<string, number> = {
  JAN: 1,
  FEB: 2,
  MAR: 3,
  APR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AUG: 8,
  SEP: 9,
  OCT: 10,
  NOV: 11,
  DEC: 12,
};

const SEM_TYPE_LABEL: Record<string, string> = {
  S1: 'Semester 1',
  S2: 'Semester 2',
  ST: 'Summer Term',
  WT: 'Winter Term',
};

const REGULAR_SEM_TYPES = ['S1', 'S2'] as const;

export type ParsedTerm = {
  year: number;
  mon: string;
  semType: string;
  sortKey: number;
  label: string;
};

export type TermGroup = {
  term: string;
  list: ScrapedStudent['courseList'];
  parsed: ParsedTerm;
  isEmpty: boolean;
};

export function parseTerm(term: string): ParsedTerm {
  const parts = term.split('_');
  const yearStr = parts[0] ?? '0';
  const mon = parts[1] ?? '???';
  const semType = parts[2] ?? 'Unknown';
  const suffix = parts[3] ?? '';

  const year = parseInt(yearStr, 10);
  const monthNum = MONTH_ORDER[mon] ?? 0;
  const sortKey = year * 100 + monthNum;

  const typeLabel = SEM_TYPE_LABEL[semType] ?? semType;
  const suffixLabel = suffix === 'F' ? ' (Foundation)' : suffix ? ` (${suffix})` : '';
  const label = `${year} · ${typeLabel}${suffixLabel}`;

  return { year, mon, semType, sortKey, label };
}

export function groupByTerm(courseList: ScrapedStudent['courseList']): TermGroup[] {
  const map = new Map<string, ScrapedStudent['courseList']>();
  for (const c of courseList) {
    const bucket = map.get(c.term) ?? [];
    bucket.push(c);
    map.set(c.term, bucket);
  }

  const realGroups: TermGroup[] = [...map.entries()].map(([term, list]) => ({
    term,
    list,
    parsed: parseTerm(term),
    isEmpty: false,
  }));

  if (realGroups.length === 0) return [];

  const years = realGroups.map((g) => g.parsed.year);
  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);
  const lastRealSortKey = Math.max(...realGroups.map((g) => g.parsed.sortKey));

  const allSlots: TermGroup[] = [];

  for (let y = minYear; y <= maxYear; y++) {
    for (const semType of REGULAR_SEM_TYPES) {
      const existing = realGroups.find((g) => g.parsed.year === y && g.parsed.semType === semType);

      if (existing) {
        allSlots.push(existing);
      } else {
        const realExample = realGroups.find((g) => g.parsed.semType === semType);
        const mon = realExample?.parsed.mon ?? (semType === 'S1' ? 'FEB' : 'SEP');
        const placeholderTerm = `${y}_${mon}_${semType}`;
        const placeholderParsed = parseTerm(placeholderTerm);

        if (placeholderParsed.sortKey < lastRealSortKey) {
          allSlots.push({
            term: placeholderTerm,
            list: [],
            parsed: placeholderParsed,
            isEmpty: true,
          });
        }
      }
    }
  }

  const nonRegular = realGroups.filter((g) => !REGULAR_SEM_TYPES.includes(g.parsed.semType as (typeof REGULAR_SEM_TYPES)[number]));

  const combined = [...allSlots, ...nonRegular].sort((a, b) => a.parsed.sortKey - b.parsed.sortKey);

  const seen = new Set<string>();
  return combined.filter((g) => {
    if (seen.has(g.term)) return false;
    seen.add(g.term);
    return true;
  });
}

export function gradeClass(grade: string): string {
  switch (grade.toUpperCase()) {
    case 'HD':
      return styles.badgeGreen;
    case 'D':
      return styles.badgeBlue;
    case 'C':
      return styles.badgeYellow;
    case 'P':
      return styles.badgeOrange;
    case 'F':
      return styles.badgeRed;
    default:
      return styles.badgeBlue;
  }
}

export function statusClass(status: string): string {
  switch (status) {
    case 'Complete':
      return styles.badgeGreen;
    case 'Enrolled':
      return styles.badgeBlue;
    case 'Future':
      return styles.badgeYellow;
    case 'Incomplete':
      return styles.badgeRed;
    default:
      return styles.badgeOrange;
  }
}
