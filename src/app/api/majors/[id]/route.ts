import { updateMajorController, deleteMajorController } from "../../../../backend/controllers/majorController";

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  return updateMajorController(req, params.id);
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  return deleteMajorController(params.id);
}