// @ts-nocheck
import { PrismaClient, UnitCategory } from '@prisma/client'
import * as dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

// Pass the URL directly to the constructor to bypass any initialization errors
const prisma = new PrismaClient();


async function main() {
  console.log("Seeding Database...")

  // 1. DATA DEFINITIONS
  const ALL_GLOBAL_UNITS = [
    // Core Units 
    { code: 'COS10009', name: 'Introduction to Programming' },
    { code: 'COS10004', name: 'Computer Systems' },
    { code: 'COS20007', name: 'Object Oriented Programming' },
    { code: 'COS10026', name: 'Web Technology Project' },
    { code: 'TNE10006', name: 'Networks and Switching' },
    { code: 'COS10025', name: 'Technology in an Indigenous Context Project' },
    { code: 'COS40005', name: 'Computing Technology Project A' },
    { code: 'COS40006', name: 'Computing Technology Project B' },
    // common major units
    { code: 'COS20019', name: 'Cloud Computing Architecture' },
    { code: 'COS20031', name: 'Database Design Project' },
    { code: 'COS30049', name: 'Computing Technology Innovation Project' },
    { code: 'SWE30003', name: 'Software Architecture and Design' },
    // Software Development specific
    { code: 'COS30008', name: 'Data Structures and Patterns' },
    { code: 'COS30043', name: 'Interface Design and Development' },
    { code: 'COS40003', name: 'Concurrent Programming' },
    { code: 'SWE30009', name: 'Software Testing and Reliability' },
    // Cybersecurity specific
    { code: 'COS20030', name: 'Malware Analysis' },
    { code: 'COS30015', name: 'IT Security' },
    { code: 'TNE20003', name: 'Internet and Cybersecurity for Engineering Applications' },
    { code: 'TNE30009', name: 'Network Security and Resilience' },
    // Data Science specific
    { code: 'COS10022', name: 'Data Science Principles' },
    { code: 'COS20028', name: 'Big Data Architecture and Application' },
    { code: 'COS30045', name: 'Data Visualisation' },
    { code: 'SWE40006', name: 'Software Deployment and Evolution' },
    // AI specific
    { code: 'COS30018', name: 'Intelligent Systems' },
    { code: 'COS30019', name: 'Introduction to Artificial Intelligence' },
    { code: 'COS30082', name: 'Applied Machine Learning' },
    { code: 'COS40007', name: 'Artificial Intelligence for Engineering' },
    // IoT specific
    { code: 'COS30017', name: 'Software Development for Mobile Devices' },
    { code: 'SWE30011', name: 'IoT Programming' },
    { code: 'TNE10005', name: 'Network Administration' },
    { code: 'COS30020', name: 'Advanced Web Development' },
  ];

  const MAJORS_DATA = [
    {
      code: 'CS-SD',
      name: 'Software Development',
      units: ['COS30008', 'COS30043', 'COS40003', 'SWE30009']
    },
    {
      code: 'CS-CYB',
      name: 'Cybersecurity',
      units: ['COS20030', 'COS30015', 'TNE20003', 'TNE30009']
    },
    {
      code: 'CS-DS',
      name: 'Data Science',
      units: ['COS10022', 'COS20028', 'COS30045', 'SWE40006']
    },
    {
      code: 'CS-AI',
      name: 'Artificial Intelligence',
      units: ['COS30018', 'COS30019', 'COS30082', 'COS40007']
    },
    {
      code: 'CS-IOT',
      name: 'Internet of Things',
      units: ['COS30017', 'SWE30011', 'TNE10005','COS30020']
    }
  ];

  // 2. CREATE COURSE
  const course = await prisma.course.upsert({
    where: { code: 'BA-CS' },
    update: {},
    create: {
      code: 'BA-CS',
      name: 'Bachelor of Computer Science',
      scraper_aliases: ["B.Comp.Sc", "Bachelor CS", "BCS"]
    }
  });

  // 3. CREATE GLOBAL UNITS (The Warehouse)
  console.log("Seeding Global Unit Catalogue...");
  for (const u of ALL_GLOBAL_UNITS) {
    await prisma.unit.upsert({
      where: { unit_code: u.code },
      update: {},
      create: { 
        unit_code: u.code, 
        unit_name: u.name 
      }
    });
  }

  // 4. CREATE MAJORS & PLANNER TEMPLATES
  console.log("Seeding Majors and Templates...");
  for (const majorInfo of MAJORS_DATA) {
    // A. Create/Update the Major
    const major = await prisma.major.upsert({
      where: { code: majorInfo.code },
      update: {},
      create: {
        code: majorInfo.code,
        name: majorInfo.name,
        course_id: course.id
      }
    });

    // B. Create a Planner Template for 2024 (March Intake)
    // We use 'create' here. To avoid errors on re-run, you could use upsert if you had a unique ID.
    // For a beginner seed, we'll check if it exists first manually.
    const existingTemplate = await prisma.plannerTemplate.findFirst({
      where: { major_id: major.id, intake_year: 2024, intake_month: 3 }
    });

    if (!existingTemplate) {
      const template = await prisma.plannerTemplate.create({
        data: {
          course_id: course.id,
          major_id: major.id,
          intake_year: 2024,
          intake_month: 3,
          label: `BA-CS (${major.name}) Mar 2024`,
        }
      });

      // C. Link the Units to this specific Template
      for (const unitCode of majorInfo.units) {
        const dbUnit = await prisma.unit.findUnique({ where: { unit_code: unitCode } });
        
        if (dbUnit) {
          await prisma.templateUnit.create({
            data: {
              planner_template_id: template.id,
              unit_id: dbUnit.id,
              category: UnitCategory.core, // You can make this dynamic later
              year_level: 1,
              semester: 1
            }
          });
        }
      }
    }
  }

  console.log("Seeding complete. All 5 majors ready.");
}

main()
  .catch((e) => {
    console.error("Seed Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });