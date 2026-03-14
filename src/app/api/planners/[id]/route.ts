import { updatePlannerController, deletePlannerController } from "../../../../backend/controllers/plannerController";

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  return updatePlannerController(req, params.id);
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  return deletePlannerController(params.id);
}