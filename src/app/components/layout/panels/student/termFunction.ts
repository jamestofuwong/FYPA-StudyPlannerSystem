import type { ScrapedStudent } from '../../../../../backend/models/student';
import styles from '../shared.module.css';

// ====== Term grouping helpers ======
//  Known formats:
//  "2024_FEB_S1"      ->  regular semester 1
//  "2024_SEP_S2"      ->  regular semester 2
//  "2024_JUN_ST"      ->  summer term (short term)
//  "2024_NOV_WT"      ->  winter term (short term)
//  "2024_JAN_ST_F"    ->  foundation summer term

const MONTH_ORDER: Record<string, number> = {
    JAN: 1, FEB: 2, MAR: 3,
    APR: 4, MAY: 5, JUN: 6,
    JUL: 7, AUG: 8, SEP: 9,
    OCT: 10, NOV: 11, DEC: 12,
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
    const parts   = term.split('_');
    const yearStr = parts[0] ?? '0';
    const mon     = parts[1] ?? '???';
    const semType = parts[2] ?? 'Unknown';
    const suffix  = parts[3] ?? '';
 
    const year     = parseInt(yearStr, 10);
    const monthNum = MONTH_ORDER[mon] ?? 0;
    const sortKey  = year * 100 + monthNum;
 
    const typeLabel   = SEM_TYPE_LABEL[semType] ?? semType;
    const suffixLabel = suffix === 'F' ? ' (Foundation)' : suffix ? ` (${suffix})` : '';
    const label       = `${year} · ${typeLabel}${suffixLabel}`;
 
    return { year, mon, semType, sortKey, label };
}

export function groupByTerm(courseList: ScrapedStudent['courseList']): TermGroup[] {
    // Group courses by term key
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
 
    // Find year range and the sort key of the last real term
    const years          = realGroups.map(g => g.parsed.year);
    const minYear        = Math.min(...years);
    const maxYear        = Math.max(...years);
    const lastRealSortKey = Math.max(...realGroups.map(g => g.parsed.sortKey));
 
    // Gap detection — checks by semType (S1/S2) per year, only injects a gap if the slot falls before the last real term
    const allSlots: TermGroup[] = [];
 
    for (let y = minYear; y <= maxYear; y++) {
        for (const semType of REGULAR_SEM_TYPES) {
            const existing = realGroups.find(
                g => g.parsed.year === y && g.parsed.semType === semType
            );
 
            if (existing) {
                allSlots.push(existing);
            } else {
                // Derive month from any real term with the same semType
                const realExample = realGroups.find(g => g.parsed.semType === semType);
                const mon = realExample?.parsed.mon ?? (semType === 'S1' ? 'FEB' : 'SEP');
                const placeholderTerm = `${y}_${mon}_${semType}`;
                const placeholderParsed = parseTerm(placeholderTerm);
 
                // Only inject if this gap slot is strictly before the last real term
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
 
    // Append non-regular terms (ST, WT, foundation) from real data
    const nonRegular = realGroups.filter(
        g => !REGULAR_SEM_TYPES.includes(g.parsed.semType as typeof REGULAR_SEM_TYPES[number])
    );
 
    // Merge and sort by sortKey (year * 100 + monthNum)
    const combined = [...allSlots, ...nonRegular]
        .sort((a, b) => a.parsed.sortKey - b.parsed.sortKey);
 
    // Deduplicate
    const seen = new Set<string>();
    return combined.filter(g => {
        if (seen.has(g.term)) return false;
        seen.add(g.term);
        return true;
    });
}
 
// ====== Badge helpers ======
 
export function gradeClass(grade: string): string {
    switch (grade.toUpperCase()) {
        case 'HD': return styles.badgeGreen;
        case 'D':  return styles.badgeBlue;
        case 'C':  return styles.badgeYellow;
        case 'P':  return styles.badgeOrange;
        case 'F':  return styles.badgeRed;
        default:   return styles.badgeBlue;
    }
}
 
export function statusClass(status: string): string {
    switch (status) {
        case 'Complete':   return styles.badgeGreen;
        case 'Enrolled':   return styles.badgeBlue;
        case 'Future':     return styles.badgeYellow;
        case 'Incomplete': return styles.badgeRed;
        default:           return styles.badgeOrange;
    }
}
