import { prisma } from '../lib/prisma'
import { hashPassword } from '../lib/cms/auth'

// ─── CMS User ────────────────────────────────────────────────────────────────

async function seedCmsUser() {
  const email = process.env.CMS_SEED_EMAIL ?? 'admin@example.com'
  const password = process.env.CMS_SEED_PASSWORD ?? 'changeme123'
  const name = process.env.CMS_SEED_NAME ?? 'Admin'

  const existing = await prisma.cmsUser.findUnique({ where: { email } })
  if (existing) {
    console.log(`CMS user already exists: ${email}`)
    return
  }
  await prisma.cmsUser.create({
    data: { email, password_hash: await hashPassword(password), name },
  })
  console.log(`Created CMS user: ${email} / ${password}`)
}

// ─── Content ─────────────────────────────────────────────────────────────────

async function seedContent() {
  if (await prisma.course.count() > 0) {
    console.log('Content already seeded, skipping.')
    return
  }

  // ── Units ─────────────────────────────────────────────────────────────────

  const unitDefs = [
    // Level 1
    { code: 'COS10009', name: 'Introduction to Programming',       year_level: 1, availability: [3, 8] },
    { code: 'COS10026', name: 'Next Step Programming',             year_level: 1, availability: [3, 8] },
    { code: 'MTH10006', name: 'Mathematics for Computing',         year_level: 1, availability: [3, 8] },
    { code: 'INF10003', name: 'Business Information Systems',      year_level: 1, availability: [3, 8] },
    { code: 'MPU3113',  name: 'Bahasa Melayu Komunikasi 2',        year_level: 1, availability: [3, 8] },
    { code: 'MPU3153',  name: 'Hubungan Etnik',                    year_level: 1, availability: [3, 8] },
    // Level 2
    { code: 'COS20007', name: 'Object Oriented Programming',       year_level: 2, availability: [3, 8] },
    { code: 'COS20019', name: 'Cloud Computing Architecture',      year_level: 2, availability: [3, 8] },
    { code: 'COS20016', name: 'Technical Documentation',           year_level: 2, availability: [3, 8] },
    { code: 'MTH20011', name: 'Introduction to Statistics',        year_level: 2, availability: [3, 8] },
    // Level 3 — BCS AI
    { code: 'COS30008', name: 'Data Structures and Patterns',      year_level: 3, availability: [3, 8] },
    { code: 'COS30018', name: 'Intelligent Systems',               year_level: 3, availability: [3, 8] },
    { code: 'COS30049', name: 'Computing Technology Innovation Project', year_level: 3, availability: [3, 8] },
    { code: 'INF30029', name: 'IT Project Management',             year_level: 3, availability: [3, 8] },
    { code: 'COS30014', name: 'Artificial Intelligence',           year_level: 3, availability: [3, 8] },
    { code: 'COS30082', name: 'Machine Learning',                  year_level: 3, availability: [3, 8] },
    { code: 'COS30043', name: 'Interface Design and Development',  year_level: 3, availability: [3, 8] },
    { code: 'COS30045', name: 'Data Visualisation',                year_level: 3, availability: [3, 8] },
    // Level 4 — BCS AI
    { code: 'COS40005', name: 'Computing Project',                 year_level: 4, availability: [3, 8] },
    { code: 'COS40007', name: 'Capstone Project 1',                year_level: 4, availability: [3, 8] },
    { code: 'COS40006', name: 'Deep Learning',                     year_level: 4, availability: [3] },
    { code: 'COS40003', name: 'Data Analysis',                     year_level: 4, availability: [3, 8] },
    { code: 'COS40008', name: 'Capstone Project 2',                year_level: 4, availability: [8] },
    { code: 'COS40019', name: 'Natural Language Processing',       year_level: 4, availability: [8] },
    { code: 'FTE30001', name: 'Work Integrated Learning',          year_level: 3, availability: [6, 11] },
    // Elective pool
    { code: 'COS30001', name: 'Database Management',               year_level: 3, availability: [3, 8] },
    { code: 'COS30017', name: 'Internet of Things',                year_level: 3, availability: [8] },
    { code: 'COS30033', name: 'Computer Networks',                 year_level: 3, availability: [3, 8] },
    { code: 'COS30041', name: 'Digital Forensics',                 year_level: 3, availability: [8] },
    { code: 'SWE30011', name: 'Software Testing and Quality',      year_level: 3, availability: [3] },
  ]

  const unitMap = new Map<string, string>() // code → id

  for (const def of unitDefs) {
    const unit = await prisma.unit.create({
      data: {
        code: def.code,
        name: def.name,
        credit_points: 12.5,
        year_level: def.year_level,
        availability: {
          create: def.availability.map(month => ({ month })),
        },
      },
    })
    unitMap.set(def.code, unit.id)
  }

  // [unit, requisite] pairs per type
  const prereqs: [string, string][] = [
    ['COS10026', 'COS10009'],
    ['COS20007', 'COS10009'],
    ['COS20019', 'COS10026'],
    ['COS30008', 'COS20007'],
    ['COS30018', 'COS20007'],
    ['COS30049', 'COS10009'],
    ['COS30082', 'COS30018'],
    ['COS30014', 'COS30018'],
    ['COS40005', 'COS30049'],
    ['COS40007', 'COS30008'],
    ['COS40006', 'COS30082'],
    ['COS40003', 'COS30082'],
    ['COS40008', 'COS40007'],
    ['COS40019', 'COS30082'],
    ['COS30017', 'COS20007'],
    ['COS30033', 'COS20007'],
    ['COS30041', 'COS10009'],
    ['SWE30011', 'COS20007'],
  ]

  // Co-requisites: must be enrolled in the same semester
  const coreqs: [string, string][] = [
    ['COS30082', 'COS30049'], // Machine Learning alongside Innovation Project
    ['COS40006', 'COS40003'], // Deep Learning alongside Data Analysis
    ['COS40007', 'COS40005'], // Capstone 1 alongside Computing Project
    ['COS40008', 'FTE30001'], // Capstone 2 alongside WIL in final semester
  ]

  // Anti-requisites: cannot be taken if the other has already been completed
  const antireqs: [string, string][] = [
    ['COS30014', 'COS30019'], // Artificial Intelligence replaces Intro to AI (stub — COS30019 not in seed but demonstrates the pattern)
    ['COS30043', 'INF20015'], // Interface Design overlaps with Systems Analysis
    ['COS30001', 'COS20031'], // Database Management overlaps with Database Design Project
  ].filter(([a, b]) => unitMap.has(a) && unitMap.has(b)) as [string, string][]

  type ReqPair = [string, string]
  async function createRequisites(pairs: ReqPair[], type: 'prerequisite' | 'corequisite' | 'antirequisite') {
    for (const [unitCode, reqCode] of pairs) {
      const unitId = unitMap.get(unitCode)
      const reqId = unitMap.get(reqCode)
      if (!unitId || !reqId) continue
      await prisma.unitRequisite.create({
        data: { unit_id: unitId, requisite_type: type, requisite_unit_id: reqId },
      })
    }
  }

  await createRequisites(prereqs, 'prerequisite')
  await createRequisites(coreqs, 'corequisite')
  await createRequisites(antireqs, 'antirequisite')

  console.log(`Created ${unitDefs.length} units`)

  // ── Courses & Majors ──────────────────────────────────────────────────────

  const bcs = await prisma.course.create({
    data: { name: 'Bachelor of Computer Science', code: 'BCS' },
  })

  const aiMajor = await prisma.major.create({
    data: { course_id: bcs.id, name: 'Artificial Intelligence' },
  })

  // (second major stub for the planner builder dropdown)
  await prisma.major.create({
    data: { course_id: bcs.id, name: 'Cybersecurity' },
  })

  console.log('Created courses and majors')

  // ── Planner 1: BCS Artificial Intelligence, March 2024 ───────────────────

  const planner1 = await prisma.plannerTemplate.create({
    data: {
      course_id: bcs.id,
      major_id: aiMajor.id,
      intake_month: 3,
      intake_year: 2024,
      duration_years: 3,
    },
  })

  const p1Semesters = [
    {
      year_number: 1, sem_number: 1,
      units: [
        { code: 'COS10009', category: 'core' as const },
        { code: 'COS10026', category: 'core' as const },
        { code: 'MTH10006', category: 'core' as const },
        { code: 'INF10003', category: 'prescribed_elective' as const },
        { code: 'MPU3113',  category: 'mpu' as const },
      ],
    },
    {
      year_number: 1, sem_number: 2,
      units: [
        { code: 'COS20007', category: 'core' as const },
        { code: 'COS20019', category: 'core' as const },
        { code: 'MTH20011', category: 'core' as const },
        { code: 'COS20016', category: 'core' as const },
        { code: 'MPU3153',  category: 'mpu' as const },
      ],
    },
    {
      year_number: 2, sem_number: 1,
      units: [
        { code: 'COS30008', category: 'core' as const },
        { code: 'COS30018', category: 'major_core' as const },
        { code: 'COS30049', category: 'major_core' as const },
        { code: 'INF30029', category: 'core' as const },
      ],
    },
    {
      year_number: 2, sem_number: 2,
      units: [
        { code: 'COS30014', category: 'major_core' as const },
        { code: 'COS30082', category: 'major_core' as const },
        { code: 'COS30043', category: 'prescribed_elective' as const },
        { code: 'COS30045', category: 'prescribed_elective' as const },
      ],
    },
    {
      year_number: 3, sem_number: 1,
      units: [
        { code: 'COS40005', category: 'major_core' as const },
        { code: 'COS40007', category: 'core' as const },
        { code: 'COS40006', category: 'major_core' as const },
        { code: 'COS40003', category: 'major_core' as const },
      ],
    },
    {
      year_number: 3, sem_number: 2,
      units: [
        { code: 'COS40008', category: 'core' as const },
        { code: 'COS40019', category: 'major_core' as const },
        { code: 'FTE30001', category: 'wil' as const },
        { code: null,       category: 'elective' as const },  // free elective slot
      ],
    },
  ]

  for (const sem of p1Semesters) {
    const semester = await prisma.semester.create({
      data: { template_id: planner1.id, year_number: sem.year_number, sem_number: sem.sem_number },
    })
    for (let i = 0; i < sem.units.length; i++) {
      const u = sem.units[i]
      await prisma.semesterUnit.create({
        data: {
          semester_id: semester.id,
          unit_id: u.code ? unitMap.get(u.code) ?? null : null,
          category: u.category,
          is_elective_slot: u.code === null,
          position: i + 1,
        },
      })
    }
  }

  // Elective pool for planner 1
  const p1ElectiveCodes = ['COS30001', 'COS30017', 'COS30033', 'COS30041', 'SWE30011', 'COS30043']
  for (const code of p1ElectiveCodes) {
    const uid = unitMap.get(code)
    if (uid) {
      await prisma.electivePoolUnit.create({ data: { template_id: planner1.id, unit_id: uid } })
    }
  }

  console.log('Created Planner 1: BCS Artificial Intelligence (March 2024)')

  // ── Planner 2: BCS Artificial Intelligence, August 2024 ──────────────────

  const planner2 = await prisma.plannerTemplate.create({
    data: {
      course_id: bcs.id,
      major_id: aiMajor.id,
      intake_month: 8,
      intake_year: 2024,
      duration_years: 3,
    },
  })

  // Same semester structure, shifted by one semester (starts in Sem 2)
  const p2Semesters = [
    {
      year_number: 1, sem_number: 1,
      units: [
        { code: 'COS10009', category: 'core' as const },
        { code: 'MTH10006', category: 'core' as const },
        { code: 'INF10003', category: 'prescribed_elective' as const },
        { code: 'MPU3113',  category: 'mpu' as const },
      ],
    },
    {
      year_number: 1, sem_number: 2,
      units: [
        { code: 'COS10026', category: 'core' as const },
        { code: 'COS20007', category: 'core' as const },
        { code: 'COS20016', category: 'core' as const },
        { code: 'MPU3153',  category: 'mpu' as const },
      ],
    },
    {
      year_number: 2, sem_number: 1,
      units: [
        { code: 'COS20019', category: 'core' as const },
        { code: 'MTH20011', category: 'core' as const },
        { code: 'COS30008', category: 'core' as const },
        { code: 'INF30029', category: 'core' as const },
      ],
    },
    {
      year_number: 2, sem_number: 2,
      units: [
        { code: 'COS30018', category: 'major_core' as const },
        { code: 'COS30049', category: 'major_core' as const },
        { code: 'COS30043', category: 'prescribed_elective' as const },
        { code: 'COS30045', category: 'prescribed_elective' as const },
      ],
    },
    {
      year_number: 3, sem_number: 1,
      units: [
        { code: 'COS30014', category: 'major_core' as const },
        { code: 'COS30082', category: 'major_core' as const },
        { code: 'COS40005', category: 'major_core' as const },
        { code: 'COS40007', category: 'core' as const },
      ],
    },
    {
      year_number: 3, sem_number: 2,
      units: [
        { code: 'COS40006', category: 'major_core' as const },
        { code: 'COS40003', category: 'major_core' as const },
        { code: 'COS40008', category: 'core' as const },
        { code: 'COS40019', category: 'major_core' as const },
        { code: 'FTE30001', category: 'wil' as const },
        { code: null,       category: 'elective' as const },
      ],
    },
  ]

  for (const sem of p2Semesters) {
    const semester = await prisma.semester.create({
      data: { template_id: planner2.id, year_number: sem.year_number, sem_number: sem.sem_number },
    })
    for (let i = 0; i < sem.units.length; i++) {
      const u = sem.units[i]
      await prisma.semesterUnit.create({
        data: {
          semester_id: semester.id,
          unit_id: u.code ? unitMap.get(u.code) ?? null : null,
          category: u.category,
          is_elective_slot: u.code === null,
          position: i + 1,
        },
      })
    }
  }

  for (const code of p1ElectiveCodes) {
    const uid = unitMap.get(code)
    if (uid) {
      await prisma.electivePoolUnit.create({ data: { template_id: planner2.id, unit_id: uid } })
    }
  }

  console.log('Created Planner 2: BCS Artificial Intelligence (August 2024)')

  // ── Help content ──────────────────────────────────────────────────────────

  const faqItems = [
    {
      question: 'How do I find the right study plan for my course?',
      answer: 'Use the Study Planners page to search by course name or major. Each plan shows a full semester-by-semester breakdown of required units. You can also use the Plan Builder to generate a personalised plan based on your intake and completed units.',
      position: 1,
    },
    {
      question: 'Can I take units out of sequence?',
      answer: 'Units must generally be taken in the order shown in your study plan. Prerequisites must be completed before you can enrol in a unit. Contact your Head of Department if you believe you have equivalent prior learning.',
      position: 2,
    },
    {
      question: 'What is a Prescribed Elective?',
      answer: 'Prescribed electives are units approved for your course and major. Unlike free electives, you must choose from the list of prescribed electives set by your faculty. Your study plan will list the options available to you.',
      position: 3,
    },
    {
      question: 'What is Work Integrated Learning (WIL)?',
      answer: 'WIL (FTE30001) is a mandatory industry placement unit typically completed in your final year. It provides real-world work experience relevant to your degree. Enrolment requires approval and is coordinated through the WIL office.',
      position: 4,
    },
    {
      question: 'How do I apply for a unit exemption or credit transfer?',
      answer: 'Submit a Credit Transfer Application through the student portal. Supporting documents such as transcripts and unit outlines from your previous institution will be required. Contact General Enquiries at Student HQ for assistance.',
      position: 5,
    },
    {
      question: 'Where can I get academic advice?',
      answer: 'You can reach out to your Head of Department for advice specific to your course and major. Their contact details are listed on the Heads of Department page under the Help section.',
      position: 6,
    },
  ]

  await prisma.faqItem.createMany({ data: faqItems })
  console.log(`Created ${faqItems.length} FAQ items`)

  await prisma.generalEnquiries.create({
    data: {
      venue_name: 'Student HQ',
      location: 'A001 – A002',
      hours: 'Mon – Fri, 9:00 am – 5:00 pm',
      closed_note: 'Closed on weekends and public holidays',
    },
  })

  await prisma.itHelpDesk.create({
    data: {
      telephone: '+6082 255000',
      email: 'servicedesk@swinburne.edu.my',
      location: 'G003',
      hours_mon_thu: '8:30 am – 5:30 pm',
      hours_fri: '8:30 am – 12:00 pm, 2:00 pm – 5:30 pm',
      closed_note: 'Closed on weekends and public holidays',
    },
  })

  await prisma.headOfDepartment.create({
    data: {
      faculty: 'Faculty of Engineering, Computing and Science',
      department: 'Department of Computing',
      name: 'Head of Department',
      email: 'hod-computing@swinburne.edu.my',
      position: 1,
    },
  })

  console.log('Created help content (FAQ, contacts, HOD)')
  console.log('Content seeded successfully.')
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  await seedCmsUser()
  await seedContent()
}

main().catch(console.error).finally(() => prisma.$disconnect())
