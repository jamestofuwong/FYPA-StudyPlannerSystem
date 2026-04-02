import { prisma } from "../client";

export async function getConditionsByGroup(groupId: string) {
    return await prisma.unitPrerequisiteCondition.findMany({
        where: { group_id: groupId },
        include: {
            unit: true
        }
    });
}

export async function createCondition(data: {
    group_id: string
    prerequisite_type: string
    unit_id?: string
    credit_points?: number
}) {
    return await prisma.unitPrerequisiteCondition.create({
        data
    });
}

export async function deleteCondition(id: string) {
    return await prisma.unitPrerequisiteCondition.delete({
        where: { id }
    });
}