import { prisma } from "../client";
import type { PlannerImportPlanner } from "../../shared/types/plannerImport";
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

export async function getAllPlannersWithUnits() {
  return await prisma.plannerTemplate.findMany({
    include: {
      course: true,
      major: true,
      units: {
        include: { unit: true }
      },
      elective_groups: {
        include: {
          units: {
            include: { unit: true }
          }
        }
      },
      minors: {
        include: {
          units: {
            include: { unit: true }
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
              requisite_groups:{
                include: {
                  conditions: {
                    include: {unit: true,}
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
                  requisite_groups: {
                    include: {
                      conditions: {
                        include: {unit: true,}
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
                  requisite_groups: {
                    include: {
                      conditions: {
                        include: {
                          unit: true,
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
  const majorName = course_information.major?.trim() || "General Program";

  if (!courseName) {
    throw new Error("Cannot save planner: missing course information.");
  }

  const intakeMonth = parseIntakeMonth(course_information.intake);
  // Transaction: all or nothing
  return await prisma.$transaction(async (tx) => {


    // ===================================================================================================
    // Section 1: Upsert Course & Major
    // ===================================================================================================
    // Upsert Course
    const [course] = await Promise.all([
      tx.course.upsert({
        where: { name: courseName },
        update: {},
        create: { code: courseName, name: courseName },
      }),
    ]);

    // Find major by course_id + name or create if new
    const major = await tx.major.upsert({
      where: { course_id_name: { course_id: course.id, name: majorName } },
      update: {},
      create: { name: majorName, course_id: course.id },
    });


    // ===================================================================================================
    // Section 2: Check Duplicate & Create Planner Template
    // ===================================================================================================
    // Check for duplicate planner
    const existingPlanner = await tx.plannerTemplate.findFirst({
      where: {
        course_id: course.id,
        major_id: major.id,
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
        major_id: major.id,
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
    // Section 5: Normaalise Unit Codes & Upsert Into Global Catelogue
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

    // Batch upsert all units into the global catelogue
    const upsertedUnits = await Promise.all(
      uniqueCodes.map((code) => {
        const match =
          poolUnitsNormalised.find((u) => u.normCode === code) ||
          allUnitsNormalised.find((u) => u.normCode === code);
        const safeName = (match?.unit_name || 'Unknown Unit').substring(0, 255);
        return tx.unit.upsert({
          where: { unit_code: code },
          update: { unit_name: safeName },
          create: { unit_code: code, unit_name: safeName },
        });
      })
    );

    // Build lookup map: unit_code = unit record
    const unitByCode = new Map(upsertedUnits.map((u) => [u.unit_code, u]));


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
    if (minorGroups.length > 0) {
      for (const minorGroup of minorGroups) {
        const minor = await tx.minor.create({
          data: {
            planner_template_id: newPlanner.id,
            name: minorGroup.minor_name,
          },
        });

        for (const unit of minorGroup.units) {
          const normCode = normaliseImportedUnitCode(unit.unit_code);
          if (!normCode) continue;
          
          const unitDef = unitByCode.get(normCode);
          if (unitDef) {
            await tx.minorUnit.create({
              data: {
                minor_id: minor.id,
                unit_id: unitDef.id,
              },
            });
          }
        }
      }
    }


    // ===================================================================================================
    // Section 9: Insert Requisites
    // ===================================================================================================
    // Combine placed units and pool units
    const allUnitsForRequisites = [
      ...allUnitsNormalised.filter(u => u.normCode),
      ...poolUnitsNormalised,
    ];

    // Fetch existing units that are referenced in requisites but not in this import
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

    // Add found units to the lookup map
    for (const eu of existingUnits) {
      if (!unitByCode.has(eu.unit_code)) {
        unitByCode.set(eu.unit_code, eu);
      }
    }

    // Process each unit's prerequisite string
    for (const unit of allUnitsForRequisites) {
      const prereqString = (unit as any).prerequisite;
      if (!prereqString || prereqString.trim() === '') continue;

      const targetUnit = unitByCode.get(unit.normCode!);
      if (!targetUnit) continue;

      // Skip if this unit already has requisites
      const existingGroups = await tx.unitRequisiteGroup.count({
        where: { unit_id: targetUnit.id },
      });
      if (existingGroups > 0) continue;

      // Parse the string into structured groups and conditions
      const groups = parseRequisiteString(prereqString);

      // Insert groups (OR) and conditions (AND)
      for (const group of groups) {
        const g = await tx.unitRequisiteGroup.create({
          data: { unit_id: targetUnit.id },
        });

        for (const cond of group.conditions) {
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
    
    return newPlanner;
  });
}

function parseIntakeMonth(intake: string): number | null {
  const lower = intake?.toLowerCase().trim() || '';
  if (!lower) return null;

  const firstMonth = lower.split('/')[0].trim();
  const months: Record<string, number> = {
    january: 1, jan: 1,
    february: 2, feb: 2,
    march: 3, mar: 3,
    april: 4, apr: 4,
    may: 5,
    june: 6, jun: 6,
    july: 7, jul: 7,
    august: 8, aug: 8,
    september: 9, sep: 9, sept: 9,
    october: 10, oct: 10,
    november: 11, nov: 11,
    december: 12, dec: 12,
  };

  return months[firstMonth] ?? null;
}