const TERM_LABELS: Record<number, string> = {
  1: 'Semester 1',
  2: 'Semester 2',
  3: 'Summer Term',
  4: 'Winter Term',
}

export function termLabel(term: number): string {
  return TERM_LABELS[term] ?? `Term ${term}`
}
