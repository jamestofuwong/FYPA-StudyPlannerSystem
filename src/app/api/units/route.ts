import { getUnitsController, createUnitController } from "../../../backend/controllers/unitController";

export async function GET() {
  return getUnitsController();
}

export async function POST(req: Request) {
  return createUnitController(req);
}