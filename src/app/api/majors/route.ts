import { getMajorsController, createMajorController } from "../../../backend/controllers/majorController";

export async function GET() {
  return getMajorsController();
}

export async function POST(req: Request) {
  return createMajorController(req);
}