import { getMockStudentController } from "../../../../backend/controllers/studentController";

export async function GET() {
  return getMockStudentController();
}