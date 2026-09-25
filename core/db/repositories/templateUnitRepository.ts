import { prisma } from "../client";
import { parseRequisiteString } from "../utils/parse-requisite";

export async function getAllTemplateUnits() {
    return await prisma.templateUnit.findMany({
        include: {
        unit: true,
        template: true
        }
    });
}

export async function getTemplateUnitById(id: string) {
    return await prisma.templateUnit.findUnique({
        where: { id },
        include: {
            unit: true,
            template: true
        }
    });
}

export async function getTemplateUnitsByPlanner(plannerTemplateId: string) {
    return await prisma.templateUnit.findMany({
        where: { planner_template_id: plannerTemplateId },
        include: {
            unit: true
        }
    });
}

export async function createTemplateUnit(data: any) {
    return await prisma.templateUnit.create({
        data
    });
}

export async function updateTemplateUnit(id: string, data: any) {
    return await prisma.templateUnit.update({
        where: { id },
        data
    });
}

export async function deleteTemplateUnit(id: string) {
    return await prisma.templateUnit.delete({
        where: { id }
    });
}

// Update a planner unit and its linked catalogue data in one transaction.
export async function updateTemplateUnitDetails(id: string, plannerTemplateId: string, data: {
    unit_code?: string;
    unit_name?: string;
    offered_in?: number[];
    prerequisite?: string | null;
    category?: string;
    year_level?: number;
    semester?: number;
}) {
    return prisma.$transaction(async (tx) => {
        const templateUnit = await tx.templateUnit.findFirst({
            where: { id, planner_template_id: plannerTemplateId },
            select: { unit_id: true },
        });
        if (!templateUnit) throw new Error("Template unit not found");

        const unitId = templateUnit.unit_id;
        if (unitId) {
            await tx.unit.update({
                where: { id: unitId },
                data: {
                    ...(data.unit_code !== undefined ? { unit_code: data.unit_code.trim().toUpperCase() } : {}),
                    ...(data.unit_name !== undefined ? { unit_name: data.unit_name.trim() } : {}),
                },
            });

            if (data.offered_in !== undefined) {
                const offerings = [...new Set(data.offered_in.filter(Number.isInteger))];
                await tx.unitOffering.deleteMany({ where: { unit_id: unitId, offered_in: { notIn: offerings } } });
                for (const offered_in of offerings) {
                    await tx.unitOffering.upsert({
                        where: { unit_id_offered_in: { unit_id: unitId, offered_in } },
                        update: {},
                        create: { unit_id: unitId, offered_in },
                    });
                }
            }

            if (data.prerequisite !== undefined) {
                await tx.unitRequisiteCondition.deleteMany({ where: { group: { unit_id: unitId } } });
                await tx.unitRequisiteGroup.deleteMany({ where: { unit_id: unitId } });
                for (const group of parseRequisiteString(data.prerequisite?.trim() || "")) {
                    const conditions = [];
                    for (const condition of group.conditions) {
                        const rawCode = (condition.unit_code || "").trim();
                        if (condition.type === "credit_points") {
                            conditions.push({ type: "credit_points", unit_id: null, credit_points: Number(condition.credit_points) || 0, requisite_type: null });
                            continue;
                        }
                        const code = rawCode.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
                        if (!code || code === "NIL") continue;
                        let requisiteUnit = await tx.unit.findUnique({ where: { unit_code: code }, select: { id: true } });
                        if (!requisiteUnit) {
                            requisiteUnit = await tx.unit.create({ data: { unit_code: code, unit_name: "Unknown Unit" }, select: { id: true } });
                        }
                        conditions.push({ type: "unit", unit_id: requisiteUnit.id, credit_points: null, requisite_type: condition.requisite_type || "prerequisite" });
                    }
                    if (conditions.length > 0) {
                        const createdGroup = await tx.unitRequisiteGroup.create({ data: { unit_id: unitId } });
                        await tx.unitRequisiteCondition.createMany({ data: conditions.map((condition) => ({ group_id: createdGroup.id, ...condition })) });
                    }
                }
            }
        }

        return tx.templateUnit.update({
            where: { id },
            data: {
                ...(data.category ? { category: data.category as any } : {}),
                ...(data.year_level != null ? { year_level: data.year_level } : {}),
                ...(data.semester != null ? { semester: data.semester } : {}),
            },
            include: { unit: true },
        });
    });
}
