import { prisma } from "../client";
import { parseRequisiteString } from "../utils/parse-requisite";

// Upsert units into the global catalogue
export async function upsertUnits(units: { unit_code: string; unit_name: string }[]) {
  return await Promise.all(
    units.map(u =>
      prisma.unit.upsert({
        where: { unit_code: u.unit_code },
        update: { unit_name: u.unit_name },
        create: { unit_code: u.unit_code, unit_name: u.unit_name },
      })
    )
  );
}

// Helper to format requisite groups back into a human-readable string for display/editing
export function formatRequisitesToString(requisite_groups: any): string {
  if (!requisite_groups || !Array.isArray(requisite_groups) || requisite_groups.length === 0) {
    return "";
  }
  return requisite_groups
    .map((g: any) =>
      g.conditions
        ?.map((c: any) => {
          if (c.type === "credit_points") return `${c.credit_points}cp`;
          const prefix =
            c.requisite_type === "corequisite"
              ? "Co: "
              : c.requisite_type === "antirequisite"
              ? "Anti: "
              : "";
          return `${prefix}${c.unit?.unit_code || c.unit_code || "?"}`;
        })
        .join(" & ")
    )
    .filter(Boolean)
    .join(" / ");
}

// 1. getAllUnits now includes requisite_groups
export async function getAllUnits() {
  const units = await prisma.unit.findMany({
    orderBy: { unit_code: "asc" },
    include: {
      offerings: {
        select: { offered_in: true },
      },
      requisite_groups: {
        include: {
          conditions: {
            include: { unit: { select: { unit_code: true } } },
          },
        },
      },
    },
  });

  return units.map((u) => ({
    id: u.id,
    unit_code: u.unit_code,
    unit_name: u.unit_name,
    offerings: u.offerings.map((o) => o.offered_in).sort((a, b) => a - b),
    prerequisite: formatRequisitesToString(u.requisite_groups),
    requisites: u.requisite_groups,
  }));
}

// 2. saveSingleUnit parses the string with parseRequisiteString and inserts into DB
export async function saveSingleUnit(data: {
  unit_code: string;
  unit_name: string;
  offerings?: number[];
  prerequisite?: string | null;
}) {
  const code = data.unit_code.trim().toUpperCase();
  const name = data.unit_name.trim();
  const termList = Array.isArray(data.offerings) ? data.offerings : [];
  const prereqStr = data.prerequisite?.trim() || "";

  return await prisma.$transaction(async (tx) => {
    // 1. Upsert Unit
    const unit = await tx.unit.upsert({
      where: { unit_code: code },
      update: { unit_name: name },
      create: { unit_code: code, unit_name: name },
    });

    // 2. Sync Offerings
    await tx.unitOffering.deleteMany({
      where: {
        unit_id: unit.id,
        offered_in: { notIn: termList },
      },
    });

    for (const term of termList) {
      await tx.unitOffering.upsert({
        where: {
          unit_id_offered_in: {
            unit_id: unit.id,
            offered_in: term,
          },
        },
        update: {},
        create: {
          unit_id: unit.id,
          offered_in: term,
        },
      });
    }

    // 3. Sync Requisites using parseRequisiteString
    // Clean up existing requisites for this unit first
    await tx.unitRequisiteCondition.deleteMany({
      where: { group: { unit_id: unit.id } },
    });
    await tx.unitRequisiteGroup.deleteMany({
      where: { unit_id: unit.id },
    });

    if (prereqStr) {
      const parsedGroups = parseRequisiteString(prereqStr);

      for (const group of parsedGroups) {
        // Collect valid conditions first before creating the group
        const validConditions: Array<{
          type: 'unit' | 'credit_points';
          unit_id: string | null;
          credit_points: number | null;
          requisite_type: string | null;
        }> = [];

        for (const cond of group.conditions) {
          const rawCode = (cond.unit_code || '').trim();

          // 1. Check Credit Points
          const isCreditPoints =
            cond.type === 'credit_points' ||
            /^\d+(\.\d+)?\s*cp$/i.test(rawCode);

          if (isCreditPoints) {
            let cp = cond.credit_points;
            if (cp == null && rawCode) {
              const match = rawCode.match(/^(\d+(\.\d+)?)/);
              cp = match ? parseFloat(match[1]) : 0;
            }

            // DB Constraint: type='credit_points', credit_points NOT NULL, unit_id=NULL, requisite_type=NULL
            validConditions.push({
              type: 'credit_points',
              unit_id: null,
              credit_points: Number(cp) || 0,
              requisite_type: null,
            });
            continue;
          }

          // 2. Check Unit Code
          // Clean up any stray punctuation or parentheses
          const cleanCode = rawCode.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
          
          // Skip empty or bogus codes (prevents unit_id: null)
          if (!cleanCode || cleanCode === '-' || cleanCode === 'NIL') {
            continue;
          }

          // Find or auto-create the prerequisite unit so unit_id is guaranteed not null
          let targetUnit = await tx.unit.findUnique({
            where: { unit_code: cleanCode },
            select: { id: true },
          });

          if (!targetUnit) {
            targetUnit = await tx.unit.create({
              data: {
                unit_code: cleanCode,
                unit_name: 'Unknown Unit',
              },
              select: { id: true },
            });
          }

          // DB Constraint: type='unit', unit_id NOT NULL, credit_points=NULL, requisite_type NOT NULL
          validConditions.push({
            type: 'unit',
            unit_id: targetUnit.id,
            credit_points: null,
            requisite_type: cond.requisite_type || 'prerequisite',
          });
        }

        // Only create the group and conditions if there is at least one valid condition
        if (validConditions.length > 0) {
          const createdGroup = await tx.unitRequisiteGroup.create({
            data: { unit_id: unit.id },
          });

          for (const validCond of validConditions) {
            await tx.unitRequisiteCondition.create({
              data: {
                group_id: createdGroup.id,
                type: validCond.type,
                unit_id: validCond.unit_id,
                credit_points: validCond.credit_points,
                requisite_type: validCond.requisite_type,
              },
            });
          }
        }
      }
    }

    return {
      ...unit,
      offerings: termList.sort((a, b) => a - b),
      prerequisite: prereqStr,
    };
  });
}

export async function getUnitById(id: string) {
  return await prisma.unit.findUnique({
    where: { id },
    include: {
      offerings: {
        select: { offered_in: true },
      },
      requisite_groups: {
        include: {
          conditions: true
        }
      }
    }
  });
}

export async function createUnit(data: any) {
  return await prisma.unit.create({
    data
  });
}

export async function updateUnit(id: string, data: any) {
  return await prisma.unit.update({
    where: { id },
    data
  });
}

export async function deleteUnit(id: string) {
  return await prisma.unit.delete({
    where: { id }
  });
}