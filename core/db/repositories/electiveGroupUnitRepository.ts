import { prisma } from "../client";

export async function getAllElectiveGroupUnits() {
    return await prisma.electiveGroupUnit.findMany({
        include: {
        unit: true,
        elective_group: true
        }
    });
}

export async function getElectiveGroupUnitsByGroup(electiveGroupId: string) {
    return await prisma.electiveGroupUnit.findMany({
        where: { elective_group_id: electiveGroupId },
        include: {
            unit: true
        }
    });
}

export async function createElectiveGroupUnit(data: {
    elective_group_id: string
    unit_id: string
}) {
    return await prisma.electiveGroupUnit.create({
        data
    });
}

export async function deleteElectiveGroupUnit(electiveGroupId: string, unitId: string) {
    return await prisma.electiveGroupUnit.delete({
        where: {
            elective_group_id_unit_id: {
                elective_group_id: electiveGroupId,
                unit_id: unitId
            }
        }
    });
}