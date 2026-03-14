import { updateUnitController, deleteUnitController } from "../../../../backend/controllers/unitController";

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  return updateUnitController(req, params.id);
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  return deleteUnitController(params.id);
}