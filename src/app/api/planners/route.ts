import { getPlannersController, createPlannerController } from "../../../backend/controllers/plannerController";

export async function GET() {
  return getPlannersController();
}

export async function POST(req: Request) {
  return createPlannerController(req);
}