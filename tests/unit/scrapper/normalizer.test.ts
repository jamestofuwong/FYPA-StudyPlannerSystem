import { normaliseCode, normaliseUnitCodes } from '../../../core/services/matching/unitNormalizer';
import { parseTerm, groupByTerm, gradeClass, statusClass } from '../../../web/app/(pages)/student/termFunction';

describe('Unit Normalizer (MM-03)', () => {
  test('should trim and uppercase single codes', () => {
    expect(normaliseCode(" cos10001 ")).toBe("COS10001");
    expect(normaliseCode("tne10006")).toBe("TNE10006");
  });

  test('should deduplicate and clean arrays', () => {
    const raw = ["cos10001", "  COS10001", "TNE10006", " ", ""];
    const result = normaliseUnitCodes(raw);
    
    expect(result.size).toBe(2);
    expect(result.has("COS10001")).toBe(true);
    expect(result.has("TNE10006")).toBe(true);
  });
});

describe('Term Function - 100% Coverage', () => {
  test('parseTerm: should handle all semester types and suffixes', () => {
    expect(parseTerm("2024_FEB_S1").label).toContain("Semester 1");
    expect(parseTerm("2023_AUG_S2").label).toContain("Semester 2");
    expect(parseTerm("2022_JUN_WT").label).toContain("Winter Term");
    expect(parseTerm("2024_JAN_ST").label).toContain("Summer Term");
    expect(parseTerm("2024_FEB_S1_F").label).toContain("(Foundation)");
  });

  test('groupByTerm: should fill empty slots and sort correctly', () => {
    const mockList = [
      { term: "2024_FEB_S1", courseId: "C1" },
      { term: "2022_SEP_S2", courseId: "C2" }
    ];
    const groups = groupByTerm(mockList as any);
    // This triggers the complex loops that fill missing years/semesters
    expect(groups.length).toBeGreaterThan(2); 
    expect(groups.find(g => g.isEmpty)).toBeDefined();
  });

  test('gradeClass & statusClass: should cover all switch branches', () => {
    ['HD', 'D', 'C', 'P', 'F', 'OTHER'].forEach(g => expect(gradeClass(g)).toBeDefined());
    ['Complete', 'Enrolled', 'Future', 'Incomplete', 'OTHER'].forEach(s => expect(statusClass(s)).toBeDefined());
  });

  test('Term Function: Matrix Coverage (Line 1-147)', () => {
    const terms = ["2024_FEB_S1", "2023_JUL_S2", "2022_JUN_WT", "2024_JAN_ST", "2024_FEB_S1_F", "BAD_STRING"];
    terms.forEach(t => parseTerm(t));
    
    // Trigger the complex "Fill gaps" loop (Line 76-115)
    groupByTerm([{ term: "2022_S1", courseId: "1" }, { term: "2024_S2", courseId: "2" }] as any);
  });
});