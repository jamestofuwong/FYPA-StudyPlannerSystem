/**
 * Loads the planners and unit data the scenario suite builds its students from.
 *
 * The suite reads the real study planners out of the application's database (the same tables the three
 * features read), so the test students are built from exactly what the features will see. The planners were
 * cross-checked against the PDFs in study-planner-pdfs/ (see tests/scenarios/README.md for the result).
 *
 * Point SCENARIO_DB_URL at a database holding the app's data. It is copied into DATABASE_URL before the
 * Prisma client is created, because the features under test import that client themselves.
 */

export const SCENARIO_DB_URL = process.env.SCENARIO_DB_URL;

export type Cond =
  | { type: 'unit'; requisiteType: 'prerequisite' | 'corequisite' | 'antirequisite'; unitCode: string }
  | { type: 'credit_points'; creditPoints: number };

export interface UnitInfo {
  code: string;
  name: string;
  isActive: boolean;
  replacedBy: string | null;
  /** Calendar terms from unit_offerings, 1 to 4. Empty means no data recorded. */
  offered: number[];
  /** Requisite groups: a unit is takeable if ANY group has ALL of its conditions satisfied. */
  groups: Cond[][];
}

export interface PlannerUnit {
  code: string;
  name: string;
  category: 'core' | 'major_core' | 'prescribed_elective' | 'elective' | 'wil' | 'mpu';
  year: number;
  /** 1 and 2 are regular semesters, 3 is the summer term, 4 the winter term. */
  semester: number;
}

export interface PlannerView {
  id: string;
  major: string;
  intakeYear: number;
  intakeMonth: number;
  /** 1 for a Feb/Mar intake, 2 for Aug/Sept. The same rule the dashboard and the pathway route use. */
  intakeSemester: 1 | 2;
  label: string;
  coreCp: number | null;
  majorCp: number | null;
  electiveCp: number | null;
  wilCp: number | null;
  electiveCount: number | null;
  units: PlannerUnit[];
  /** Elective slots the planner leaves open (template rows with no unit). */
  openSlots: { year: number; semester: number }[];
  /** Units the planner's elective groups offer for those slots. */
  electiveGroupCodes: string[];
}

export interface ScenarioData {
  planners: PlannerView[];
  units: Map<string, UnitInfo>;
  plannerBy(major: string, intakeYear: number, intakeMonth: number): PlannerView;
}

let cached: ScenarioData | null = null;

export async function loadScenarioData(): Promise<ScenarioData> {
  if (cached) return cached;
  if (!SCENARIO_DB_URL) throw new Error('SCENARIO_DB_URL is not set');
  process.env.DATABASE_URL = SCENARIO_DB_URL;
  const { prisma } = await import('../../../core/db/client');

  const rawUnits = await prisma.unit.findMany({
    include: {
      offerings: true,
      replaced_by: true,
      requisite_groups: { include: { conditions: { include: { unit: true } } } },
    },
  });
  const units = new Map<string, UnitInfo>();
  for (const u of rawUnits) {
    units.set(u.unit_code.toUpperCase(), {
      code: u.unit_code.toUpperCase(),
      name: u.unit_name,
      isActive: u.is_active,
      replacedBy: u.replaced_by?.unit_code.toUpperCase() ?? null,
      offered: [...new Set(u.offerings.map((o) => o.offered_in))].sort(),
      groups: u.requisite_groups
        .map((g) =>
          g.conditions
            .map((c): Cond | null => {
              if (c.type === 'credit_points') return { type: 'credit_points', creditPoints: Number(c.credit_points) };
              if (c.type === 'unit' && c.unit) {
                return {
                  type: 'unit',
                  requisiteType: (c.requisite_type ?? 'prerequisite') as 'prerequisite' | 'corequisite' | 'antirequisite',
                  unitCode: c.unit.unit_code.toUpperCase(),
                };
              }
              return null;
            })
            .filter((c): c is Cond => c !== null),
        )
        .filter((g) => g.length > 0),
    });
  }

  const raw = await prisma.plannerTemplate.findMany({
    include: {
      major: true,
      units: { include: { unit: true } },
      elective_groups: { include: { units: { include: { unit: true } } } },
    },
  });

  const planners: PlannerView[] = raw.map((p) => {
    const intakeMonth = p.intake_month ?? 1;
    const named = p.units.filter((tu) => tu.unit);
    return {
      id: p.id,
      major: p.major?.name ?? '',
      intakeYear: p.intake_year,
      intakeMonth,
      intakeSemester: (intakeMonth >= 7 ? 2 : 1) as 1 | 2,
      label: `${p.major?.name} ${p.intake_year}/${String(intakeMonth).padStart(2, '0')}`,
      coreCp: p.core_cp,
      majorCp: p.major_cp,
      electiveCp: p.elective_cp,
      wilCp: p.wil_cp,
      electiveCount: p.elective_count,
      units: named.map((tu) => ({
        code: tu.unit!.unit_code.toUpperCase(),
        name: tu.unit!.unit_name,
        category: tu.category as PlannerUnit['category'],
        year: tu.year_level,
        semester: tu.semester,
      })),
      openSlots: p.units.filter((tu) => !tu.unit).map((tu) => ({ year: tu.year_level, semester: tu.semester })),
      electiveGroupCodes: [
        ...new Set(p.elective_groups.flatMap((g) => g.units.map((gu) => gu.unit.unit_code.toUpperCase()))),
      ],
    };
  });

  cached = {
    planners,
    units,
    plannerBy(major, intakeYear, intakeMonth) {
      const found = planners.find((p) => p.major === major && p.intakeYear === intakeYear && p.intakeMonth === intakeMonth);
      if (!found) throw new Error(`No planner for ${major} ${intakeYear}/${intakeMonth}`);
      return found;
    },
  };
  return cached;
}

export async function closeScenarioDb() {
  if (!SCENARIO_DB_URL) return;
  const { prisma } = await import('../../../core/db/client');
  await prisma.$disconnect();
}
