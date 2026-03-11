import { pingController } from "../../../backend/controllers/pingController";

export async function GET() {
  return pingController();
}
