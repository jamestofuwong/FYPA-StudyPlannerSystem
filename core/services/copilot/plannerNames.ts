import type { PlannerRef } from './types';

/**
 * Turns the words of an advisor ("the Data Science planner", "cyber security 2024") into study planners.
 * Advisors do not know planner ids, so every workflow that needs a planner relies on this.
 */

export interface PlannerMention {
  /** The planner that the name stands for. */
  planner: PlannerRef;
  /** The name as the planner list spells it, e.g. "Data Science". */
  name: string;
  /** Where the name starts in the message (counted in letters and digits only), to order several names. */
  position: number;
  /** True when more than one intake had this name and the advisor did not say which: the latest was chosen. */
  assumedLatest: boolean;
}

const compact = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
const words = (s: string) => s.toLowerCase().replace(/&/g, ' and ').split(/[^a-z0-9]+/).filter(Boolean);

/** "Internet of Things" → "iot", "Artificial Intelligence" → "ai". */
function acronym(name: string): string | null {
  const w = words(name).filter((x) => x !== 'and');
  if (w.length < 2) return null;
  const a = w.map((x) => x[0]).join('');
  return a.length >= 3 || a === 'ai' ? a : null;
}

const label = (p: PlannerRef) => p.majorName ?? p.courseName ?? '';

function latest(list: PlannerRef[]): PlannerRef {
  return [...list].sort((a, b) => b.intakeYear - a.intakeYear || (b.intakeMonth ?? 0) - (a.intakeMonth ?? 0))[0];
}

/**
 * The planners that the message names, in the order in which they appear. A name is a major name (or, for a planner without a
 * major, a course name). A year in the message ("2025 intake") chooses the intake. Without a year, the latest intake is used.
 */
export function findPlannerMentions(message: string, catalogue: PlannerRef[]): PlannerMention[] {
  const flat = compact(message);
  const tokens = new Set(words(message));
  const years = [...message.matchAll(/\b(20\d{2})\b/g)].map((m) => parseInt(m[1], 10));

  // one entry per distinct name
  const byName = new Map<string, PlannerRef[]>();
  for (const p of catalogue) {
    const name = label(p);
    if (compact(name).length < 4) continue;
    const key = name.toLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), p]);
  }

  const found: { key: string; name: string; start: number; end: number }[] = [];
  for (const [key, list] of byName) {
    const name = label(list[0]);
    const c = compact(name);
    let start = flat.indexOf(c);
    let end = start + c.length;
    if (start < 0) {
      const ac = acronym(name);
      if (!ac || !tokens.has(ac)) continue;
      start = flat.indexOf(ac);
      end = start + ac.length;
      if (start < 0) continue;
    }
    found.push({ key, name, start, end });
  }

  // "Data Science" inside a longer matching name is not a second mention
  const kept = found.filter((a) => !found.some((b) => b !== a && b.start <= a.start && b.end >= a.end && b.end - b.start > a.end - a.start));
  kept.sort((a, b) => a.start - b.start);

  return kept.map(({ key, name, start }) => {
    let options = byName.get(key)!;
    const named = options.filter((p) => years.includes(p.intakeYear));
    if (named.length) options = named;
    const distinct = new Set(options.map((p) => `${p.intakeYear}-${p.intakeMonth}`));
    return { planner: latest(options), name, position: start, assumedLatest: distinct.size > 1 };
  });
}

/** A sentence for the advisor, so they can see which planner a name was taken to be. */
export function describeMention(m: PlannerMention): string {
  const when = m.planner.intakeYear + (m.planner.intakeMonth ? `-${String(m.planner.intakeMonth).padStart(2, '0')}` : '');
  return `Using the ${m.name} planner for the ${when} intake${m.assumedLatest ? ' (the latest one: add a year to choose another)' : ''}.`;
}
