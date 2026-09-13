import { prisma } from "../client";

// Check if unit codes exist in the databse
export async function checkUnitsExist(codes: string[]): Promise<string[]> {
  const existingUnits = await prisma.unit.findMany({
    where: { unit_code: { in: codes } },
    select: { unit_code: true },
  });
  return existingUnits.map(u => u.unit_code);
}

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

// Fetch all units with their offerings, sorted by unit_code
export async function getAllUnits() {
  const units = await prisma.unit.findMany({
    orderBy: { unit_code: "asc" },
    include: {
      offerings: {
        select: { offered_in: true },
      },
    },
  });

  return units.map((u) => ({
    id: u.id,
    unit_code: u.unit_code,
    unit_name: u.unit_name,
    offerings: u.offerings.map((o) => o.offered_in).sort((a, b) => a - b),
  }));
}
export async function saveSingleUnit(data: {
  unit_code: string;
  unit_name: string;
  offerings?: number[];
}) {
  const code = data.unit_code.trim().toUpperCase();
  const name = data.unit_name.trim();
  const termList = Array.isArray(data.offerings) ? data.offerings : [];

  return await prisma.$transaction(async (tx) => {
    // 1. Upsert Unit record
    const unit = await tx.unit.upsert({
      where: { unit_code: code },
      update: { unit_name: name },
      create: { unit_code: code, unit_name: name },
    });

    // 2. Synchronize offerings: remove terms that are no longer selected
    await tx.unitOffering.deleteMany({
      where: {
        unit_id: unit.id,
        offered_in: { notIn: termList },
      },
    });

    // 3. Upsert selected terms
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

    return {
      ...unit,
      offerings: termList.sort((a, b) => a - b),
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