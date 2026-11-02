/**
 * Which semester "this semester" means. Semester 1 starts with the February or March intake, and semester 2 with the August or
 * September intake (see the user guide). Summer and winter terms are never guessed: they must be named.
 */
export function semesterOfDate(date: Date): 1 | 2 {
  return date.getMonth() < 6 ? 1 : 2;       // January to June → 1, July to December → 2
}

export function nextSemester(sem: 1 | 2): 1 | 2 {
  return sem === 1 ? 2 : 1;
}
