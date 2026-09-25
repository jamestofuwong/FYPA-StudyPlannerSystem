import { prisma } from "../client";
import type { PlannerImportPlanner, PlannerImportUnit } from "../../shared/types/plannerImport";
import { parseRequisiteString } from "../utils/parse-requisite";

function normaliseImportedUnitCode(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const code = value.trim().toUpperCase().replace(/[@#]+$/g, "");
  if (!code || code === "-" || code === "NONE") return null;
  if (/^ELECTIVE\s+\d+$/i.test(code)) return null;

  return code;
}

function toPlannerNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function getAllPlanners() {
  return await prisma.plannerTemplate.findMany({
    orderBy: {
      created_at: "desc",
    },
    include: {
      course: true,
      major: true,
      _count: {
        select: { units: true }
      }
    }
  });
}

// Maps semesters and terms to standard numeric values:
// 1 = Semester 1
// 2 = Semester 2
// 3 = Summer Term
// 4 = Winter Term
function parseOfferingTerms(value: unknown): number[] {
  if (value == null) return [];

  // Case 1: Direct number input (1 to 4)
  if (typeof value === "number") {
    return Number.isInteger(value) && value >= 1 && value <= 4 ? [value] : [];
  }

  // Case 2: Array of numbers/strings (e.g., [1, 2], ["Semester 1", "Summer"])
  if (Array.isArray(value)) {
    const terms = value.flatMap((item) => parseOfferingTerms(item));
    return [...new Set(terms)].sort((a, b) => a - b);
  }

  // Case 3: String parsing
  if (typeof value === "string") {
    const lower = value.toLowerCase().trim();
    if (!lower || lower === "-" || lower === "none" || lower === "n/a") return [];

    const result = new Set<number>();

    // 1. Keyword check for special terms
    if (lower.includes("summer")) {
      result.add(3);
    }
    if (lower.includes("winter")) {
      result.add(4);
    }

    // 2. Semester keywords (e.g. "sem 1", "semester 2", "s1", "s2")
    if (/(\bsem(ester)?\s*1\b|\bs1\b)/i.test(lower)) {
      result.add(1);
    }
    if (/(\bsem(ester)?\s*2\b|\bs2\b)/i.test(lower)) {
      result.add(2);
    }
    if (/(\bsem(ester)?\s*3\b|\bs3\b)/i.test(lower)) {
      result.add(3);
    }
    if (/(\bsem(ester)?\s*4\b|\bs4\b)/i.test(lower)) {
      result.add(4);
    }

    // 3. Fallback: extract standalone numbers 1 to 4 (e.g., "1, 2", "1 / 2", "1&2", "3")
    if (result.size === 0) {
      const numberMatches = lower.match(/[1-4]/g);
      if (numberMatches) {
        numberMatches.forEach((numStr) => result.add(Number(numStr)));
      }
    }

    return [...result].sort((a, b) => a - b);
  }

  return [];
}

export async function getAllPlannersWithUnits() {
  return await prisma.plannerTemplate.findMany({
    include: {
      course: true,
      major: true,
      units: {
        include: { 
          unit: {
            include: {
              offerings: { select: { offered_in: true }}
            }
          }
        }
      },
      elective_groups: {
        include: {
          units: {
            include: { 
              unit: {
                include: {
                  offerings: { select: { offered_in: true}}
                }
              }
            }
          }
        }
      },
      minors: {
        include: {
          units: {
            include: { 
              unit: {
                include: {
                  offerings: { select: { offered_in: true}}
                }
              }
            }
          }
        }
      }
    }
  });
}

export async function getPlannerById(id: string) {
  return await prisma.plannerTemplate.findUnique({
    where: { id },
    include: {
      course: true,
      major: true,
      units: {
        include: {
          unit: {
            include: {
              offerings: { select: { offered_in: true } },
              requisite_groups: {
                include: {
                  conditions: {
                    include: { unit: true }
                  }
                }
              }
            }
          }
        }
      },
      elective_groups: {
        include: {
          units: {
            include: {
              unit: {
                include: {
                  offerings: { select: { offered_in: true } },
                  requisite_groups: {
                    include: {
                      conditions: {
                        include: { unit: true }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      minors: {
        include: {
          units: {
            include: {
              unit: {
                include: {
                  offerings: { select: { offered_in: true } },
                  requisite_groups: {
                    include: {
                      conditions: {
                        include: { unit: true }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  });
}

export async function createPlanner(data: any) {
  return await prisma.plannerTemplate.create({
    data
  });
}

export async function updatePlanner(id: string, data: any) {
  return await prisma.plannerTemplate.update({
    where: { id },
    data
  });
}

// Update planner metadata and its related course/major names in one transaction.
export async function updatePlannerDetails(id: string, data: any) {
  return prisma.$transaction(async (tx) => {
    const planner = await tx.plannerTemplate.findUnique({
      where: { id },
      select: { course_id: true, major_id: true },
    });
    if (!planner) throw new Error("Planner not found");

    const {
      course_name,
      major_name,
      ...plannerFields
    } = data;

    if (course_name !== undefined) {
      await tx.course.update({
        where: { id: planner.course_id },
        data: { name: String(course_name).trim() },
      });
    }

    if (major_name !== undefined && planner.major_id) {
      await tx.major.update({
        where: { id: planner.major_id },
        data: { name: String(major_name).trim() },
      });
    }

    return tx.plannerTemplate.update({
      where: { id },
      data: plannerFields,
      include: { course: true, major: true },
    });
  });
}

export async function deletePlanner(id: string) {
  return await prisma.plannerTemplate.delete({
    where: { id }
  });
}

export async function getPlannersByCourse(courseId: string) {
  return await prisma.plannerTemplate.findMany({
    where: { course_id: courseId },
    include: {
      course: true,
      major: true
    }
  });
}

export async function savePlannerFromImport(planner: PlannerImportPlanner) {
  // Extract and validate input data
  const { course_information, categories } = planner;
  const courseName = course_information.course?.trim();
  const majorName = course_information.major?.trim() || null;

  if (!courseName) {
    throw new Error("Cannot save planner: missing course information.");
  }

  const intakeMonth = parseIntakeMonth(course_information.intake);
  // Transaction: all or nothing
  return await prisma.$transaction(async (tx) => {


    // ===================================================================================================
    // Section 1: Upsert Course & Major
    // ===================================================================================================
    let course = await tx.course.findFirst({
      where: { name: courseName },
    });

    if (!course) {
      course = await tx.course.create({
        data: { name: courseName },
      });
    }

    // Find or create major only if a major name is provided
    let major = null;
    if (majorName) {
      major = await tx.major.findFirst({
        where: {
          course_id: course.id,
          name: majorName,
        },
      });

      if (!major) {
        major = await tx.major.create({
          data: {
            name: majorName,
            course_id: course.id,
          },
        });
      }
    }


    // ===================================================================================================
    // Section 2: Check Duplicate & Create Planner Template
    // ===================================================================================================
    // Check for duplicate planner
    const existingPlanner = await tx.plannerTemplate.findFirst({
      where: {
        course_id: course.id,
        major_id: major?.id ?? null,
        intake_year: course_information.intake_year ?? 2025,
        intake_month: intakeMonth,
      },
    });

    if (existingPlanner) {
      throw new Error('DUPLICATE_PLANNER');
    }

    // Create planner tamplate
    const newPlanner = await tx.plannerTemplate.create({
      data: {
        course_id: course.id,
        major_id: major?.id ?? null,
        intake_year: course_information.intake_year ?? 2025,
        intake_month: intakeMonth,
        course_type: course_information.course_type || 'bachelor',
        duration_semesters: course_information.duration_semesters || 8,
        core_count: course_information.requirements?.core?.count ?? null,
        core_cp: course_information.requirements?.core?.cp ?? null,
        major_count: course_information.requirements?.major?.count ?? null,
        major_cp: course_information.requirements?.major?.cp ?? null,
        elective_count: course_information.requirements?.elective?.count ?? null,
        elective_cp: course_information.requirements?.elective?.cp ?? null,
        wil_count: course_information.requirements?.wil?.count ?? null,
        wil_cp: course_information.requirements?.wil?.cp ?? null,
      },
    });


    // ===================================================================================================
    // Section 3: Split Elective Units (Pool units / Slot units)
    // ===================================================================================================
    // Pool units: no year/semester
    // Slot units: placed in a specific year/semester
    const prescribedElective = categories.elective_groups?.prescribed_elective ?? [];
    const electiveUnits = categories.elective_groups?.elective ?? [];

    const electivePoolUnits = electiveUnits.filter(
      (u) => (u.year_level == null || u.semester == null) && u.unit_code && u.unit_code !== '-'
    );
    const electiveSlots = electiveUnits.filter(
      (u) => u.year_level != null && u.semester != null
    );


    // ===================================================================================================
    // Section 4: Collect All Placed Units
    // ===================================================================================================
    const allUnits: Array<{ unit_code: string; unit_name: string; cat: string; year_level: any; semester: any }> = [
      ...categories.core_units?.map((u: any) => ({ ...u, cat: 'core' })) ?? [],
      ...categories.major_units?.map((u: any) => ({ ...u, cat: 'major_core' })) ?? [],
      ...categories.mpu_group?.map((u: any) => ({ ...u, cat: 'mpu' })) ?? [],
      ...categories.wil_group?.map((u: any) => ({ ...u, cat: 'wil' })) ?? [],
      ...prescribedElective.map((u: any) => ({ ...u, cat: 'prescribed_elective' })),
      ...electiveSlots.map((u: any) => ({ ...u, cat: 'elective' })),
    ];


    // ===================================================================================================
    // Section 5: Normalise Unit Codes & Upsert Into Global Catelogue
    // ===================================================================================================
    const poolUnitsNormalised = electivePoolUnits
      .map((u) => ({ ...u, normCode: normaliseImportedUnitCode(u.unit_code) }))
      .filter((u) => u.normCode);

    const allUnitsNormalised = allUnits.map((u) => ({
      ...u,
      normCode: normaliseImportedUnitCode(u.unit_code),
    }));

    // Collect all unique unit codes
    const uniqueCodes = [
      ...new Set([
        ...poolUnitsNormalised.map((u) => u.normCode!),
        ...allUnitsNormalised.filter((u) => u.normCode).map((u) => u.normCode!),
      ]),
    ];

    const currentYear = course_information.intake_year ?? 0;
    const currentMonth = intakeMonth ?? 0;

    // Batch: get latest planner for all existing units at once
    const existingUnitsList = await tx.unit.findMany({
      where: { unit_code: { in: uniqueCodes } },
      select: { id: true, unit_code: true },
    });

    const existingUnitIds = existingUnitsList.map(u => u.id);
    const unitIdByCode = new Map(existingUnitsList.map(u => [u.unit_code, u.id]));

    // Build: unit_id -> latest planner year/month
    const unitLatestPlannerMap = new Map<string, { year: number; month: number }>();

    if (existingUnitIds.length > 0) {
      const latestPlannerRows = await tx.templateUnit.findMany({
        where: { unit_id: { in: existingUnitIds, not: null } },
        select: {
          unit_id: true,
          template: { select: { intake_year: true, intake_month: true } },
        },
        orderBy: [
          { template: { intake_year: 'desc' } },
          { template: { intake_month: 'desc' } },
        ],
      });

      for (const row of latestPlannerRows) {
        if (row.unit_id && !unitLatestPlannerMap.has(row.unit_id)) {
          unitLatestPlannerMap.set(row.unit_id, {
            year: row.template.intake_year,
            month: row.template.intake_month ?? 0,
          });
        }
      }
    }

    // Batch upsert all units into the global catalogue
    const upsertedUnits = await Promise.all(
      uniqueCodes.map(async (code) => {
        const match =
          poolUnitsNormalised.find((u) => u.normCode === code) ||
          allUnitsNormalised.find((u) => u.normCode === code);
        const safeName = (match?.unit_name || 'Unknown Unit').substring(0, 255);

        const existingUnitId = unitIdByCode.get(code);

        let unitRecord;
        if (existingUnitId) {
          const latest = unitLatestPlannerMap.get(existingUnitId);
          const latestYear = latest?.year ?? 0;
          const latestMonth = latest?.month ?? 0;

          const isNewer =
            currentYear > latestYear ||
            (currentYear === latestYear && currentMonth >= latestMonth);

          if (isNewer) {
            unitRecord = await tx.unit.update({
              where: { id: existingUnitId },
              data: { unit_name: safeName },
            });
          } else {
            unitRecord = await tx.unit.findUnique({ where: { id: existingUnitId } });
          }
        } else {
          unitRecord = await tx.unit.create({
            data: { unit_code: code, unit_name: safeName },
          });
        }

        // Save offerings if provided in imported unit
        if (unitRecord && match && (match as any).offered_in) {
          const terms = parseOfferingTerms((match as any).offered_in);
          for (const term of terms) {
            await tx.unitOffering.upsert({
              where: {
                unit_id_offered_in: {
                  unit_id: unitRecord.id,
                  offered_in: term,
                },
              },
              update: {},
              create: {
                unit_id: unitRecord.id,
                offered_in: term,
              },
            });
          }
        }

        return unitRecord;
      })
    );

    // Build unit_code -> unit lookup map
    const unitByCode = new Map(
      upsertedUnits
        .filter((u): u is NonNullable<typeof u> => u !== null)
        .map((u) => [u.unit_code, u])
    );


    // ===================================================================================================
    // Section 6: Create Elective Group & Link Pool Units
    // ===================================================================================================
    if (poolUnitsNormalised.length > 0) {
      const electiveGroup = await tx.electiveGroup.create({
        data: { planner_template_id: newPlanner.id },
      });

      await Promise.all(
        poolUnitsNormalised.map((u) => {
          const unitDef = unitByCode.get(u.normCode!);
          if (!unitDef) return;
          return tx.electiveGroupUnit.create({
            data: { elective_group_id: electiveGroup.id, unit_id: unitDef.id },
          });
        })
      );
    }


    // ===================================================================================================
    // Section 7: Create Template Untis (Placed Units + Slots)
    // ===================================================================================================
    const attachedUnitIds = new Set<string>();
    const templateUnitsToCreate = allUnitsNormalised
      .filter((u) => {

        // Allows empty elective slots
        const isEmptyElectiveSlot = u.cat === 'elective' && !u.normCode;
        if (!isEmptyElectiveSlot && !u.normCode) return false; // skip bad codes

        // Skip duplicate unit reference within the same planner
        if (u.normCode) {
          const unitDef = unitByCode.get(u.normCode);
          if (!unitDef || attachedUnitIds.has(unitDef.id)) return false;
          attachedUnitIds.add(unitDef.id);
        }
        return true;
      })
      .map((u) => ({
        planner_template_id: newPlanner.id,
        unit_id: u.normCode ? unitByCode.get(u.normCode)?.id ?? null : null,
        category: u.cat as any,
        year_level: toPlannerNumber(u.year_level, 1),
        semester: toPlannerNumber(u.semester, 1),
      }));

    await tx.templateUnit.createMany({ data: templateUnitsToCreate });


    // ===================================================================================================
    // Section 8: Save Minors
    // ===================================================================================================
    const minorGroups = categories.minor_groups ?? [];
    for (const minorGroup of minorGroups) {
      // Create minor record
      const minor = await tx.minor.create({
        data: {
          planner_template_id: newPlanner.id,
          name: minorGroup.minor_name,
        },
      });

      // Build minor-unit links (skip unmatched units)
      const minorUnitData = minorGroup.units
        .map(unit => {
          const normCode = normaliseImportedUnitCode(unit.unit_code);
          if (!normCode) return null;
          const unitDef = unitByCode.get(normCode);
          if (!unitDef) return null;
          return { minor_id: minor.id, unit_id: unitDef.id };
        })
        .filter(Boolean) as { minor_id: string; unit_id: string }[];
      
      // Batch insert all minor-unit links
      if (minorUnitData.length > 0) {
        await tx.minorUnit.createMany({ data: minorUnitData });
      }
    }


    // ===================================================================================================
    // Section 9: Insert Requisites
    // ===================================================================================================
    // Build lookup: unit -> latest planner year/month
    const allUnitIds = [...unitByCode.values()].map(u => u.id);

    // Batch check which units have existing requisites
    const existingRequisiteUnits = await tx.unitRequisiteGroup.findMany({
      where: { unit_id: { in: allUnitIds } },
      select: { unit_id: true },
    });
    const unitsWithRequisites = new Set(existingRequisiteUnits.map(r => r.unit_id));

    // Helper: Check new import
    function isNewerImport(unitId: string): boolean {
      const latest = unitLatestPlannerMap.get(unitId); 
      if (!latest) return true;
      return currentYear > latest.year || 
        (currentYear === latest.year && currentMonth >= latest.month);
    }

    // Combine placed units and pool units
    const allUnitsForRequisites = [
      ...allUnitsNormalised.filter(u => u.normCode),
      ...poolUnitsNormalised,
    ];

    // Fetch referenced prerequisite units
    const allRequisiteCodes = allUnitsForRequisites
      .flatMap(u => {
        const str = (u as any).prerequisite;
        if (!str) return [];
        return parseRequisiteString(str).flatMap(g => 
          g.conditions.filter(c => c.type === 'unit' && c.unit_code).map(c => c.unit_code!)
        );
      });

    const existingUnits = await tx.unit.findMany({
      where: { unit_code: { in: allRequisiteCodes } },
    });
    for (const eu of existingUnits) {
      if (!unitByCode.has(eu.unit_code)) unitByCode.set(eu.unit_code, eu);
    }

    // Process units with prerequisites
    for (const unit of allUnitsForRequisites) {
      const prereqString = (unit as any).prerequisite;
      const targetUnit = unitByCode.get(unit.normCode!);
      if (!targetUnit) continue;

      // Skip if older
      if (!isNewerImport(targetUnit.id)) continue;

      // Delete old requisites if they exist
      if (unitsWithRequisites.has(targetUnit.id)) {
        await tx.unitRequisiteCondition.deleteMany({
          where: { group: { unit_id: targetUnit.id } },
        });
        await tx.unitRequisiteGroup.deleteMany({
          where: { unit_id: targetUnit.id },
        });
      }

      if (!prereqString || prereqString.trim() === '') continue;

      // Insert new requisites
      const groups = parseRequisiteString(prereqString);
      for (const group of groups) {

        // Create prerequisite group (OR logic)
        const g = await tx.unitRequisiteGroup.create({ data: { unit_id: targetUnit.id } });
        
        // Create conditions within group (AND logic)
        for (const cond of group.conditions) {
          
          // Skip unit-type conditions referencing unknown unit codes
          if (cond.type === 'unit' && cond.unit_code) {
            if (!unitByCode.has(cond.unit_code)) {
              continue;
            }
          }

          await tx.unitRequisiteCondition.create({
            data: {
              group_id: g.id,
              type: cond.type,
              unit_id: cond.type === 'unit' && cond.unit_code
                ? unitByCode.get(cond.unit_code)?.id ?? null
                : null,
              credit_points: cond.type === 'credit_points' ? cond.credit_points ?? null : null,
              requisite_type: cond.requisite_type ?? null,
            },
          });
        }
      }
    }

    // Clean up requisites for units without prerequisites
    const allUnitCodes = [
      ...allUnitsNormalised.filter(u => u.normCode).map(u => u.normCode!),
      ...poolUnitsNormalised.map(u => u.normCode!),
    ];

    for (const code of allUnitCodes) {
      const targetUnit = unitByCode.get(code);
      if (!targetUnit) continue;

      const hasPrereqInImport = allUnitsForRequisites.some(
        u => u.normCode === code && (u as any).prerequisite?.trim()
      );
      if (hasPrereqInImport) continue;

      if (!unitsWithRequisites.has(targetUnit.id)) continue;
      if (!isNewerImport(targetUnit.id)) continue;

      await tx.unitRequisiteCondition.deleteMany({
        where: { group: { unit_id: targetUnit.id } },
      });
      await tx.unitRequisiteGroup.deleteMany({
        where: { unit_id: targetUnit.id },
      });
    }
    return newPlanner;
  });
}

// ---------------------------------------------------------------------------
// Export a stored PlannerTemplate back to PlannerImportPlanner format
// so the local app can pull planners from the cloud and save them locally.
// ---------------------------------------------------------------------------

export async function exportPlannerAsImport(templateId: string): Promise<PlannerImportPlanner | null> {
  const template = await getPlannerById(templateId);
  if (!template) return null;

  const t = template; // capture non-null reference for use in nested callbacks

  // Helper to extract numeric arroy from unit.offerings
  const mapOfferings = (unit: any): number[] => {
    if (!unit?.offerings || !Array.isArray(unit.offerings)) return [];
    return unit.offerings.map((o: any) => o.offered_in).sort((a: number, b: number) => a - b);
  };

  const byCategory = (cat: string) =>
    t.units.filter((tu: any) => tu.category === cat).map((tu: any): PlannerImportUnit => ({
      unit_code: tu.unit?.unit_code ?? '-',
      unit_name: tu.unit?.unit_name ?? 'Unknown Unit',
      year_level: tu.year_level,
      semester: tu.semester,
      category: tu.category,
      prerequisite: null,
      offered_in: mapOfferings(tu.unit),
      requisites: tu.unit?.requisite_groups?.map((g: any) => ({
        conditions: g.conditions.map((c: any) => ({
          type: c.type,
          unit: c.unit ? { unit_code: c.unit.unit_code } : null,
          credit_points: c.credit_points != null ? Number(c.credit_points) : null,
          requisite_type: c.requisite_type ?? null,
        })),
      })) ?? null,
    }));

  // Elective pool units live in ElectiveGroup, not TemplateUnit
  const poolUnits: PlannerImportUnit[] = t.elective_groups.flatMap((eg: any) =>
    eg.units.map((egu: any) => ({
      unit_code: egu.unit?.unit_code ?? '-',
      unit_name: egu.unit?.unit_name ?? 'Unknown Unit',
      year_level: null,
      semester: null,
      category: 'elective',
      prerequisite: null,
      offered_in: mapOfferings(egu.unit),
      requisites: egu.unit?.requisite_groups?.map((g: any) => ({
        conditions: g.conditions.map((c: any) => ({
          type: c.type,
          unit: c.unit ? { unit_code: c.unit.unit_code } : null,
          credit_points: c.credit_points != null ? Number(c.credit_points) : null,
          requisite_type: c.requisite_type ?? null,
        })),
      })) ?? null,
    }))
  );

  return {
    file_name: `${t.course.name} - ${t.major?.name ?? 'General'} ${t.intake_year}.pdf`,
    course_information: {
      course: t.course.name,
      major: t.major?.name ?? 'General Program',
      intake: intakeMonthToString(t.intake_month),
      intake_year: t.intake_year,
      course_type: t.course_type,
      duration_semesters: t.duration_semesters,
      requirements: {
        core:     { count: t.core_count,     cp: t.core_cp },
        major:    { count: t.major_count,    cp: t.major_cp },
        elective: { count: t.elective_count, cp: t.elective_cp },
        wil:      { count: t.wil_count,      cp: t.wil_cp },
      },
    },
    categories: {
      core_units:  byCategory('core'),
      major_units: byCategory('major_core'),
      mpu_group:   byCategory('mpu'),
      wil_group:   byCategory('wil'),
      elective_groups: {
        prescribed_elective: byCategory('prescribed_elective'),
        elective: [...byCategory('elective'), ...poolUnits],
      },
      minor_groups: t.minors.map((minor: any) => ({
        minor_name: minor.name,
        units: minor.units.map((mu: any) => ({
          unit_code: mu.unit.unit_code,
          unit_name: mu.unit.unit_name,
          year_level: null,
          semester: null,
          category: null,
          prerequisite: null,
          offered_in: mapOfferings(mu.unit),
        })),
      })),
    },
  };
}

function intakeMonthToString(month: number | null): string {
  if (!month) return '';
  const names: Record<number, string> = {
    1: 'January', 2: 'February', 3: 'March',    4: 'April',
    5: 'May',     6: 'June',     7: 'July',      8: 'August',
    9: 'September', 10: 'October', 11: 'November', 12: 'December',
  };
  return names[month] ?? '';
}

// ===================================================================================================
// Helper Function
// ===================================================================================================
function parseIntakeMonth(intake: string): number | null {
  const lower = intake?.toLowerCase().trim() || '';
  if (!lower) return null;

  // Handle semester format: "Semester 1", "Semester 2"
  const semMatch = lower.match(/semester\s*(\d)/i);
  if (semMatch) {
    const sem = parseInt(semMatch[1]);
    // Semester 1 = Feb/Mar intake, Semester 2 = Aug/Sep intake
    return sem === 1 ? 2 : sem === 2 ? 8 : null;
  }

  // Handle month format: "Feb/Mar", "September"
  const firstMonth = lower.split('/')[0].trim();

  // Use substring matching so formats like "March intake", "March 2026",
  // "March/September" and plain "March" are all handled correctly.
  const months: Array<[string, number]> = [
    ['january', 1], ['february', 2], ['march', 3], ['april', 4],
    ['may', 5], ['june', 6], ['july', 7], ['august', 8],
    ['september', 9], ['october', 10], ['november', 11], ['december', 12],
    ['jan', 1], ['feb', 2], ['mar', 3], ['apr', 4],
    ['jun', 6], ['jul', 7], ['aug', 8], ['sep', 9], ['sept', 9],
    ['oct', 10], ['nov', 11], ['dec', 12],
  ];

  for (const [key, val] of months) {
    if (lower.includes(key)) return val;
  }
  return null;
}
