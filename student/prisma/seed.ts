import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { hashPassword } from '../lib/cms/auth'

const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL!
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
})


// -----------------------------------------------------------------------------
// Complex requisite groups and requirement totals remain intentionally excluded.
// -----------------------------------------------------------------------------

type UnitCategory = 'core' | 'major_core' | 'prescribed_elective' | 'elective' | 'wil' | 'mpu'

type SourceUnit = {
  code: string
  name: string
  offeredIn: number[]
  compatibilityYearLevel: number | null
}

type SourcePlacement = {
  code: string
  category: UnitCategory
  year: number
  term: number
}

type SourcePlanner = {
  courseCode: string
  major: string
  intakeYear: number
  intakeMonth: number
  placements: SourcePlacement[]
  electiveSlots: { year: number; term: number }[]
}

type SourceElectiveGroup = {
  courseCode: string
  major: string
  intakeYear: number
  intakeMonth: number
  units: string[]
}

const SOURCE_COURSE = {
  code: 'BA-CS',
  name: 'Bachelor of Computer Science',
}

const SOURCE_MAJORS = [
  'Artificial Intelligence',
  'Cybersecurity',
  'Data Science',
  'Internet of Things',
  'Software Development',
] as const

const SOURCE_UNITS: SourceUnit[] = [
  {"code": "COS10003", "name": "Computer and Logic Essentials", "offeredIn": [1, 2], "compatibilityYearLevel": 1},
  {"code": "COS10004", "name": "Computer Systems", "offeredIn": [1, 2], "compatibilityYearLevel": 2},
  {"code": "COS10009", "name": "Introduction to Programming", "offeredIn": [1, 2], "compatibilityYearLevel": 1},
  {"code": "COS10011", "name": "Creating Web Applications", "offeredIn": [1, 2], "compatibilityYearLevel": 1},
  {"code": "COS10022", "name": "Introduction to Data Science", "offeredIn": [1, 2], "compatibilityYearLevel": 1},
  {"code": "COS10025", "name": "Technology in an Indigenous Context Project", "offeredIn": [1, 2], "compatibilityYearLevel": 1},
  {"code": "COS10026", "name": "Web Technology Project", "offeredIn": [1, 2], "compatibilityYearLevel": 1},
  {"code": "COS10082", "name": "Applied Analytics in Business", "offeredIn": [2], "compatibilityYearLevel": 1},
  {"code": "COS20001", "name": "User-Centred Design", "offeredIn": [1, 2], "compatibilityYearLevel": 1},
  {"code": "COS20007", "name": "Object-oriented Programming", "offeredIn": [1, 2], "compatibilityYearLevel": 1},
  {"code": "COS20015", "name": "Fundamentals of Data Management", "offeredIn": [1], "compatibilityYearLevel": 1},
  {"code": "COS20019", "name": "Cloud Computing Architecture", "offeredIn": [1, 2], "compatibilityYearLevel": 1},
  {"code": "COS20028", "name": "Big Data Architecture and Application", "offeredIn": [2], "compatibilityYearLevel": 2},
  {"code": "COS20030", "name": "Malware Analysis", "offeredIn": [2], "compatibilityYearLevel": 2},
  {"code": "COS20031", "name": "Database Design Project", "offeredIn": [1, 2], "compatibilityYearLevel": 2},
  {"code": "COS20083", "name": "Advanced Data Analytics", "offeredIn": [1], "compatibilityYearLevel": 2},
  {"code": "COS30008", "name": "Data Structure and Patterns", "offeredIn": [2], "compatibilityYearLevel": 2},
  {"code": "COS30015", "name": "IT Security", "offeredIn": [1, 2], "compatibilityYearLevel": 1},
  {"code": "COS30017", "name": "Software Development for Mobile Devices", "offeredIn": [1, 2], "compatibilityYearLevel": 2},
  {"code": "COS30018", "name": "Intelligent Systems", "offeredIn": [1], "compatibilityYearLevel": 2},
  {"code": "COS30019", "name": "Introduction to Artificial Intelligence", "offeredIn": [1, 2], "compatibilityYearLevel": 2},
  {"code": "COS30020", "name": "Advanced Web Development", "offeredIn": [2], "compatibilityYearLevel": 2},
  {"code": "COS30041", "name": "Creating Secure and Scalable Software", "offeredIn": [2], "compatibilityYearLevel": 2},
  {"code": "COS30043", "name": "Interface Design and Development", "offeredIn": [1], "compatibilityYearLevel": 2},
  {"code": "COS30045", "name": "Data Visualisation", "offeredIn": [2], "compatibilityYearLevel": 2},
  {"code": "COS30047", "name": "Security Operations Centre", "offeredIn": [1, 2], "compatibilityYearLevel": 3},
  {"code": "COS30049", "name": "Computing Technology Innovation Project", "offeredIn": [1, 2], "compatibilityYearLevel": 2},
  {"code": "COS30081", "name": "Fundamentals of Natural Language Processing", "offeredIn": [1], "compatibilityYearLevel": 2},
  {"code": "COS30082", "name": "Applied Machine Learning", "offeredIn": [2], "compatibilityYearLevel": 2},
  {"code": "COS40003", "name": "Concurrent Programming", "offeredIn": [2], "compatibilityYearLevel": 3},
  {"code": "COS40005", "name": "Computing Technology Project A", "offeredIn": [1, 2], "compatibilityYearLevel": 3},
  {"code": "COS40006", "name": "Computing Technology Project B", "offeredIn": [1, 2], "compatibilityYearLevel": 3},
  {"code": "COS40007", "name": "Artificial Intelligence for Engineering", "offeredIn": [1], "compatibilityYearLevel": 3},
  {"code": "ICT20016", "name": "Work-Integrated Learning", "offeredIn": [3, 4], "compatibilityYearLevel": 2},
  {"code": "ICT20016*Optional", "name": "Work-Integrated Learning", "offeredIn": [4], "compatibilityYearLevel": 2},
  {"code": "ICT30005", "name": "Professional Issues in IT", "offeredIn": [1, 2], "compatibilityYearLevel": 3},
  {"code": "ICT30010", "name": "eForensic Fundamentals", "offeredIn": [1], "compatibilityYearLevel": 2},
  {"code": "INF10003", "name": "International Business Operations", "offeredIn": [], "compatibilityYearLevel": null},
  {"code": "INF10024", "name": "Business Digitalisation", "offeredIn": [1, 2], "compatibilityYearLevel": 1},
  {"code": "INF30020", "name": "Information Systems Risk and Security", "offeredIn": [2], "compatibilityYearLevel": 2},
  {"code": "MGT10010", "name": "Ethics of Innovation", "offeredIn": [1, 2], "compatibilityYearLevel": 1},
  {"code": "MPU3112", "name": "Kursus Integriti dan Antirasuh (KIAR) (Malaysian and International Students)", "offeredIn": [], "compatibilityYearLevel": 2},
  {"code": "MPU3122", "name": "Falsafah dan Cabaran Semasa (Malaysian Students Only)", "offeredIn": [], "compatibilityYearLevel": 3},
  {"code": "MPU3142", "name": "Malay Language Communication 2 (International Students Only)", "offeredIn": [1, 2], "compatibilityYearLevel": 1},
  {"code": "MPU3143", "name": "Malay Language Communication 2", "offeredIn": [1, 2], "compatibilityYearLevel": 2},
  {"code": "MPU3152", "name": "Citra Malaysia (International Students Only)", "offeredIn": [], "compatibilityYearLevel": 3},
  {"code": "MPU3172", "name": "Aspirasi Negara Bangsa (Malaysian Students Only", "offeredIn": [], "compatibilityYearLevel": 1},
  {"code": "MPU3182", "name": "Penghayatan Etika dan Peradaban (Malaysian Students Only)", "offeredIn": [1, 2], "compatibilityYearLevel": 2},
  {"code": "MPU3183", "name": "Penghayatan Etika dan Peradaban", "offeredIn": [1, 2], "compatibilityYearLevel": 2},
  {"code": "MPU3192", "name": "Philosophy and Current Issues (Malaysian and International Students)", "offeredIn": [1, 2], "compatibilityYearLevel": 1},
  {"code": "MPU3193", "name": "Philosophy and Current Issues", "offeredIn": [1, 2], "compatibilityYearLevel": 1},
  {"code": "MPU3212", "name": "Bahasa Kebangsaan A (Malaysian students who do not have SPM Bahasa Melayu credit)", "offeredIn": [3, 4], "compatibilityYearLevel": 1},
  {"code": "MPU3222", "name": "Career Development (Malaysian and International Students)", "offeredIn": [], "compatibilityYearLevel": 2},
  {"code": "MPU3272", "name": "Integrity and Anti-Corruption (Malaysian and International Students)", "offeredIn": [1, 2], "compatibilityYearLevel": 1},
  {"code": "MPU3273", "name": "Integrity and Anti-Corruption", "offeredIn": [1, 2], "compatibilityYearLevel": 1},
  {"code": "MPU3312", "name": "Academic Integrity and Professional Conduct (Malaysian and International Students)", "offeredIn": [], "compatibilityYearLevel": 1},
  {"code": "MPU3412", "name": "Service Learning (Malaysian and International Students)", "offeredIn": [1, 2], "compatibilityYearLevel": 2},
  {"code": "STA10003", "name": "Foundations of Statistics", "offeredIn": [1], "compatibilityYearLevel": 1},
  {"code": "SWE20001", "name": "Managing Software Projects", "offeredIn": [1, 2], "compatibilityYearLevel": 2},
  {"code": "SWE20004", "name": "Technical Software Development", "offeredIn": [], "compatibilityYearLevel": null},
  {"code": "SWE30003", "name": "Software Architecture and Design", "offeredIn": [1, 2], "compatibilityYearLevel": 2},
  {"code": "SWE30009", "name": "Software Testing and Reliability", "offeredIn": [2], "compatibilityYearLevel": 2},
  {"code": "SWE30011", "name": "IoT Programming", "offeredIn": [1], "compatibilityYearLevel": 2},
  {"code": "SWE30012", "name": "IoT Launcher Project", "offeredIn": [2], "compatibilityYearLevel": 3},
  {"code": "SWE40001", "name": "Software Engineering Project A", "offeredIn": [1, 2], "compatibilityYearLevel": 3},
  {"code": "SWE40002", "name": "Software Engineering Project B", "offeredIn": [1, 2], "compatibilityYearLevel": 3},
  {"code": "SWE40006", "name": "Software Deployment and Evolution", "offeredIn": [1], "compatibilityYearLevel": 3},
  {"code": "TNE10005", "name": "Network Administration", "offeredIn": [1], "compatibilityYearLevel": 1},
  {"code": "TNE10006", "name": "Networks and Switching", "offeredIn": [1, 2], "compatibilityYearLevel": 1},
  {"code": "TNE20002", "name": "Network Routing Principles", "offeredIn": [1], "compatibilityYearLevel": 1},
  {"code": "TNE20003", "name": "Internet and Cybersecurity for Engineering Applications", "offeredIn": [1], "compatibilityYearLevel": 1},
  {"code": "TNE30009", "name": "Network Security & Resilience", "offeredIn": [2], "compatibilityYearLevel": 2},
  {"code": "TNE30012", "name": "Secure Remote Access Networks", "offeredIn": [1], "compatibilityYearLevel": 2}
]

const SOURCE_PLANNERS: SourcePlanner[] = [
  {
    "courseCode": "BA-CS",
    "major": "Artificial Intelligence",
    "intakeYear": 2026,
    "intakeMonth": 9,
    "placements": [
      {"code": "COS10009", "category": "core", "year": 1, "term": 1},
      {"code": "COS10026", "category": "core", "year": 1, "term": 1},
      {"code": "COS10025", "category": "core", "year": 1, "term": 1},
      {"code": "COS10003", "category": "prescribed_elective", "year": 1, "term": 1},
      {"code": "MPU3312", "category": "mpu", "year": 1, "term": 1},
      {"code": "MPU3212", "category": "mpu", "year": 1, "term": 3},
      {"code": "COS20007", "category": "core", "year": 1, "term": 2},
      {"code": "TNE10006", "category": "core", "year": 1, "term": 2},
      {"code": "COS10022", "category": "elective", "year": 1, "term": 2},
      {"code": "STA10003", "category": "elective", "year": 1, "term": 2},
      {"code": "MPU3172", "category": "mpu", "year": 1, "term": 2},
      {"code": "MPU3142", "category": "mpu", "year": 1, "term": 2},
      {"code": "COS20031", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS30019", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS20019", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS30015", "category": "elective", "year": 2, "term": 1},
      {"code": "MPU3222", "category": "mpu", "year": 2, "term": 1},
      {"code": "COS10004", "category": "core", "year": 2, "term": 2},
      {"code": "COS30049", "category": "major_core", "year": 2, "term": 2},
      {"code": "COS30018", "category": "major_core", "year": 2, "term": 2},
      {"code": "MGT10010", "category": "elective", "year": 2, "term": 2},
      {"code": "MPU3112", "category": "mpu", "year": 2, "term": 2},
      {"code": "ICT20016", "category": "wil", "year": 2, "term": 4},
      {"code": "COS40005", "category": "core", "year": 3, "term": 1},
      {"code": "COS30082", "category": "major_core", "year": 3, "term": 1},
      {"code": "COS30008", "category": "elective", "year": 3, "term": 1},
      {"code": "MPU3122", "category": "mpu", "year": 3, "term": 1},
      {"code": "MPU3152", "category": "mpu", "year": 3, "term": 1},
      {"code": "COS40006", "category": "core", "year": 3, "term": 2},
      {"code": "COS40007", "category": "major_core", "year": 3, "term": 2},
      {"code": "SWE30003", "category": "major_core", "year": 3, "term": 2},
      {"code": "MPU3412", "category": "mpu", "year": 3, "term": 2}
    ],
    "electiveSlots": []
  },
  {
    "courseCode": "BA-CS",
    "major": "Cybersecurity",
    "intakeYear": 2026,
    "intakeMonth": 9,
    "placements": [
      {"code": "COS10009", "category": "core", "year": 1, "term": 1},
      {"code": "COS10026", "category": "core", "year": 1, "term": 1},
      {"code": "COS10025", "category": "core", "year": 1, "term": 1},
      {"code": "COS10003", "category": "prescribed_elective", "year": 1, "term": 1},
      {"code": "MPU3312", "category": "mpu", "year": 1, "term": 1},
      {"code": "MPU3212", "category": "mpu", "year": 1, "term": 3},
      {"code": "COS20007", "category": "core", "year": 1, "term": 2},
      {"code": "TNE10006", "category": "core", "year": 1, "term": 2},
      {"code": "TNE20003", "category": "major_core", "year": 1, "term": 2},
      {"code": "INF10024", "category": "elective", "year": 1, "term": 2},
      {"code": "MPU3172", "category": "mpu", "year": 1, "term": 2},
      {"code": "MPU3142", "category": "mpu", "year": 1, "term": 2},
      {"code": "COS20030", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS20031", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS30015", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS30019", "category": "prescribed_elective", "year": 2, "term": 1},
      {"code": "MPU3222", "category": "mpu", "year": 2, "term": 1},
      {"code": "COS10004", "category": "core", "year": 2, "term": 2},
      {"code": "COS30049", "category": "major_core", "year": 2, "term": 2},
      {"code": "COS20019", "category": "major_core", "year": 2, "term": 2},
      {"code": "COS10022", "category": "elective", "year": 2, "term": 2},
      {"code": "MPU3112", "category": "mpu", "year": 2, "term": 2},
      {"code": "ICT20016", "category": "wil", "year": 2, "term": 4},
      {"code": "COS40005", "category": "core", "year": 3, "term": 1},
      {"code": "TNE30009", "category": "major_core", "year": 3, "term": 1},
      {"code": "SWE30003", "category": "major_core", "year": 3, "term": 1},
      {"code": "MPU3122", "category": "mpu", "year": 3, "term": 1},
      {"code": "MPU3152", "category": "mpu", "year": 3, "term": 1},
      {"code": "COS40006", "category": "core", "year": 3, "term": 2},
      {"code": "MGT10010", "category": "elective", "year": 3, "term": 2},
      {"code": "COS30047", "category": "elective", "year": 3, "term": 2},
      {"code": "MPU3412", "category": "mpu", "year": 3, "term": 2}
    ],
    "electiveSlots": []
  },
  {
    "courseCode": "BA-CS",
    "major": "Data Science",
    "intakeYear": 2026,
    "intakeMonth": 9,
    "placements": [
      {"code": "COS10009", "category": "core", "year": 1, "term": 1},
      {"code": "COS10026", "category": "core", "year": 1, "term": 1},
      {"code": "COS10025", "category": "core", "year": 1, "term": 1},
      {"code": "COS10003", "category": "prescribed_elective", "year": 1, "term": 1},
      {"code": "MPU3312", "category": "mpu", "year": 1, "term": 1},
      {"code": "MPU3212", "category": "mpu", "year": 1, "term": 3},
      {"code": "COS20007", "category": "core", "year": 1, "term": 2},
      {"code": "TNE10006", "category": "core", "year": 1, "term": 2},
      {"code": "STA10003", "category": "elective", "year": 1, "term": 2},
      {"code": "COS10022", "category": "major_core", "year": 1, "term": 2},
      {"code": "MPU3172", "category": "mpu", "year": 1, "term": 2},
      {"code": "MPU3142", "category": "mpu", "year": 1, "term": 2},
      {"code": "COS20031", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS30045", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS30015", "category": "elective", "year": 2, "term": 1},
      {"code": "MPU3222", "category": "mpu", "year": 2, "term": 1},
      {"code": "COS10004", "category": "core", "year": 2, "term": 2},
      {"code": "COS30049", "category": "major_core", "year": 2, "term": 2},
      {"code": "COS20019", "category": "major_core", "year": 2, "term": 2},
      {"code": "COS30019", "category": "prescribed_elective", "year": 2, "term": 2},
      {"code": "MPU3112", "category": "mpu", "year": 2, "term": 2},
      {"code": "ICT20016", "category": "wil", "year": 2, "term": 4},
      {"code": "COS40005", "category": "core", "year": 3, "term": 1},
      {"code": "COS20028", "category": "major_core", "year": 3, "term": 1},
      {"code": "SWE30003", "category": "major_core", "year": 3, "term": 1},
      {"code": "MPU3122", "category": "mpu", "year": 3, "term": 1},
      {"code": "MPU3152", "category": "mpu", "year": 3, "term": 1},
      {"code": "COS40006", "category": "core", "year": 3, "term": 2},
      {"code": "SWE40006", "category": "major_core", "year": 3, "term": 2},
      {"code": "MGT10010", "category": "elective", "year": 3, "term": 2},
      {"code": "MPU3412", "category": "mpu", "year": 3, "term": 2}
    ],
    "electiveSlots": [
      {"year": 2, "term": 1}
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Internet of Things",
    "intakeYear": 2026,
    "intakeMonth": 9,
    "placements": [
      {"code": "COS10009", "category": "core", "year": 1, "term": 1},
      {"code": "COS10026", "category": "core", "year": 1, "term": 1},
      {"code": "COS10025", "category": "core", "year": 1, "term": 1},
      {"code": "COS10003", "category": "prescribed_elective", "year": 1, "term": 1},
      {"code": "MPU3312", "category": "mpu", "year": 1, "term": 1},
      {"code": "MPU3212", "category": "mpu", "year": 1, "term": 3},
      {"code": "COS20007", "category": "core", "year": 1, "term": 2},
      {"code": "TNE10006", "category": "core", "year": 1, "term": 2},
      {"code": "TNE10005", "category": "major_core", "year": 1, "term": 2},
      {"code": "STA10003", "category": "elective", "year": 1, "term": 2},
      {"code": "MPU3172", "category": "mpu", "year": 1, "term": 2},
      {"code": "MPU3142", "category": "mpu", "year": 1, "term": 2},
      {"code": "COS30020", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS20031", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS30019", "category": "prescribed_elective", "year": 2, "term": 1},
      {"code": "COS10022", "category": "elective", "year": 2, "term": 1},
      {"code": "MPU3222", "category": "mpu", "year": 2, "term": 1},
      {"code": "COS10004", "category": "core", "year": 2, "term": 2},
      {"code": "COS30017", "category": "major_core", "year": 2, "term": 2},
      {"code": "COS20019", "category": "major_core", "year": 2, "term": 2},
      {"code": "SWE30011", "category": "major_core", "year": 2, "term": 2},
      {"code": "MPU3112", "category": "mpu", "year": 2, "term": 2},
      {"code": "ICT20016", "category": "wil", "year": 2, "term": 4},
      {"code": "COS40005", "category": "core", "year": 3, "term": 1},
      {"code": "COS30049", "category": "major_core", "year": 3, "term": 1},
      {"code": "SWE30003", "category": "major_core", "year": 3, "term": 1},
      {"code": "MPU3122", "category": "mpu", "year": 3, "term": 1},
      {"code": "MPU3152", "category": "mpu", "year": 3, "term": 1},
      {"code": "COS40006", "category": "core", "year": 3, "term": 2},
      {"code": "COS30015", "category": "elective", "year": 3, "term": 2},
      {"code": "MGT10010", "category": "elective", "year": 3, "term": 2},
      {"code": "MPU3412", "category": "mpu", "year": 3, "term": 2}
    ],
    "electiveSlots": []
  },
  {
    "courseCode": "BA-CS",
    "major": "Software Development",
    "intakeYear": 2026,
    "intakeMonth": 9,
    "placements": [
      {"code": "COS10009", "category": "core", "year": 1, "term": 1},
      {"code": "COS10026", "category": "core", "year": 1, "term": 1},
      {"code": "COS10025", "category": "core", "year": 1, "term": 1},
      {"code": "COS10003", "category": "prescribed_elective", "year": 1, "term": 1},
      {"code": "MPU3312", "category": "mpu", "year": 1, "term": 1},
      {"code": "MPU3212", "category": "mpu", "year": 1, "term": 3},
      {"code": "COS20007", "category": "core", "year": 1, "term": 2},
      {"code": "TNE10006", "category": "core", "year": 1, "term": 2},
      {"code": "COS20019", "category": "major_core", "year": 1, "term": 2},
      {"code": "COS10022", "category": "elective", "year": 1, "term": 2},
      {"code": "MPU3172", "category": "mpu", "year": 1, "term": 2},
      {"code": "MPU3142", "category": "mpu", "year": 1, "term": 2},
      {"code": "COS20031", "category": "major_core", "year": 2, "term": 1},
      {"code": "SWE30009", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS30019", "category": "prescribed_elective", "year": 2, "term": 1},
      {"code": "COS30015", "category": "elective", "year": 2, "term": 1},
      {"code": "MPU3222", "category": "mpu", "year": 2, "term": 1},
      {"code": "COS10004", "category": "core", "year": 2, "term": 2},
      {"code": "COS30043", "category": "major_core", "year": 2, "term": 2},
      {"code": "COS30049", "category": "major_core", "year": 2, "term": 2},
      {"code": "SWE30011", "category": "elective", "year": 2, "term": 2},
      {"code": "MPU3112", "category": "mpu", "year": 2, "term": 2},
      {"code": "ICT20016", "category": "wil", "year": 2, "term": 4},
      {"code": "COS40005", "category": "core", "year": 3, "term": 1},
      {"code": "COS40003", "category": "major_core", "year": 3, "term": 1},
      {"code": "COS30008", "category": "major_core", "year": 3, "term": 1},
      {"code": "MPU3122", "category": "mpu", "year": 3, "term": 1},
      {"code": "MPU3152", "category": "mpu", "year": 3, "term": 1},
      {"code": "COS40006", "category": "core", "year": 3, "term": 2},
      {"code": "SWE30003", "category": "major_core", "year": 3, "term": 2},
      {"code": "SWE40006", "category": "elective", "year": 3, "term": 2},
      {"code": "MPU3412", "category": "mpu", "year": 3, "term": 2}
    ],
    "electiveSlots": []
  },
  {
    "courseCode": "BA-CS",
    "major": "Artificial Intelligence",
    "intakeYear": 2026,
    "intakeMonth": 3,
    "placements": [
      {"code": "COS10009", "category": "core", "year": 1, "term": 1},
      {"code": "COS10026", "category": "core", "year": 1, "term": 1},
      {"code": "COS10025", "category": "core", "year": 1, "term": 1},
      {"code": "COS10003", "category": "prescribed_elective", "year": 1, "term": 1},
      {"code": "MPU3272", "category": "mpu", "year": 1, "term": 1},
      {"code": "MPU3212", "category": "mpu", "year": 1, "term": 4},
      {"code": "COS20007", "category": "core", "year": 1, "term": 2},
      {"code": "TNE10006", "category": "core", "year": 1, "term": 2},
      {"code": "COS10022", "category": "elective", "year": 1, "term": 2},
      {"code": "INF10024", "category": "elective", "year": 1, "term": 2},
      {"code": "MPU3192", "category": "mpu", "year": 1, "term": 2},
      {"code": "COS10004", "category": "core", "year": 2, "term": 1},
      {"code": "COS30018", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS20031", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS30019", "category": "major_core", "year": 2, "term": 1},
      {"code": "MPU3182", "category": "mpu", "year": 2, "term": 1},
      {"code": "MPU3142", "category": "mpu", "year": 2, "term": 1},
      {"code": "SWE30003", "category": "major_core", "year": 2, "term": 2},
      {"code": "COS30049", "category": "major_core", "year": 2, "term": 2},
      {"code": "COS30082", "category": "major_core", "year": 2, "term": 2},
      {"code": "COS30008", "category": "elective", "year": 2, "term": 2},
      {"code": "MPU3412", "category": "mpu", "year": 2, "term": 2},
      {"code": "ICT20016", "category": "wil", "year": 2, "term": 3},
      {"code": "COS40005", "category": "core", "year": 3, "term": 1},
      {"code": "COS20019", "category": "major_core", "year": 3, "term": 1},
      {"code": "COS40007", "category": "major_core", "year": 3, "term": 1},
      {"code": "COS40006", "category": "core", "year": 3, "term": 2},
      {"code": "MGT10010", "category": "elective", "year": 3, "term": 2},
      {"code": "COS30015", "category": "elective", "year": 3, "term": 2}
    ],
    "electiveSlots": []
  },
  {
    "courseCode": "BA-CS",
    "major": "Cybersecurity",
    "intakeYear": 2026,
    "intakeMonth": 3,
    "placements": [
      {"code": "COS10009", "category": "core", "year": 1, "term": 1},
      {"code": "COS10026", "category": "core", "year": 1, "term": 1},
      {"code": "COS10025", "category": "core", "year": 1, "term": 1},
      {"code": "COS10003", "category": "prescribed_elective", "year": 1, "term": 1},
      {"code": "MPU3272", "category": "mpu", "year": 1, "term": 1},
      {"code": "MPU3212", "category": "mpu", "year": 1, "term": 4},
      {"code": "COS20007", "category": "core", "year": 1, "term": 2},
      {"code": "TNE10006", "category": "core", "year": 1, "term": 2},
      {"code": "COS20019", "category": "major_core", "year": 1, "term": 2},
      {"code": "INF10024", "category": "elective", "year": 1, "term": 2},
      {"code": "MPU3192", "category": "mpu", "year": 1, "term": 2},
      {"code": "TNE20003", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS20031", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS30015", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS10022", "category": "elective", "year": 2, "term": 1},
      {"code": "MPU3182", "category": "mpu", "year": 2, "term": 1},
      {"code": "MPU3142", "category": "mpu", "year": 2, "term": 1},
      {"code": "COS10004", "category": "core", "year": 2, "term": 2},
      {"code": "COS30049", "category": "major_core", "year": 2, "term": 2},
      {"code": "TNE30009", "category": "major_core", "year": 2, "term": 2},
      {"code": "COS30019", "category": "prescribed_elective", "year": 2, "term": 2},
      {"code": "MPU3412", "category": "mpu", "year": 2, "term": 2},
      {"code": "ICT20016", "category": "wil", "year": 2, "term": 3},
      {"code": "COS40005", "category": "core", "year": 3, "term": 1},
      {"code": "SWE30003", "category": "major_core", "year": 3, "term": 1},
      {"code": "COS30047", "category": "elective", "year": 3, "term": 1},
      {"code": "COS40006", "category": "core", "year": 3, "term": 2},
      {"code": "COS20030", "category": "major_core", "year": 3, "term": 2},
      {"code": "MGT10010", "category": "elective", "year": 3, "term": 2}
    ],
    "electiveSlots": []
  },
  {
    "courseCode": "BA-CS",
    "major": "Data Science",
    "intakeYear": 2026,
    "intakeMonth": 3,
    "placements": [
      {"code": "COS10009", "category": "core", "year": 1, "term": 1},
      {"code": "COS10026", "category": "core", "year": 1, "term": 1},
      {"code": "COS10025", "category": "core", "year": 1, "term": 1},
      {"code": "COS10003", "category": "prescribed_elective", "year": 1, "term": 1},
      {"code": "MPU3272", "category": "mpu", "year": 1, "term": 1},
      {"code": "MPU3212", "category": "mpu", "year": 1, "term": 4},
      {"code": "COS20007", "category": "core", "year": 1, "term": 2},
      {"code": "TNE10006", "category": "core", "year": 1, "term": 2},
      {"code": "COS10022", "category": "major_core", "year": 1, "term": 2},
      {"code": "COS10082", "category": "elective", "year": 1, "term": 2},
      {"code": "MPU3192", "category": "mpu", "year": 1, "term": 2},
      {"code": "COS20031", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS20019", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS30019", "category": "prescribed_elective", "year": 2, "term": 1},
      {"code": "COS20083", "category": "elective", "year": 2, "term": 1},
      {"code": "MPU3182", "category": "mpu", "year": 2, "term": 1},
      {"code": "MPU3142", "category": "mpu", "year": 2, "term": 1},
      {"code": "COS10004", "category": "core", "year": 2, "term": 2},
      {"code": "COS30049", "category": "major_core", "year": 2, "term": 2},
      {"code": "COS30045", "category": "major_core", "year": 2, "term": 2},
      {"code": "MGT10010", "category": "elective", "year": 2, "term": 2},
      {"code": "MPU3412", "category": "mpu", "year": 2, "term": 2},
      {"code": "ICT20016", "category": "wil", "year": 2, "term": 3},
      {"code": "COS40005", "category": "core", "year": 3, "term": 1},
      {"code": "SWE30003", "category": "major_core", "year": 3, "term": 1},
      {"code": "SWE40006", "category": "major_core", "year": 3, "term": 1},
      {"code": "COS40006", "category": "core", "year": 3, "term": 2},
      {"code": "COS20028", "category": "major_core", "year": 3, "term": 2},
      {"code": "COS30015", "category": "elective", "year": 3, "term": 2}
    ],
    "electiveSlots": []
  },
  {
    "courseCode": "BA-CS",
    "major": "Internet of Things",
    "intakeYear": 2026,
    "intakeMonth": 3,
    "placements": [
      {"code": "COS10009", "category": "core", "year": 1, "term": 1},
      {"code": "COS10026", "category": "core", "year": 1, "term": 1},
      {"code": "COS10025", "category": "core", "year": 1, "term": 1},
      {"code": "COS10003", "category": "prescribed_elective", "year": 1, "term": 1},
      {"code": "MPU3272", "category": "mpu", "year": 1, "term": 1},
      {"code": "MPU3212", "category": "mpu", "year": 1, "term": 4},
      {"code": "COS20007", "category": "core", "year": 1, "term": 2},
      {"code": "TNE10006", "category": "core", "year": 1, "term": 2},
      {"code": "COS20019", "category": "major_core", "year": 1, "term": 2},
      {"code": "INF10024", "category": "elective", "year": 1, "term": 2},
      {"code": "MPU3192", "category": "mpu", "year": 1, "term": 2},
      {"code": "TNE10005", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS20031", "category": "major_core", "year": 2, "term": 1},
      {"code": "SWE30011", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS10022", "category": "elective", "year": 2, "term": 1},
      {"code": "MPU3182", "category": "mpu", "year": 2, "term": 1},
      {"code": "MPU3142", "category": "mpu", "year": 2, "term": 1},
      {"code": "COS10004", "category": "core", "year": 2, "term": 2},
      {"code": "COS30049", "category": "major_core", "year": 2, "term": 2},
      {"code": "COS30017", "category": "major_core", "year": 2, "term": 2},
      {"code": "COS30015", "category": "elective", "year": 2, "term": 2},
      {"code": "MPU3412", "category": "mpu", "year": 2, "term": 2},
      {"code": "ICT20016", "category": "wil", "year": 2, "term": 3},
      {"code": "COS40005", "category": "core", "year": 3, "term": 1},
      {"code": "SWE30003", "category": "major_core", "year": 3, "term": 1},
      {"code": "COS30019", "category": "prescribed_elective", "year": 3, "term": 1},
      {"code": "COS40006", "category": "core", "year": 3, "term": 2},
      {"code": "COS30020", "category": "major_core", "year": 3, "term": 2},
      {"code": "MGT10010", "category": "elective", "year": 3, "term": 2}
    ],
    "electiveSlots": []
  },
  {
    "courseCode": "BA-CS",
    "major": "Software Development",
    "intakeYear": 2026,
    "intakeMonth": 3,
    "placements": [
      {"code": "COS10009", "category": "core", "year": 1, "term": 1},
      {"code": "COS10026", "category": "core", "year": 1, "term": 1},
      {"code": "COS10025", "category": "core", "year": 1, "term": 1},
      {"code": "COS10003", "category": "prescribed_elective", "year": 1, "term": 1},
      {"code": "MPU3272", "category": "mpu", "year": 1, "term": 1},
      {"code": "MPU3212", "category": "mpu", "year": 1, "term": 4},
      {"code": "COS20007", "category": "core", "year": 1, "term": 2},
      {"code": "TNE10006", "category": "core", "year": 1, "term": 2},
      {"code": "COS20019", "category": "major_core", "year": 1, "term": 2},
      {"code": "INF10024", "category": "elective", "year": 1, "term": 2},
      {"code": "MPU3192", "category": "mpu", "year": 1, "term": 2},
      {"code": "COS30043", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS20031", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS30019", "category": "prescribed_elective", "year": 2, "term": 1},
      {"code": "COS10022", "category": "elective", "year": 2, "term": 1},
      {"code": "MPU3182", "category": "mpu", "year": 2, "term": 1},
      {"code": "MPU3142", "category": "mpu", "year": 2, "term": 1},
      {"code": "COS10004", "category": "core", "year": 2, "term": 2},
      {"code": "COS30049", "category": "major_core", "year": 2, "term": 2},
      {"code": "COS30008", "category": "major_core", "year": 2, "term": 2},
      {"code": "SWE30009", "category": "major_core", "year": 2, "term": 2},
      {"code": "MPU3412", "category": "mpu", "year": 2, "term": 2},
      {"code": "ICT20016", "category": "wil", "year": 2, "term": 3},
      {"code": "COS40005", "category": "core", "year": 3, "term": 1},
      {"code": "SWE30003", "category": "major_core", "year": 3, "term": 1},
      {"code": "SWE40006", "category": "elective", "year": 3, "term": 1},
      {"code": "COS40006", "category": "core", "year": 3, "term": 2},
      {"code": "COS40003", "category": "major_core", "year": 3, "term": 2},
      {"code": "COS30015", "category": "elective", "year": 3, "term": 2}
    ],
    "electiveSlots": []
  },
  {
    "courseCode": "BA-CS",
    "major": "Artificial Intelligence",
    "intakeYear": 2025,
    "intakeMonth": 9,
    "placements": [
      {"code": "COS10009", "category": "core", "year": 1, "term": 1},
      {"code": "COS10026", "category": "core", "year": 1, "term": 1},
      {"code": "COS10025", "category": "core", "year": 1, "term": 1},
      {"code": "COS10003", "category": "prescribed_elective", "year": 1, "term": 1},
      {"code": "MPU3272", "category": "mpu", "year": 1, "term": 1},
      {"code": "COS20007", "category": "core", "year": 1, "term": 2},
      {"code": "TNE10006", "category": "core", "year": 1, "term": 2},
      {"code": "COS10022", "category": "elective", "year": 1, "term": 2},
      {"code": "INF10024", "category": "elective", "year": 1, "term": 2},
      {"code": "MPU3192", "category": "mpu", "year": 1, "term": 2},
      {"code": "MPU3212", "category": "mpu", "year": 1, "term": 4},
      {"code": "COS20031", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS30019", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS20019", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS30015", "category": "elective", "year": 2, "term": 1},
      {"code": "MPU3182", "category": "mpu", "year": 2, "term": 1},
      {"code": "MPU3142", "category": "mpu", "year": 2, "term": 1},
      {"code": "COS10004", "category": "core", "year": 2, "term": 2},
      {"code": "COS30049", "category": "major_core", "year": 2, "term": 2},
      {"code": "COS30018", "category": "major_core", "year": 2, "term": 2},
      {"code": "MGT10010", "category": "elective", "year": 2, "term": 2},
      {"code": "MPU3412", "category": "mpu", "year": 2, "term": 2},
      {"code": "ICT20016", "category": "wil", "year": 2, "term": 4},
      {"code": "COS40005", "category": "core", "year": 3, "term": 1},
      {"code": "COS30082", "category": "major_core", "year": 3, "term": 1},
      {"code": "COS30008", "category": "elective", "year": 3, "term": 1},
      {"code": "COS40006", "category": "core", "year": 3, "term": 2},
      {"code": "COS40007", "category": "major_core", "year": 3, "term": 2},
      {"code": "SWE30003", "category": "major_core", "year": 3, "term": 2}
    ],
    "electiveSlots": []
  },
  {
    "courseCode": "BA-CS",
    "major": "Cybersecurity",
    "intakeYear": 2025,
    "intakeMonth": 9,
    "placements": [
      {"code": "COS10009", "category": "core", "year": 1, "term": 1},
      {"code": "COS10026", "category": "core", "year": 1, "term": 1},
      {"code": "COS10025", "category": "core", "year": 1, "term": 1},
      {"code": "COS10003", "category": "prescribed_elective", "year": 1, "term": 1},
      {"code": "MPU3272", "category": "mpu", "year": 1, "term": 1},
      {"code": "COS20007", "category": "core", "year": 1, "term": 2},
      {"code": "TNE10006", "category": "core", "year": 1, "term": 2},
      {"code": "TNE20003", "category": "major_core", "year": 1, "term": 2},
      {"code": "INF10024", "category": "elective", "year": 1, "term": 2},
      {"code": "MPU3192", "category": "mpu", "year": 1, "term": 2},
      {"code": "MPU3212", "category": "mpu", "year": 1, "term": 4},
      {"code": "COS20030", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS20031", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS30015", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS30019", "category": "prescribed_elective", "year": 2, "term": 1},
      {"code": "MPU3182", "category": "mpu", "year": 2, "term": 1},
      {"code": "MPU3142", "category": "mpu", "year": 2, "term": 1},
      {"code": "COS10004", "category": "core", "year": 2, "term": 2},
      {"code": "COS30049", "category": "major_core", "year": 2, "term": 2},
      {"code": "COS20019", "category": "major_core", "year": 2, "term": 2},
      {"code": "COS10022", "category": "elective", "year": 2, "term": 2},
      {"code": "MPU3412", "category": "mpu", "year": 2, "term": 2},
      {"code": "ICT20016", "category": "wil", "year": 2, "term": 4},
      {"code": "COS40005", "category": "core", "year": 3, "term": 1},
      {"code": "TNE30009", "category": "major_core", "year": 3, "term": 1},
      {"code": "SWE30003", "category": "major_core", "year": 3, "term": 1},
      {"code": "COS40006", "category": "core", "year": 3, "term": 2},
      {"code": "MGT10010", "category": "elective", "year": 3, "term": 2},
      {"code": "COS30047", "category": "elective", "year": 3, "term": 2}
    ],
    "electiveSlots": []
  },
  {
    "courseCode": "BA-CS",
    "major": "Data Science",
    "intakeYear": 2025,
    "intakeMonth": 9,
    "placements": [
      {"code": "COS10009", "category": "core", "year": 1, "term": 1},
      {"code": "COS10026", "category": "core", "year": 1, "term": 1},
      {"code": "COS10025", "category": "core", "year": 1, "term": 1},
      {"code": "COS10003", "category": "prescribed_elective", "year": 1, "term": 1},
      {"code": "MPU3272", "category": "mpu", "year": 1, "term": 1},
      {"code": "COS20007", "category": "core", "year": 1, "term": 2},
      {"code": "TNE10006", "category": "core", "year": 1, "term": 2},
      {"code": "MGT10010", "category": "elective", "year": 1, "term": 2},
      {"code": "COS10022", "category": "major_core", "year": 1, "term": 2},
      {"code": "MPU3192", "category": "mpu", "year": 1, "term": 2},
      {"code": "MPU3212", "category": "mpu", "year": 1, "term": 4},
      {"code": "COS20031", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS30045", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS10082", "category": "elective", "year": 2, "term": 1},
      {"code": "COS30019", "category": "prescribed_elective", "year": 2, "term": 1},
      {"code": "MPU3182", "category": "mpu", "year": 2, "term": 1},
      {"code": "MPU3142", "category": "mpu", "year": 2, "term": 1},
      {"code": "COS10004", "category": "core", "year": 2, "term": 2},
      {"code": "COS30049", "category": "major_core", "year": 2, "term": 2},
      {"code": "COS20019", "category": "major_core", "year": 2, "term": 2},
      {"code": "COS20083", "category": "elective", "year": 2, "term": 2},
      {"code": "MPU3412", "category": "mpu", "year": 2, "term": 2},
      {"code": "ICT20016", "category": "wil", "year": 2, "term": 4},
      {"code": "COS40005", "category": "core", "year": 3, "term": 1},
      {"code": "COS20028", "category": "major_core", "year": 3, "term": 1},
      {"code": "SWE30003", "category": "major_core", "year": 3, "term": 1},
      {"code": "COS40006", "category": "core", "year": 3, "term": 2},
      {"code": "SWE40006", "category": "major_core", "year": 3, "term": 2},
      {"code": "COS30015", "category": "elective", "year": 3, "term": 2}
    ],
    "electiveSlots": []
  },
  {
    "courseCode": "BA-CS",
    "major": "Internet of Things",
    "intakeYear": 2025,
    "intakeMonth": 9,
    "placements": [
      {"code": "COS10009", "category": "core", "year": 1, "term": 1},
      {"code": "COS10026", "category": "core", "year": 1, "term": 1},
      {"code": "COS10025", "category": "core", "year": 1, "term": 1},
      {"code": "COS10003", "category": "prescribed_elective", "year": 1, "term": 1},
      {"code": "MPU3272", "category": "mpu", "year": 1, "term": 1},
      {"code": "COS20007", "category": "core", "year": 1, "term": 2},
      {"code": "TNE10006", "category": "core", "year": 1, "term": 2},
      {"code": "TNE10005", "category": "major_core", "year": 1, "term": 2},
      {"code": "INF10024", "category": "elective", "year": 1, "term": 2},
      {"code": "MPU3192", "category": "mpu", "year": 1, "term": 2},
      {"code": "MPU3212", "category": "mpu", "year": 1, "term": 4},
      {"code": "COS30020", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS20031", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS30019", "category": "prescribed_elective", "year": 2, "term": 1},
      {"code": "COS10022", "category": "elective", "year": 2, "term": 1},
      {"code": "MPU3182", "category": "mpu", "year": 2, "term": 1},
      {"code": "MPU3142", "category": "mpu", "year": 2, "term": 1},
      {"code": "COS10004", "category": "core", "year": 2, "term": 2},
      {"code": "COS30017", "category": "major_core", "year": 2, "term": 2},
      {"code": "COS20019", "category": "major_core", "year": 2, "term": 2},
      {"code": "SWE30011", "category": "major_core", "year": 2, "term": 2},
      {"code": "MPU3412", "category": "mpu", "year": 2, "term": 2},
      {"code": "ICT20016", "category": "wil", "year": 2, "term": 4},
      {"code": "COS40005", "category": "core", "year": 3, "term": 1},
      {"code": "COS30049", "category": "major_core", "year": 3, "term": 1},
      {"code": "SWE30003", "category": "major_core", "year": 3, "term": 1},
      {"code": "COS40006", "category": "core", "year": 3, "term": 2},
      {"code": "COS30015", "category": "elective", "year": 3, "term": 2},
      {"code": "MGT10010", "category": "elective", "year": 3, "term": 2}
    ],
    "electiveSlots": []
  },
  {
    "courseCode": "BA-CS",
    "major": "Software Development",
    "intakeYear": 2025,
    "intakeMonth": 9,
    "placements": [
      {"code": "COS10009", "category": "core", "year": 1, "term": 1},
      {"code": "COS10026", "category": "core", "year": 1, "term": 1},
      {"code": "COS10025", "category": "core", "year": 1, "term": 1},
      {"code": "COS10003", "category": "prescribed_elective", "year": 1, "term": 1},
      {"code": "MPU3272", "category": "mpu", "year": 1, "term": 1},
      {"code": "COS20007", "category": "core", "year": 1, "term": 2},
      {"code": "TNE10006", "category": "core", "year": 1, "term": 2},
      {"code": "COS20019", "category": "major_core", "year": 1, "term": 2},
      {"code": "INF10024", "category": "elective", "year": 1, "term": 2},
      {"code": "MPU3192", "category": "mpu", "year": 1, "term": 2},
      {"code": "MPU3212", "category": "mpu", "year": 1, "term": 4},
      {"code": "COS20031", "category": "major_core", "year": 2, "term": 1},
      {"code": "SWE30009", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS30019", "category": "prescribed_elective", "year": 2, "term": 1},
      {"code": "COS30015", "category": "elective", "year": 2, "term": 1},
      {"code": "MPU3182", "category": "mpu", "year": 2, "term": 1},
      {"code": "MPU3142", "category": "mpu", "year": 2, "term": 1},
      {"code": "COS10004", "category": "core", "year": 2, "term": 2},
      {"code": "COS30043", "category": "major_core", "year": 2, "term": 2},
      {"code": "COS30049", "category": "major_core", "year": 2, "term": 2},
      {"code": "COS10022", "category": "elective", "year": 2, "term": 2},
      {"code": "MPU3412", "category": "mpu", "year": 2, "term": 2},
      {"code": "ICT20016", "category": "wil", "year": 2, "term": 4},
      {"code": "COS40005", "category": "core", "year": 3, "term": 1},
      {"code": "COS40003", "category": "major_core", "year": 3, "term": 1},
      {"code": "COS30008", "category": "major_core", "year": 3, "term": 1},
      {"code": "COS40006", "category": "core", "year": 3, "term": 2},
      {"code": "SWE30003", "category": "major_core", "year": 3, "term": 2},
      {"code": "SWE40006", "category": "elective", "year": 3, "term": 2}
    ],
    "electiveSlots": []
  },
  {
    "courseCode": "BA-CS",
    "major": "Artificial Intelligence",
    "intakeYear": 2025,
    "intakeMonth": 3,
    "placements": [
      {"code": "COS10009", "category": "core", "year": 1, "term": 1},
      {"code": "COS10026", "category": "core", "year": 1, "term": 1},
      {"code": "COS10025", "category": "core", "year": 1, "term": 1},
      {"code": "COS10003", "category": "prescribed_elective", "year": 1, "term": 1},
      {"code": "MPU3273", "category": "mpu", "year": 1, "term": 1},
      {"code": "MPU3212", "category": "mpu", "year": 1, "term": 4},
      {"code": "COS20007", "category": "core", "year": 1, "term": 2},
      {"code": "TNE10006", "category": "core", "year": 1, "term": 2},
      {"code": "COS10022", "category": "prescribed_elective", "year": 1, "term": 2},
      {"code": "MPU3193", "category": "mpu", "year": 1, "term": 2},
      {"code": "COS30018", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS20019", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS20031", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS30019", "category": "major_core", "year": 2, "term": 1},
      {"code": "MPU3183", "category": "mpu", "year": 2, "term": 1},
      {"code": "MPU3143", "category": "mpu", "year": 2, "term": 1},
      {"code": "COS10004", "category": "core", "year": 2, "term": 2},
      {"code": "COS30049", "category": "major_core", "year": 2, "term": 2},
      {"code": "COS30082", "category": "major_core", "year": 2, "term": 2},
      {"code": "ICT20016", "category": "wil", "year": 2, "term": 2},
      {"code": "COS40005", "category": "core", "year": 3, "term": 1},
      {"code": "SWE30003", "category": "major_core", "year": 3, "term": 1},
      {"code": "COS40007", "category": "major_core", "year": 3, "term": 1},
      {"code": "COS40006", "category": "core", "year": 3, "term": 2}
    ],
    "electiveSlots": [
      {"year": 1, "term": 2},
      {"year": 2, "term": 2},
      {"year": 3, "term": 2},
      {"year": 3, "term": 2}
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Cybersecurity",
    "intakeYear": 2025,
    "intakeMonth": 3,
    "placements": [
      {"code": "COS10009", "category": "core", "year": 1, "term": 1},
      {"code": "COS10026", "category": "core", "year": 1, "term": 1},
      {"code": "COS10025", "category": "core", "year": 1, "term": 1},
      {"code": "COS10003", "category": "prescribed_elective", "year": 1, "term": 1},
      {"code": "MPU3273", "category": "mpu", "year": 1, "term": 1},
      {"code": "MPU3212", "category": "mpu", "year": 1, "term": 4},
      {"code": "COS20007", "category": "core", "year": 1, "term": 2},
      {"code": "TNE10006", "category": "core", "year": 1, "term": 2},
      {"code": "COS20019", "category": "major_core", "year": 1, "term": 2},
      {"code": "MPU3193", "category": "mpu", "year": 1, "term": 2},
      {"code": "TNE20003", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS20031", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS30015", "category": "major_core", "year": 2, "term": 1},
      {"code": "MPU3183", "category": "mpu", "year": 2, "term": 1},
      {"code": "MPU3143", "category": "mpu", "year": 2, "term": 1},
      {"code": "COS10004", "category": "core", "year": 2, "term": 2},
      {"code": "COS30049", "category": "major_core", "year": 2, "term": 2},
      {"code": "TNE30009", "category": "major_core", "year": 2, "term": 2},
      {"code": "COS30019", "category": "prescribed_elective", "year": 2, "term": 2},
      {"code": "ICT20016", "category": "wil", "year": 2, "term": 2},
      {"code": "COS40005", "category": "core", "year": 3, "term": 1},
      {"code": "SWE30003", "category": "major_core", "year": 3, "term": 1},
      {"code": "COS40006", "category": "core", "year": 3, "term": 2},
      {"code": "COS20030", "category": "major_core", "year": 3, "term": 2}
    ],
    "electiveSlots": [
      {"year": 1, "term": 2},
      {"year": 2, "term": 1},
      {"year": 3, "term": 1},
      {"year": 3, "term": 2}
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Data Science",
    "intakeYear": 2025,
    "intakeMonth": 3,
    "placements": [
      {"code": "COS10009", "category": "core", "year": 1, "term": 1},
      {"code": "COS10026", "category": "core", "year": 1, "term": 1},
      {"code": "COS10025", "category": "core", "year": 1, "term": 1},
      {"code": "COS10003", "category": "prescribed_elective", "year": 1, "term": 1},
      {"code": "MPU3273", "category": "mpu", "year": 1, "term": 1},
      {"code": "MPU3212", "category": "mpu", "year": 1, "term": 4},
      {"code": "COS20007", "category": "core", "year": 1, "term": 2},
      {"code": "TNE10006", "category": "core", "year": 1, "term": 2},
      {"code": "COS10022", "category": "major_core", "year": 1, "term": 2},
      {"code": "MPU3193", "category": "mpu", "year": 1, "term": 2},
      {"code": "COS20031", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS20019", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS30019", "category": "prescribed_elective", "year": 2, "term": 1},
      {"code": "MPU3183", "category": "mpu", "year": 2, "term": 1},
      {"code": "MPU3143", "category": "mpu", "year": 2, "term": 1},
      {"code": "COS10004", "category": "core", "year": 2, "term": 2},
      {"code": "COS30049", "category": "major_core", "year": 2, "term": 2},
      {"code": "COS30045", "category": "major_core", "year": 2, "term": 2},
      {"code": "ICT20016", "category": "wil", "year": 2, "term": 2},
      {"code": "COS40005", "category": "core", "year": 3, "term": 1},
      {"code": "SWE30003", "category": "major_core", "year": 3, "term": 1},
      {"code": "SWE40006", "category": "major_core", "year": 3, "term": 1},
      {"code": "COS40006", "category": "core", "year": 3, "term": 2},
      {"code": "COS20028", "category": "major_core", "year": 3, "term": 2}
    ],
    "electiveSlots": [
      {"year": 1, "term": 2},
      {"year": 2, "term": 1},
      {"year": 2, "term": 2},
      {"year": 3, "term": 2}
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Internet of Things",
    "intakeYear": 2025,
    "intakeMonth": 3,
    "placements": [
      {"code": "COS10009", "category": "core", "year": 1, "term": 1},
      {"code": "COS10026", "category": "core", "year": 1, "term": 1},
      {"code": "COS10025", "category": "core", "year": 1, "term": 1},
      {"code": "COS10003", "category": "prescribed_elective", "year": 1, "term": 1},
      {"code": "MPU3273", "category": "mpu", "year": 1, "term": 1},
      {"code": "MPU3212", "category": "mpu", "year": 1, "term": 4},
      {"code": "COS20007", "category": "core", "year": 1, "term": 2},
      {"code": "TNE10006", "category": "core", "year": 1, "term": 2},
      {"code": "COS20019", "category": "major_core", "year": 1, "term": 2},
      {"code": "MPU3193", "category": "mpu", "year": 1, "term": 2},
      {"code": "TNE10005", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS20031", "category": "major_core", "year": 2, "term": 1},
      {"code": "SWE30011", "category": "major_core", "year": 2, "term": 1},
      {"code": "MPU3183", "category": "mpu", "year": 2, "term": 1},
      {"code": "MPU3143", "category": "mpu", "year": 2, "term": 1},
      {"code": "COS10004", "category": "core", "year": 2, "term": 2},
      {"code": "COS30049", "category": "major_core", "year": 2, "term": 2},
      {"code": "COS30017", "category": "major_core", "year": 2, "term": 2},
      {"code": "ICT20016", "category": "wil", "year": 2, "term": 2},
      {"code": "COS40005", "category": "core", "year": 3, "term": 1},
      {"code": "SWE30003", "category": "major_core", "year": 3, "term": 1},
      {"code": "COS30019", "category": "prescribed_elective", "year": 3, "term": 1},
      {"code": "COS40006", "category": "core", "year": 3, "term": 2},
      {"code": "COS30020", "category": "major_core", "year": 3, "term": 2}
    ],
    "electiveSlots": [
      {"year": 1, "term": 2},
      {"year": 2, "term": 1},
      {"year": 2, "term": 2},
      {"year": 3, "term": 2}
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Software Development",
    "intakeYear": 2025,
    "intakeMonth": 3,
    "placements": [
      {"code": "COS10009", "category": "core", "year": 1, "term": 1},
      {"code": "COS10026", "category": "core", "year": 1, "term": 1},
      {"code": "COS10025", "category": "core", "year": 1, "term": 1},
      {"code": "COS10003", "category": "prescribed_elective", "year": 1, "term": 1},
      {"code": "MPU3273", "category": "mpu", "year": 1, "term": 1},
      {"code": "MPU3212", "category": "mpu", "year": 1, "term": 4},
      {"code": "COS20007", "category": "core", "year": 1, "term": 2},
      {"code": "TNE10006", "category": "core", "year": 1, "term": 2},
      {"code": "COS20019", "category": "major_core", "year": 1, "term": 2},
      {"code": "MPU3193", "category": "mpu", "year": 1, "term": 2},
      {"code": "COS30043", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS20031", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS30019", "category": "prescribed_elective", "year": 2, "term": 1},
      {"code": "MPU3183", "category": "mpu", "year": 2, "term": 1},
      {"code": "MPU3143", "category": "mpu", "year": 2, "term": 1},
      {"code": "COS10004", "category": "core", "year": 2, "term": 2},
      {"code": "COS30049", "category": "major_core", "year": 2, "term": 2},
      {"code": "COS30008", "category": "major_core", "year": 2, "term": 2},
      {"code": "SWE30009", "category": "major_core", "year": 2, "term": 2},
      {"code": "ICT20016", "category": "wil", "year": 2, "term": 2},
      {"code": "COS40005", "category": "core", "year": 3, "term": 1},
      {"code": "SWE30003", "category": "major_core", "year": 3, "term": 1},
      {"code": "COS40006", "category": "core", "year": 3, "term": 2},
      {"code": "COS40003", "category": "major_core", "year": 3, "term": 2}
    ],
    "electiveSlots": [
      {"year": 1, "term": 2},
      {"year": 2, "term": 1},
      {"year": 3, "term": 1},
      {"year": 3, "term": 2}
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Artificial Intelligence",
    "intakeYear": 2024,
    "intakeMonth": 9,
    "placements": [
      {"code": "COS10009", "category": "core", "year": 1, "term": 1},
      {"code": "COS10026", "category": "core", "year": 1, "term": 1},
      {"code": "COS10025", "category": "core", "year": 1, "term": 1},
      {"code": "COS10003", "category": "prescribed_elective", "year": 1, "term": 1},
      {"code": "MPU3273", "category": "mpu", "year": 1, "term": 1},
      {"code": "MPU3212", "category": "mpu", "year": 1, "term": 3},
      {"code": "COS20007", "category": "core", "year": 1, "term": 2},
      {"code": "TNE10006", "category": "core", "year": 1, "term": 2},
      {"code": "COS10022", "category": "prescribed_elective", "year": 1, "term": 2},
      {"code": "MPU3193", "category": "mpu", "year": 1, "term": 2},
      {"code": "COS20031", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS30019", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS20019", "category": "major_core", "year": 2, "term": 1},
      {"code": "MPU3183", "category": "mpu", "year": 2, "term": 1},
      {"code": "MPU3143", "category": "mpu", "year": 2, "term": 1},
      {"code": "COS10004", "category": "core", "year": 2, "term": 2},
      {"code": "COS30049", "category": "major_core", "year": 2, "term": 2},
      {"code": "COS30018", "category": "major_core", "year": 2, "term": 2},
      {"code": "ICT20016", "category": "wil", "year": 2, "term": 4},
      {"code": "COS40005", "category": "core", "year": 3, "term": 1},
      {"code": "COS30082", "category": "major_core", "year": 3, "term": 1},
      {"code": "COS40006", "category": "core", "year": 3, "term": 2},
      {"code": "COS40007", "category": "major_core", "year": 3, "term": 2},
      {"code": "SWE30003", "category": "major_core", "year": 3, "term": 2}
    ],
    "electiveSlots": [
      {"year": 1, "term": 2},
      {"year": 2, "term": 1},
      {"year": 2, "term": 2},
      {"year": 3, "term": 1}
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Cybersecurity",
    "intakeYear": 2024,
    "intakeMonth": 9,
    "placements": [
      {"code": "COS10009", "category": "core", "year": 1, "term": 1},
      {"code": "COS10026", "category": "core", "year": 1, "term": 1},
      {"code": "COS10025", "category": "core", "year": 1, "term": 1},
      {"code": "COS10003", "category": "prescribed_elective", "year": 1, "term": 1},
      {"code": "MPU3273", "category": "mpu", "year": 1, "term": 1},
      {"code": "MPU3212", "category": "mpu", "year": 1, "term": 3},
      {"code": "COS20007", "category": "core", "year": 1, "term": 2},
      {"code": "TNE10006", "category": "core", "year": 1, "term": 2},
      {"code": "TNE20003", "category": "major_core", "year": 1, "term": 2},
      {"code": "MPU3193", "category": "mpu", "year": 1, "term": 2},
      {"code": "COS20030", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS20031", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS30015", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS30019", "category": "prescribed_elective", "year": 2, "term": 1},
      {"code": "MPU3183", "category": "mpu", "year": 2, "term": 1},
      {"code": "MPU3143", "category": "mpu", "year": 2, "term": 1},
      {"code": "COS10004", "category": "core", "year": 2, "term": 2},
      {"code": "COS30049", "category": "major_core", "year": 2, "term": 2},
      {"code": "COS20019", "category": "major_core", "year": 2, "term": 2},
      {"code": "ICT20016", "category": "wil", "year": 2, "term": 4},
      {"code": "COS40005", "category": "core", "year": 3, "term": 1},
      {"code": "TNE30009", "category": "major_core", "year": 3, "term": 1},
      {"code": "COS40006", "category": "core", "year": 3, "term": 2},
      {"code": "SWE30003", "category": "major_core", "year": 3, "term": 2}
    ],
    "electiveSlots": [
      {"year": 1, "term": 2},
      {"year": 2, "term": 2},
      {"year": 3, "term": 1},
      {"year": 3, "term": 2}
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Data Science",
    "intakeYear": 2024,
    "intakeMonth": 9,
    "placements": [
      {"code": "COS10009", "category": "core", "year": 1, "term": 1},
      {"code": "COS10026", "category": "core", "year": 1, "term": 1},
      {"code": "COS10025", "category": "core", "year": 1, "term": 1},
      {"code": "COS10003", "category": "prescribed_elective", "year": 1, "term": 1},
      {"code": "MPU3273", "category": "mpu", "year": 1, "term": 1},
      {"code": "MPU3212", "category": "mpu", "year": 1, "term": 3},
      {"code": "COS20007", "category": "core", "year": 1, "term": 2},
      {"code": "TNE10006", "category": "core", "year": 1, "term": 2},
      {"code": "COS10022", "category": "major_core", "year": 1, "term": 2},
      {"code": "MPU3193", "category": "mpu", "year": 1, "term": 2},
      {"code": "COS20031", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS30045", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS30019", "category": "prescribed_elective", "year": 2, "term": 1},
      {"code": "MPU3183", "category": "mpu", "year": 2, "term": 1},
      {"code": "MPU3143", "category": "mpu", "year": 2, "term": 1},
      {"code": "COS10004", "category": "core", "year": 2, "term": 2},
      {"code": "COS30049", "category": "major_core", "year": 2, "term": 2},
      {"code": "COS20019", "category": "major_core", "year": 2, "term": 2},
      {"code": "SWE30003", "category": "major_core", "year": 2, "term": 2},
      {"code": "ICT20016", "category": "wil", "year": 2, "term": 4},
      {"code": "COS40005", "category": "core", "year": 3, "term": 1},
      {"code": "COS20028", "category": "major_core", "year": 3, "term": 1},
      {"code": "COS40006", "category": "core", "year": 3, "term": 2},
      {"code": "SWE40006", "category": "major_core", "year": 3, "term": 2}
    ],
    "electiveSlots": [
      {"year": 1, "term": 2},
      {"year": 2, "term": 1},
      {"year": 3, "term": 1},
      {"year": 3, "term": 2}
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Internet of Things",
    "intakeYear": 2024,
    "intakeMonth": 9,
    "placements": [
      {"code": "COS10009", "category": "core", "year": 1, "term": 1},
      {"code": "COS10026", "category": "core", "year": 1, "term": 1},
      {"code": "COS10025", "category": "core", "year": 1, "term": 1},
      {"code": "COS10003", "category": "prescribed_elective", "year": 1, "term": 1},
      {"code": "MPU3273", "category": "mpu", "year": 1, "term": 1},
      {"code": "MPU3212", "category": "mpu", "year": 1, "term": 3},
      {"code": "COS20007", "category": "core", "year": 1, "term": 2},
      {"code": "TNE10006", "category": "core", "year": 1, "term": 2},
      {"code": "TNE10005", "category": "major_core", "year": 1, "term": 2},
      {"code": "MPU3193", "category": "mpu", "year": 1, "term": 2},
      {"code": "COS30020", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS20031", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS30019", "category": "prescribed_elective", "year": 2, "term": 1},
      {"code": "MPU3183", "category": "mpu", "year": 2, "term": 1},
      {"code": "MPU3143", "category": "mpu", "year": 2, "term": 1},
      {"code": "COS10004", "category": "core", "year": 2, "term": 2},
      {"code": "COS30017", "category": "major_core", "year": 2, "term": 2},
      {"code": "COS20019", "category": "major_core", "year": 2, "term": 2},
      {"code": "SWE30011", "category": "major_core", "year": 2, "term": 2},
      {"code": "ICT20016", "category": "wil", "year": 2, "term": 4},
      {"code": "COS40005", "category": "core", "year": 3, "term": 1},
      {"code": "COS30049", "category": "major_core", "year": 3, "term": 1},
      {"code": "COS40006", "category": "core", "year": 3, "term": 2},
      {"code": "SWE30003", "category": "major_core", "year": 3, "term": 2}
    ],
    "electiveSlots": [
      {"year": 1, "term": 2},
      {"year": 2, "term": 1},
      {"year": 3, "term": 1},
      {"year": 3, "term": 2}
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Software Development",
    "intakeYear": 2024,
    "intakeMonth": 9,
    "placements": [
      {"code": "COS10009", "category": "core", "year": 1, "term": 1},
      {"code": "COS10026", "category": "core", "year": 1, "term": 1},
      {"code": "COS10025", "category": "core", "year": 1, "term": 1},
      {"code": "COS10003", "category": "prescribed_elective", "year": 1, "term": 1},
      {"code": "MPU3273", "category": "mpu", "year": 1, "term": 1},
      {"code": "MPU3212", "category": "mpu", "year": 1, "term": 3},
      {"code": "COS20007", "category": "core", "year": 1, "term": 2},
      {"code": "TNE10006", "category": "core", "year": 1, "term": 2},
      {"code": "COS20019", "category": "major_core", "year": 1, "term": 2},
      {"code": "MPU3193", "category": "mpu", "year": 1, "term": 2},
      {"code": "COS20031", "category": "major_core", "year": 2, "term": 1},
      {"code": "SWE30009", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS30019", "category": "prescribed_elective", "year": 2, "term": 1},
      {"code": "MPU3183", "category": "mpu", "year": 2, "term": 1},
      {"code": "MPU3143", "category": "mpu", "year": 2, "term": 1},
      {"code": "COS10004", "category": "core", "year": 2, "term": 2},
      {"code": "COS30043", "category": "major_core", "year": 2, "term": 2},
      {"code": "COS30049", "category": "major_core", "year": 2, "term": 2},
      {"code": "ICT20016", "category": "wil", "year": 2, "term": 4},
      {"code": "COS40005", "category": "core", "year": 3, "term": 1},
      {"code": "COS40003", "category": "major_core", "year": 3, "term": 1},
      {"code": "COS30008", "category": "major_core", "year": 3, "term": 1},
      {"code": "COS40006", "category": "core", "year": 3, "term": 2},
      {"code": "SWE30003", "category": "major_core", "year": 3, "term": 2}
    ],
    "electiveSlots": [
      {"year": 1, "term": 2},
      {"year": 2, "term": 1},
      {"year": 2, "term": 2},
      {"year": 3, "term": 2}
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Artificial Intelligence",
    "intakeYear": 2024,
    "intakeMonth": 2,
    "placements": [
      {"code": "COS10009", "category": "core", "year": 1, "term": 1},
      {"code": "COS10026", "category": "core", "year": 1, "term": 1},
      {"code": "COS10025", "category": "core", "year": 1, "term": 1},
      {"code": "COS10003", "category": "prescribed_elective", "year": 1, "term": 1},
      {"code": "MPU3273", "category": "mpu", "year": 1, "term": 1},
      {"code": "MPU3212", "category": "mpu", "year": 1, "term": 4},
      {"code": "COS20007", "category": "core", "year": 1, "term": 2},
      {"code": "TNE10006", "category": "core", "year": 1, "term": 2},
      {"code": "COS10022", "category": "prescribed_elective", "year": 1, "term": 2},
      {"code": "MPU3193", "category": "mpu", "year": 1, "term": 2},
      {"code": "COS30018", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS20019", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS20031", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS30019", "category": "major_core", "year": 2, "term": 1},
      {"code": "MPU3183", "category": "mpu", "year": 2, "term": 1},
      {"code": "MPU3143", "category": "mpu", "year": 2, "term": 1},
      {"code": "COS10004", "category": "core", "year": 2, "term": 2},
      {"code": "COS30049", "category": "major_core", "year": 2, "term": 2},
      {"code": "SWE30009", "category": "prescribed_elective", "year": 2, "term": 2},
      {"code": "COS30015", "category": "prescribed_elective", "year": 2, "term": 2},
      {"code": "COS40005", "category": "core", "year": 3, "term": 1},
      {"code": "SWE30003", "category": "major_core", "year": 3, "term": 1},
      {"code": "COS40007", "category": "major_core", "year": 3, "term": 1},
      {"code": "COS40006", "category": "core", "year": 3, "term": 2},
      {"code": "COS30082", "category": "major_core", "year": 3, "term": 2}
    ],
    "electiveSlots": [
      {"year": 1, "term": 2},
      {"year": 3, "term": 1},
      {"year": 3, "term": 2},
      {"year": 3, "term": 2}
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Cybersecurity",
    "intakeYear": 2024,
    "intakeMonth": 2,
    "placements": [
      {"code": "COS10009", "category": "core", "year": 1, "term": 1},
      {"code": "COS10026", "category": "core", "year": 1, "term": 1},
      {"code": "COS10025", "category": "core", "year": 1, "term": 1},
      {"code": "COS10003", "category": "prescribed_elective", "year": 1, "term": 1},
      {"code": "MPU3273", "category": "mpu", "year": 1, "term": 1},
      {"code": "MPU3212", "category": "mpu", "year": 1, "term": 4},
      {"code": "COS20007", "category": "core", "year": 1, "term": 2},
      {"code": "TNE10006", "category": "core", "year": 1, "term": 2},
      {"code": "COS10022", "category": "prescribed_elective", "year": 1, "term": 2},
      {"code": "MPU3193", "category": "mpu", "year": 1, "term": 2},
      {"code": "TNE20003", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS20019", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS20031", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS30015", "category": "major_core", "year": 2, "term": 1},
      {"code": "MPU3183", "category": "mpu", "year": 2, "term": 1},
      {"code": "MPU3143", "category": "mpu", "year": 2, "term": 1},
      {"code": "COS10004", "category": "core", "year": 2, "term": 2},
      {"code": "COS30049", "category": "major_core", "year": 2, "term": 2},
      {"code": "TNE30009", "category": "major_core", "year": 2, "term": 2},
      {"code": "COS30019", "category": "prescribed_elective", "year": 2, "term": 2},
      {"code": "COS40005", "category": "core", "year": 3, "term": 1},
      {"code": "SWE30003", "category": "major_core", "year": 3, "term": 1},
      {"code": "COS30047", "category": "prescribed_elective", "year": 3, "term": 1},
      {"code": "COS40006", "category": "core", "year": 3, "term": 2},
      {"code": "COS20030", "category": "major_core", "year": 3, "term": 2}
    ],
    "electiveSlots": [
      {"year": 1, "term": 2},
      {"year": 3, "term": 1},
      {"year": 3, "term": 2},
      {"year": 3, "term": 2}
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Data Science",
    "intakeYear": 2024,
    "intakeMonth": 2,
    "placements": [
      {"code": "COS10009", "category": "core", "year": 1, "term": 1},
      {"code": "COS10026", "category": "core", "year": 1, "term": 1},
      {"code": "COS10025", "category": "core", "year": 1, "term": 1},
      {"code": "COS10003", "category": "prescribed_elective", "year": 1, "term": 1},
      {"code": "MPU3273", "category": "mpu", "year": 1, "term": 1},
      {"code": "MPU3212", "category": "mpu", "year": 1, "term": 4},
      {"code": "COS20007", "category": "core", "year": 1, "term": 2},
      {"code": "TNE10006", "category": "core", "year": 1, "term": 2},
      {"code": "COS10022", "category": "major_core", "year": 1, "term": 2},
      {"code": "MPU3193", "category": "mpu", "year": 1, "term": 2},
      {"code": "COS20031", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS20019", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS30019", "category": "prescribed_elective", "year": 2, "term": 1},
      {"code": "COS30015", "category": "prescribed_elective", "year": 2, "term": 1},
      {"code": "MPU3183", "category": "mpu", "year": 2, "term": 1},
      {"code": "MPU3143", "category": "mpu", "year": 2, "term": 1},
      {"code": "COS10004", "category": "core", "year": 2, "term": 2},
      {"code": "COS30049", "category": "major_core", "year": 2, "term": 2},
      {"code": "COS30045", "category": "major_core", "year": 2, "term": 2},
      {"code": "SWE30009", "category": "prescribed_elective", "year": 2, "term": 2},
      {"code": "COS40005", "category": "core", "year": 3, "term": 1},
      {"code": "SWE30003", "category": "major_core", "year": 3, "term": 1},
      {"code": "SWE40006", "category": "major_core", "year": 3, "term": 1},
      {"code": "COS40006", "category": "core", "year": 3, "term": 2},
      {"code": "COS20028", "category": "major_core", "year": 3, "term": 2}
    ],
    "electiveSlots": [
      {"year": 1, "term": 2},
      {"year": 3, "term": 1},
      {"year": 3, "term": 2},
      {"year": 3, "term": 2}
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Internet of Things",
    "intakeYear": 2024,
    "intakeMonth": 2,
    "placements": [
      {"code": "COS10009", "category": "core", "year": 1, "term": 1},
      {"code": "COS10026", "category": "core", "year": 1, "term": 1},
      {"code": "COS10025", "category": "core", "year": 1, "term": 1},
      {"code": "COS10003", "category": "prescribed_elective", "year": 1, "term": 1},
      {"code": "MPU3273", "category": "mpu", "year": 1, "term": 1},
      {"code": "MPU3212", "category": "mpu", "year": 1, "term": 4},
      {"code": "COS20007", "category": "core", "year": 1, "term": 2},
      {"code": "TNE10006", "category": "core", "year": 1, "term": 2},
      {"code": "COS10022", "category": "prescribed_elective", "year": 1, "term": 2},
      {"code": "MPU3193", "category": "mpu", "year": 1, "term": 2},
      {"code": "TNE10005", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS20019", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS20031", "category": "major_core", "year": 2, "term": 1},
      {"code": "SWE30011", "category": "major_core", "year": 2, "term": 1},
      {"code": "MPU3183", "category": "mpu", "year": 2, "term": 1},
      {"code": "MPU3143", "category": "mpu", "year": 2, "term": 1},
      {"code": "COS10004", "category": "core", "year": 2, "term": 2},
      {"code": "COS30049", "category": "major_core", "year": 2, "term": 2},
      {"code": "COS30017", "category": "major_core", "year": 2, "term": 2},
      {"code": "COS30015", "category": "prescribed_elective", "year": 2, "term": 2},
      {"code": "COS40005", "category": "core", "year": 3, "term": 1},
      {"code": "SWE30003", "category": "major_core", "year": 3, "term": 1},
      {"code": "COS30019", "category": "prescribed_elective", "year": 3, "term": 1},
      {"code": "COS40006", "category": "core", "year": 3, "term": 2},
      {"code": "COS30020", "category": "major_core", "year": 3, "term": 2}
    ],
    "electiveSlots": [
      {"year": 1, "term": 2},
      {"year": 3, "term": 1},
      {"year": 3, "term": 2},
      {"year": 3, "term": 2}
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Software Development",
    "intakeYear": 2024,
    "intakeMonth": 2,
    "placements": [
      {"code": "COS10009", "category": "core", "year": 1, "term": 1},
      {"code": "COS10026", "category": "core", "year": 1, "term": 1},
      {"code": "COS10025", "category": "core", "year": 1, "term": 1},
      {"code": "COS10003", "category": "prescribed_elective", "year": 1, "term": 1},
      {"code": "MPU3273", "category": "mpu", "year": 1, "term": 1},
      {"code": "MPU3212", "category": "mpu", "year": 1, "term": 4},
      {"code": "COS20007", "category": "core", "year": 1, "term": 2},
      {"code": "TNE10006", "category": "core", "year": 1, "term": 2},
      {"code": "COS10022", "category": "prescribed_elective", "year": 1, "term": 2},
      {"code": "MPU3193", "category": "mpu", "year": 1, "term": 2},
      {"code": "COS30043", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS20019", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS20031", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS30019", "category": "prescribed_elective", "year": 2, "term": 1},
      {"code": "MPU3183", "category": "mpu", "year": 2, "term": 1},
      {"code": "MPU3143", "category": "mpu", "year": 2, "term": 1},
      {"code": "COS10004", "category": "core", "year": 2, "term": 2},
      {"code": "COS30049", "category": "major_core", "year": 2, "term": 2},
      {"code": "COS30008", "category": "major_core", "year": 2, "term": 2},
      {"code": "SWE30009", "category": "major_core", "year": 2, "term": 2},
      {"code": "COS40005", "category": "core", "year": 3, "term": 1},
      {"code": "SWE30003", "category": "major_core", "year": 3, "term": 1},
      {"code": "COS30015", "category": "prescribed_elective", "year": 3, "term": 1},
      {"code": "COS40006", "category": "core", "year": 3, "term": 2},
      {"code": "COS40003", "category": "major_core", "year": 3, "term": 2}
    ],
    "electiveSlots": [
      {"year": 1, "term": 2},
      {"year": 3, "term": 1},
      {"year": 3, "term": 2},
      {"year": 3, "term": 2}
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Artificial Intelligence",
    "intakeYear": 2023,
    "intakeMonth": 9,
    "placements": [
      {"code": "COS10009", "category": "core", "year": 1, "term": 1},
      {"code": "COS10026", "category": "core", "year": 1, "term": 1},
      {"code": "TNE10006", "category": "core", "year": 1, "term": 1},
      {"code": "COS10003", "category": "prescribed_elective", "year": 1, "term": 1},
      {"code": "MPU3193", "category": "mpu", "year": 1, "term": 1},
      {"code": "MPU3212", "category": "mpu", "year": 1, "term": 3},
      {"code": "COS20007", "category": "core", "year": 1, "term": 2},
      {"code": "COS10025", "category": "core", "year": 1, "term": 2},
      {"code": "COS30015", "category": "prescribed_elective", "year": 1, "term": 2},
      {"code": "COS10022", "category": "prescribed_elective", "year": 1, "term": 2},
      {"code": "MPU3183", "category": "mpu", "year": 2, "term": 1},
      {"code": "MPU3143", "category": "mpu", "year": 2, "term": 1},
      {"code": "COS20031", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS30019", "category": "major_core", "year": 2, "term": 1},
      {"code": "SWE30009", "category": "prescribed_elective", "year": 2, "term": 1},
      {"code": "COS10004", "category": "core", "year": 2, "term": 2},
      {"code": "COS30049", "category": "major_core", "year": 2, "term": 2},
      {"code": "COS30018", "category": "major_core", "year": 2, "term": 2},
      {"code": "COS20019", "category": "major_core", "year": 2, "term": 2},
      {"code": "ICT20016*Optional", "category": "wil", "year": 2, "term": 4},
      {"code": "COS40005", "category": "core", "year": 3, "term": 1},
      {"code": "COS30082", "category": "major_core", "year": 3, "term": 1},
      {"code": "COS40006", "category": "core", "year": 3, "term": 2},
      {"code": "COS40007", "category": "major_core", "year": 3, "term": 2},
      {"code": "SWE30003", "category": "major_core", "year": 3, "term": 2}
    ],
    "electiveSlots": [
      {"year": 2, "term": 1},
      {"year": 3, "term": 1},
      {"year": 3, "term": 1},
      {"year": 3, "term": 2}
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Cybersecurity",
    "intakeYear": 2023,
    "intakeMonth": 9,
    "placements": [
      {"code": "COS10009", "category": "core", "year": 1, "term": 1},
      {"code": "COS10026", "category": "core", "year": 1, "term": 1},
      {"code": "TNE10006", "category": "core", "year": 1, "term": 1},
      {"code": "COS10003", "category": "prescribed_elective", "year": 1, "term": 1},
      {"code": "MPU3193", "category": "mpu", "year": 1, "term": 1},
      {"code": "MPU3212", "category": "mpu", "year": 1, "term": 3},
      {"code": "COS20007", "category": "core", "year": 1, "term": 2},
      {"code": "COS10025", "category": "core", "year": 1, "term": 2},
      {"code": "COS30015", "category": "major_core", "year": 1, "term": 2},
      {"code": "COS10022", "category": "prescribed_elective", "year": 1, "term": 2},
      {"code": "MPU3183", "category": "mpu", "year": 2, "term": 1},
      {"code": "MPU3143", "category": "mpu", "year": 2, "term": 1},
      {"code": "COS20030", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS20031", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS30019", "category": "prescribed_elective", "year": 2, "term": 1},
      {"code": "COS10004", "category": "core", "year": 2, "term": 2},
      {"code": "COS30049", "category": "major_core", "year": 2, "term": 2},
      {"code": "TNE20003", "category": "major_core", "year": 2, "term": 2},
      {"code": "COS20019", "category": "major_core", "year": 2, "term": 2},
      {"code": "ICT20016*Optional", "category": "wil", "year": 2, "term": 4},
      {"code": "COS40005", "category": "core", "year": 3, "term": 1},
      {"code": "TNE30009", "category": "major_core", "year": 3, "term": 1},
      {"code": "COS30047", "category": "prescribed_elective", "year": 3, "term": 1},
      {"code": "COS40006", "category": "core", "year": 3, "term": 2},
      {"code": "SWE30003", "category": "major_core", "year": 3, "term": 2}
    ],
    "electiveSlots": [
      {"year": 2, "term": 1},
      {"year": 3, "term": 1},
      {"year": 3, "term": 2},
      {"year": 3, "term": 2}
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Data Science",
    "intakeYear": 2023,
    "intakeMonth": 9,
    "placements": [
      {"code": "COS10009", "category": "core", "year": 1, "term": 1},
      {"code": "COS10026", "category": "core", "year": 1, "term": 1},
      {"code": "TNE10006", "category": "core", "year": 1, "term": 1},
      {"code": "COS10003", "category": "prescribed_elective", "year": 1, "term": 1},
      {"code": "MPU3193", "category": "mpu", "year": 1, "term": 1},
      {"code": "MPU3212", "category": "mpu", "year": 1, "term": 3},
      {"code": "COS20007", "category": "core", "year": 1, "term": 2},
      {"code": "COS10025", "category": "core", "year": 1, "term": 2},
      {"code": "COS30015", "category": "prescribed_elective", "year": 1, "term": 2},
      {"code": "COS10022", "category": "major_core", "year": 1, "term": 2},
      {"code": "MPU3183", "category": "mpu", "year": 2, "term": 1},
      {"code": "MPU3143", "category": "mpu", "year": 2, "term": 1},
      {"code": "COS20031", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS30045", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS30019", "category": "prescribed_elective", "year": 2, "term": 1},
      {"code": "COS10004", "category": "core", "year": 2, "term": 2},
      {"code": "COS30049", "category": "major_core", "year": 2, "term": 2},
      {"code": "COS20019", "category": "major_core", "year": 2, "term": 2},
      {"code": "SWE30003", "category": "major_core", "year": 2, "term": 2},
      {"code": "ICT20016*Optional", "category": "wil", "year": 2, "term": 4},
      {"code": "COS40005", "category": "core", "year": 3, "term": 1},
      {"code": "COS20028", "category": "major_core", "year": 3, "term": 1},
      {"code": "SWE30009", "category": "prescribed_elective", "year": 3, "term": 1},
      {"code": "COS40006", "category": "core", "year": 3, "term": 2},
      {"code": "SWE40006", "category": "major_core", "year": 3, "term": 2}
    ],
    "electiveSlots": [
      {"year": 2, "term": 1},
      {"year": 3, "term": 1},
      {"year": 3, "term": 2},
      {"year": 3, "term": 2}
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Internet of Things",
    "intakeYear": 2023,
    "intakeMonth": 9,
    "placements": [
      {"code": "COS10009", "category": "core", "year": 1, "term": 1},
      {"code": "COS10026", "category": "core", "year": 1, "term": 1},
      {"code": "TNE10006", "category": "core", "year": 1, "term": 1},
      {"code": "COS10003", "category": "prescribed_elective", "year": 1, "term": 1},
      {"code": "MPU3193", "category": "mpu", "year": 1, "term": 1},
      {"code": "MPU3212", "category": "mpu", "year": 1, "term": 3},
      {"code": "COS20007", "category": "core", "year": 1, "term": 2},
      {"code": "COS10025", "category": "core", "year": 1, "term": 2},
      {"code": "COS30015", "category": "prescribed_elective", "year": 1, "term": 2},
      {"code": "COS10022", "category": "prescribed_elective", "year": 1, "term": 2},
      {"code": "MPU3183", "category": "mpu", "year": 2, "term": 1},
      {"code": "MPU3143", "category": "mpu", "year": 2, "term": 1},
      {"code": "COS30020", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS20031", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS30019", "category": "prescribed_elective", "year": 2, "term": 1},
      {"code": "TNE10005", "category": "major_core", "year": 2, "term": 2},
      {"code": "COS30049", "category": "major_core", "year": 2, "term": 2},
      {"code": "COS20019", "category": "major_core", "year": 2, "term": 2},
      {"code": "SWE30011", "category": "major_core", "year": 2, "term": 2},
      {"code": "ICT20016*Optional", "category": "wil", "year": 2, "term": 4},
      {"code": "COS40005", "category": "core", "year": 3, "term": 1},
      {"code": "COS10004", "category": "core", "year": 3, "term": 1},
      {"code": "COS30017", "category": "major_core", "year": 3, "term": 1},
      {"code": "COS40006", "category": "core", "year": 3, "term": 2},
      {"code": "SWE30003", "category": "major_core", "year": 3, "term": 2}
    ],
    "electiveSlots": [
      {"year": 2, "term": 1},
      {"year": 3, "term": 1},
      {"year": 3, "term": 2},
      {"year": 3, "term": 2}
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Software Development",
    "intakeYear": 2023,
    "intakeMonth": 9,
    "placements": [
      {"code": "COS10009", "category": "core", "year": 1, "term": 1},
      {"code": "COS10026", "category": "core", "year": 1, "term": 1},
      {"code": "TNE10006", "category": "core", "year": 1, "term": 1},
      {"code": "COS10003", "category": "prescribed_elective", "year": 1, "term": 1},
      {"code": "MPU3193", "category": "mpu", "year": 1, "term": 1},
      {"code": "MPU3212", "category": "mpu", "year": 1, "term": 3},
      {"code": "COS20007", "category": "core", "year": 1, "term": 2},
      {"code": "COS10025", "category": "core", "year": 1, "term": 2},
      {"code": "COS30015", "category": "prescribed_elective", "year": 1, "term": 2},
      {"code": "COS10022", "category": "prescribed_elective", "year": 1, "term": 2},
      {"code": "MPU3183", "category": "mpu", "year": 2, "term": 1},
      {"code": "MPU3143", "category": "mpu", "year": 2, "term": 1},
      {"code": "COS20031", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS30008", "category": "major_core", "year": 2, "term": 1},
      {"code": "SWE30009", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS30019", "category": "prescribed_elective", "year": 2, "term": 1},
      {"code": "COS10004", "category": "core", "year": 2, "term": 2},
      {"code": "COS30043", "category": "major_core", "year": 2, "term": 2},
      {"code": "COS30049", "category": "major_core", "year": 2, "term": 2},
      {"code": "COS20019", "category": "major_core", "year": 2, "term": 2},
      {"code": "ICT20016*Optional", "category": "wil", "year": 2, "term": 4},
      {"code": "COS40005", "category": "core", "year": 3, "term": 1},
      {"code": "COS40003", "category": "major_core", "year": 3, "term": 1},
      {"code": "COS40006", "category": "core", "year": 3, "term": 2},
      {"code": "SWE30003", "category": "major_core", "year": 3, "term": 2}
    ],
    "electiveSlots": [
      {"year": 3, "term": 1},
      {"year": 3, "term": 1},
      {"year": 3, "term": 2},
      {"year": 3, "term": 2}
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Artificial Intelligence",
    "intakeYear": 2023,
    "intakeMonth": 2,
    "placements": [
      {"code": "COS10009", "category": "core", "year": 1, "term": 1},
      {"code": "COS10026", "category": "core", "year": 1, "term": 1},
      {"code": "TNE10006", "category": "core", "year": 1, "term": 1},
      {"code": "COS10003", "category": "prescribed_elective", "year": 1, "term": 1},
      {"code": "MPU3193", "category": "mpu", "year": 1, "term": 1},
      {"code": "MPU3212", "category": "mpu", "year": 1, "term": 4},
      {"code": "COS20007", "category": "core", "year": 1, "term": 2},
      {"code": "COS10025", "category": "core", "year": 1, "term": 2},
      {"code": "COS30015", "category": "prescribed_elective", "year": 1, "term": 2},
      {"code": "COS10022", "category": "prescribed_elective", "year": 1, "term": 2},
      {"code": "MPU3183", "category": "mpu", "year": 2, "term": 1},
      {"code": "MPU3143", "category": "mpu", "year": 2, "term": 1},
      {"code": "COS30018", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS20019", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS20031", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS30019", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS10004", "category": "core", "year": 2, "term": 2},
      {"code": "COS30049", "category": "major_core", "year": 2, "term": 2},
      {"code": "SWE30009", "category": "elective", "year": 2, "term": 2},
      {"code": "COS40005", "category": "core", "year": 3, "term": 1},
      {"code": "SWE30003", "category": "major_core", "year": 3, "term": 1},
      {"code": "COS40007", "category": "major_core", "year": 3, "term": 1},
      {"code": "COS40006", "category": "core", "year": 3, "term": 2},
      {"code": "COS30082", "category": "major_core", "year": 3, "term": 2}
    ],
    "electiveSlots": [
      {"year": 2, "term": 2},
      {"year": 3, "term": 1},
      {"year": 3, "term": 2},
      {"year": 3, "term": 2}
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Cybersecurity",
    "intakeYear": 2023,
    "intakeMonth": 2,
    "placements": [
      {"code": "COS10009", "category": "core", "year": 1, "term": 1},
      {"code": "COS10026", "category": "core", "year": 1, "term": 1},
      {"code": "TNE10006", "category": "core", "year": 1, "term": 1},
      {"code": "COS10003", "category": "prescribed_elective", "year": 1, "term": 1},
      {"code": "MPU3193", "category": "mpu", "year": 1, "term": 1},
      {"code": "MPU3212", "category": "mpu", "year": 1, "term": 4},
      {"code": "COS20007", "category": "core", "year": 1, "term": 2},
      {"code": "COS10025", "category": "core", "year": 1, "term": 2},
      {"code": "COS30015", "category": "major_core", "year": 1, "term": 2},
      {"code": "COS10022", "category": "prescribed_elective", "year": 1, "term": 2},
      {"code": "MPU3183", "category": "mpu", "year": 2, "term": 1},
      {"code": "MPU3143", "category": "mpu", "year": 2, "term": 1},
      {"code": "TNE20003", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS20019", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS20031", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS30019", "category": "prescribed_elective", "year": 2, "term": 1},
      {"code": "COS10004", "category": "core", "year": 2, "term": 2},
      {"code": "COS30049", "category": "major_core", "year": 2, "term": 2},
      {"code": "TNE30009", "category": "major_core", "year": 2, "term": 2},
      {"code": "COS40005", "category": "core", "year": 3, "term": 1},
      {"code": "SWE30003", "category": "major_core", "year": 3, "term": 1},
      {"code": "COS40006", "category": "core", "year": 3, "term": 2},
      {"code": "COS20030", "category": "major_core", "year": 3, "term": 2},
      {"code": "COS30047", "category": "prescribed_elective", "year": 3, "term": 2}
    ],
    "electiveSlots": [
      {"year": 2, "term": 2},
      {"year": 3, "term": 1},
      {"year": 3, "term": 1},
      {"year": 3, "term": 2}
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Data Science",
    "intakeYear": 2023,
    "intakeMonth": 2,
    "placements": [
      {"code": "COS10009", "category": "core", "year": 1, "term": 1},
      {"code": "COS10026", "category": "core", "year": 1, "term": 1},
      {"code": "TNE10006", "category": "core", "year": 1, "term": 1},
      {"code": "COS10003", "category": "prescribed_elective", "year": 1, "term": 1},
      {"code": "MPU3193", "category": "mpu", "year": 1, "term": 1},
      {"code": "MPU3212", "category": "mpu", "year": 1, "term": 4},
      {"code": "COS20007", "category": "core", "year": 1, "term": 2},
      {"code": "COS10025", "category": "core", "year": 1, "term": 2},
      {"code": "COS30015", "category": "prescribed_elective", "year": 1, "term": 2},
      {"code": "COS10022", "category": "major_core", "year": 1, "term": 2},
      {"code": "MPU3183", "category": "mpu", "year": 2, "term": 1},
      {"code": "MPU3143", "category": "mpu", "year": 2, "term": 1},
      {"code": "COS20031", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS20019", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS30019", "category": "prescribed_elective", "year": 2, "term": 1},
      {"code": "COS10004", "category": "core", "year": 2, "term": 2},
      {"code": "COS30049", "category": "major_core", "year": 2, "term": 2},
      {"code": "COS30045", "category": "major_core", "year": 2, "term": 2},
      {"code": "SWE30009", "category": "prescribed_elective", "year": 2, "term": 2},
      {"code": "COS40005", "category": "core", "year": 3, "term": 1},
      {"code": "SWE30003", "category": "major_core", "year": 3, "term": 1},
      {"code": "SWE40006", "category": "major_core", "year": 3, "term": 1},
      {"code": "COS40006", "category": "core", "year": 3, "term": 2},
      {"code": "COS20028", "category": "major_core", "year": 3, "term": 2}
    ],
    "electiveSlots": [
      {"year": 2, "term": 1},
      {"year": 3, "term": 1},
      {"year": 3, "term": 2},
      {"year": 3, "term": 2}
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Internet of Things",
    "intakeYear": 2023,
    "intakeMonth": 2,
    "placements": [
      {"code": "COS10009", "category": "core", "year": 1, "term": 1},
      {"code": "COS10026", "category": "core", "year": 1, "term": 1},
      {"code": "TNE10006", "category": "core", "year": 1, "term": 1},
      {"code": "COS10003", "category": "prescribed_elective", "year": 1, "term": 1},
      {"code": "MPU3193", "category": "mpu", "year": 1, "term": 1},
      {"code": "MPU3212", "category": "mpu", "year": 1, "term": 4},
      {"code": "COS20007", "category": "core", "year": 1, "term": 2},
      {"code": "COS10025", "category": "core", "year": 1, "term": 2},
      {"code": "COS30015", "category": "prescribed_elective", "year": 1, "term": 2},
      {"code": "COS10022", "category": "prescribed_elective", "year": 1, "term": 2},
      {"code": "MPU3183", "category": "mpu", "year": 2, "term": 1},
      {"code": "MPU3143", "category": "mpu", "year": 2, "term": 1},
      {"code": "TNE10005", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS20019", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS20031", "category": "major_core", "year": 2, "term": 1},
      {"code": "SWE30011", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS10004", "category": "core", "year": 2, "term": 2},
      {"code": "COS30049", "category": "major_core", "year": 2, "term": 2},
      {"code": "COS30017", "category": "major_core", "year": 2, "term": 2},
      {"code": "COS30019", "category": "prescribed_elective", "year": 2, "term": 2},
      {"code": "COS40005", "category": "core", "year": 3, "term": 1},
      {"code": "SWE30003", "category": "major_core", "year": 3, "term": 1},
      {"code": "COS40006", "category": "core", "year": 3, "term": 2},
      {"code": "COS30020", "category": "major_core", "year": 3, "term": 2}
    ],
    "electiveSlots": [
      {"year": 3, "term": 1},
      {"year": 3, "term": 1},
      {"year": 3, "term": 2},
      {"year": 3, "term": 2}
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Software Development",
    "intakeYear": 2023,
    "intakeMonth": 2,
    "placements": [
      {"code": "COS10009", "category": "core", "year": 1, "term": 1},
      {"code": "COS10026", "category": "core", "year": 1, "term": 1},
      {"code": "TNE10006", "category": "core", "year": 1, "term": 1},
      {"code": "COS10003", "category": "prescribed_elective", "year": 1, "term": 1},
      {"code": "MPU3193", "category": "mpu", "year": 1, "term": 1},
      {"code": "MPU3212", "category": "mpu", "year": 1, "term": 4},
      {"code": "COS20007", "category": "core", "year": 1, "term": 2},
      {"code": "COS10025", "category": "core", "year": 1, "term": 2},
      {"code": "COS30015", "category": "prescribed_elective", "year": 1, "term": 2},
      {"code": "COS10022", "category": "prescribed_elective", "year": 1, "term": 2},
      {"code": "MPU3183", "category": "mpu", "year": 2, "term": 1},
      {"code": "MPU3143", "category": "mpu", "year": 2, "term": 1},
      {"code": "COS30043", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS20019", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS20031", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS30019", "category": "prescribed_elective", "year": 2, "term": 1},
      {"code": "COS10004", "category": "core", "year": 2, "term": 2},
      {"code": "COS30049", "category": "major_core", "year": 2, "term": 2},
      {"code": "COS30008", "category": "major_core", "year": 2, "term": 2},
      {"code": "SWE30009", "category": "major_core", "year": 2, "term": 2},
      {"code": "COS40005", "category": "core", "year": 3, "term": 1},
      {"code": "SWE30003", "category": "major_core", "year": 3, "term": 1},
      {"code": "COS40006", "category": "core", "year": 3, "term": 2},
      {"code": "COS40003", "category": "major_core", "year": 3, "term": 2}
    ],
    "electiveSlots": [
      {"year": 3, "term": 1},
      {"year": 3, "term": 1},
      {"year": 3, "term": 2},
      {"year": 3, "term": 2}
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Artificial Intelligence",
    "intakeYear": 2022,
    "intakeMonth": 9,
    "placements": [
      {"code": "COS10009", "category": "core", "year": 1, "term": 1},
      {"code": "COS10011", "category": "core", "year": 1, "term": 1},
      {"code": "COS10003", "category": "core", "year": 1, "term": 1},
      {"code": "TNE10006", "category": "core", "year": 1, "term": 1},
      {"code": "COS20007", "category": "major_core", "year": 1, "term": 2},
      {"code": "COS20001", "category": "major_core", "year": 1, "term": 2},
      {"code": "COS20015", "category": "core", "year": 1, "term": 2},
      {"code": "COS30008", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS30019", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS30018", "category": "major_core", "year": 2, "term": 2},
      {"code": "SWE20001", "category": "major_core", "year": 2, "term": 2},
      {"code": "COS30081", "category": "major_core", "year": 2, "term": 2},
      {"code": "SWE40001", "category": "core", "year": 3, "term": 1},
      {"code": "COS30082", "category": "major_core", "year": 3, "term": 1},
      {"code": "SWE40002", "category": "core", "year": 3, "term": 2},
      {"code": "ICT30005", "category": "core", "year": 3, "term": 2}
    ],
    "electiveSlots": [
      {"year": 1, "term": 2},
      {"year": 2, "term": 1},
      {"year": 2, "term": 1},
      {"year": 2, "term": 2},
      {"year": 3, "term": 1},
      {"year": 3, "term": 1},
      {"year": 3, "term": 2},
      {"year": 3, "term": 2}
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Cybersecurity",
    "intakeYear": 2022,
    "intakeMonth": 9,
    "placements": [
      {"code": "COS10009", "category": "core", "year": 1, "term": 1},
      {"code": "COS10011", "category": "core", "year": 1, "term": 1},
      {"code": "COS10003", "category": "core", "year": 1, "term": 1},
      {"code": "TNE10006", "category": "core", "year": 1, "term": 1},
      {"code": "COS20007", "category": "major_core", "year": 1, "term": 2},
      {"code": "TNE20002", "category": "major_core", "year": 1, "term": 2},
      {"code": "COS20015", "category": "core", "year": 1, "term": 2},
      {"code": "COS30015", "category": "major_core", "year": 2, "term": 1},
      {"code": "SWE20001", "category": "major_core", "year": 2, "term": 1},
      {"code": "TNE30009", "category": "major_core", "year": 2, "term": 1},
      {"code": "ICT30010", "category": "major_core", "year": 2, "term": 2},
      {"code": "TNE30012", "category": "major_core", "year": 2, "term": 2},
      {"code": "SWE40001", "category": "core", "year": 3, "term": 1},
      {"code": "INF30020", "category": "major_core", "year": 3, "term": 1},
      {"code": "SWE40002", "category": "core", "year": 3, "term": 2},
      {"code": "ICT30005", "category": "core", "year": 3, "term": 2}
    ],
    "electiveSlots": [
      {"year": 1, "term": 2},
      {"year": 2, "term": 1},
      {"year": 2, "term": 2},
      {"year": 2, "term": 2},
      {"year": 3, "term": 1},
      {"year": 3, "term": 1},
      {"year": 3, "term": 2},
      {"year": 3, "term": 2}
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Data Science",
    "intakeYear": 2022,
    "intakeMonth": 9,
    "placements": [
      {"code": "COS10009", "category": "core", "year": 1, "term": 1},
      {"code": "COS10011", "category": "core", "year": 1, "term": 1},
      {"code": "COS10003", "category": "core", "year": 1, "term": 1},
      {"code": "TNE10006", "category": "core", "year": 1, "term": 1},
      {"code": "COS20007", "category": "major_core", "year": 1, "term": 2},
      {"code": "STA10003", "category": "major_core", "year": 1, "term": 2},
      {"code": "COS20015", "category": "core", "year": 1, "term": 2},
      {"code": "COS30008", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS30045", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS10022", "category": "major_core", "year": 2, "term": 1},
      {"code": "SWE20001", "category": "major_core", "year": 2, "term": 2},
      {"code": "COS30019", "category": "major_core", "year": 2, "term": 2},
      {"code": "SWE40001", "category": "core", "year": 3, "term": 1},
      {"code": "COS20028", "category": "major_core", "year": 3, "term": 1},
      {"code": "SWE40002", "category": "core", "year": 3, "term": 2},
      {"code": "ICT30005", "category": "core", "year": 3, "term": 2}
    ],
    "electiveSlots": [
      {"year": 1, "term": 2},
      {"year": 2, "term": 1},
      {"year": 2, "term": 2},
      {"year": 2, "term": 2},
      {"year": 3, "term": 1},
      {"year": 3, "term": 1},
      {"year": 3, "term": 2},
      {"year": 3, "term": 2}
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Internet of Things",
    "intakeYear": 2022,
    "intakeMonth": 9,
    "placements": [
      {"code": "COS10009", "category": "core", "year": 1, "term": 1},
      {"code": "COS10011", "category": "core", "year": 1, "term": 1},
      {"code": "COS10003", "category": "core", "year": 1, "term": 1},
      {"code": "TNE10006", "category": "core", "year": 1, "term": 1},
      {"code": "COS20007", "category": "major_core", "year": 1, "term": 2},
      {"code": "STA10003", "category": "major_core", "year": 1, "term": 2},
      {"code": "COS20015", "category": "core", "year": 1, "term": 2},
      {"code": "COS30017", "category": "major_core", "year": 2, "term": 1},
      {"code": "SWE20001", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS30015", "category": "major_core", "year": 2, "term": 1},
      {"code": "SWE30011", "category": "major_core", "year": 2, "term": 2},
      {"code": "COS20019", "category": "major_core", "year": 2, "term": 2},
      {"code": "SWE40001", "category": "core", "year": 3, "term": 1},
      {"code": "SWE30012", "category": "major_core", "year": 3, "term": 1},
      {"code": "SWE40002", "category": "core", "year": 3, "term": 2},
      {"code": "ICT30005", "category": "core", "year": 3, "term": 2}
    ],
    "electiveSlots": [
      {"year": 1, "term": 2},
      {"year": 2, "term": 1},
      {"year": 2, "term": 2},
      {"year": 2, "term": 2},
      {"year": 3, "term": 1},
      {"year": 3, "term": 1},
      {"year": 3, "term": 2},
      {"year": 3, "term": 2}
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Software Development",
    "intakeYear": 2022,
    "intakeMonth": 9,
    "placements": [
      {"code": "COS10009", "category": "core", "year": 1, "term": 1},
      {"code": "COS10011", "category": "core", "year": 1, "term": 1},
      {"code": "COS10003", "category": "core", "year": 1, "term": 1},
      {"code": "TNE10006", "category": "core", "year": 1, "term": 1},
      {"code": "COS20007", "category": "major_core", "year": 1, "term": 2},
      {"code": "COS20001", "category": "major_core", "year": 1, "term": 2},
      {"code": "COS20015", "category": "core", "year": 1, "term": 2},
      {"code": "COS30008", "category": "major_core", "year": 2, "term": 1},
      {"code": "SWE20001", "category": "major_core", "year": 2, "term": 1},
      {"code": "SWE30009", "category": "major_core", "year": 2, "term": 1},
      {"code": "SWE30011", "category": "major_core", "year": 2, "term": 2},
      {"code": "COS30017", "category": "major_core", "year": 2, "term": 2},
      {"code": "SWE40001", "category": "core", "year": 3, "term": 1},
      {"code": "COS30041", "category": "major_core", "year": 3, "term": 1},
      {"code": "SWE40002", "category": "core", "year": 3, "term": 2},
      {"code": "ICT30005", "category": "core", "year": 3, "term": 2}
    ],
    "electiveSlots": [
      {"year": 1, "term": 2},
      {"year": 2, "term": 1},
      {"year": 2, "term": 2},
      {"year": 2, "term": 2},
      {"year": 3, "term": 1},
      {"year": 3, "term": 1},
      {"year": 3, "term": 2},
      {"year": 3, "term": 2}
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Artificial Intelligence",
    "intakeYear": 2022,
    "intakeMonth": 2,
    "placements": [
      {"code": "COS10009", "category": "core", "year": 1, "term": 1},
      {"code": "COS10011", "category": "core", "year": 1, "term": 1},
      {"code": "COS10003", "category": "core", "year": 1, "term": 1},
      {"code": "TNE10006", "category": "core", "year": 1, "term": 1},
      {"code": "COS20007", "category": "major_core", "year": 1, "term": 2},
      {"code": "COS20001", "category": "major_core", "year": 1, "term": 2},
      {"code": "COS30018", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS30019", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS20015", "category": "core", "year": 2, "term": 1},
      {"code": "COS30008", "category": "major_core", "year": 2, "term": 2},
      {"code": "SWE20001", "category": "major_core", "year": 2, "term": 2},
      {"code": "COS30082", "category": "major_core", "year": 2, "term": 2},
      {"code": "SWE40001", "category": "core", "year": 3, "term": 1},
      {"code": "COS30081", "category": "major_core", "year": 3, "term": 1},
      {"code": "SWE40002", "category": "core", "year": 3, "term": 2},
      {"code": "ICT30005", "category": "core", "year": 3, "term": 2}
    ],
    "electiveSlots": [
      {"year": 1, "term": 2},
      {"year": 1, "term": 2},
      {"year": 2, "term": 1},
      {"year": 2, "term": 2},
      {"year": 3, "term": 1},
      {"year": 3, "term": 1},
      {"year": 3, "term": 2},
      {"year": 3, "term": 2}
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Cybersecurity",
    "intakeYear": 2022,
    "intakeMonth": 2,
    "placements": [
      {"code": "COS10009", "category": "core", "year": 1, "term": 1},
      {"code": "COS10011", "category": "core", "year": 1, "term": 1},
      {"code": "COS10003", "category": "core", "year": 1, "term": 1},
      {"code": "TNE10006", "category": "core", "year": 1, "term": 1},
      {"code": "COS20007", "category": "major_core", "year": 1, "term": 2},
      {"code": "COS30015", "category": "major_core", "year": 1, "term": 2},
      {"code": "TNE20002", "category": "major_core", "year": 2, "term": 1},
      {"code": "ICT30010", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS20015", "category": "core", "year": 2, "term": 1},
      {"code": "INF30020", "category": "major_core", "year": 2, "term": 2},
      {"code": "SWE20001", "category": "major_core", "year": 2, "term": 2},
      {"code": "TNE30009", "category": "major_core", "year": 2, "term": 2},
      {"code": "SWE40001", "category": "core", "year": 3, "term": 1},
      {"code": "TNE30012", "category": "major_core", "year": 3, "term": 1},
      {"code": "SWE40002", "category": "core", "year": 3, "term": 2},
      {"code": "ICT30005", "category": "core", "year": 3, "term": 2}
    ],
    "electiveSlots": [
      {"year": 1, "term": 2},
      {"year": 1, "term": 2},
      {"year": 2, "term": 1},
      {"year": 2, "term": 2},
      {"year": 3, "term": 1},
      {"year": 3, "term": 1},
      {"year": 3, "term": 2},
      {"year": 3, "term": 2}
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Data Science",
    "intakeYear": 2022,
    "intakeMonth": 2,
    "placements": [
      {"code": "COS10009", "category": "core", "year": 1, "term": 1},
      {"code": "COS10011", "category": "core", "year": 1, "term": 1},
      {"code": "COS10003", "category": "core", "year": 1, "term": 1},
      {"code": "TNE10006", "category": "core", "year": 1, "term": 1},
      {"code": "COS20007", "category": "major_core", "year": 1, "term": 2},
      {"code": "COS10022", "category": "major_core", "year": 1, "term": 2},
      {"code": "STA10003", "category": "major_core", "year": 2, "term": 1},
      {"code": "SWE20001", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS20015", "category": "core", "year": 2, "term": 1},
      {"code": "COS30008", "category": "major_core", "year": 2, "term": 2},
      {"code": "COS20028", "category": "major_core", "year": 2, "term": 2},
      {"code": "COS30045", "category": "major_core", "year": 2, "term": 2},
      {"code": "SWE40001", "category": "core", "year": 3, "term": 1},
      {"code": "ICT30005", "category": "core", "year": 3, "term": 1},
      {"code": "COS30019", "category": "major_core", "year": 3, "term": 1},
      {"code": "SWE40002", "category": "core", "year": 3, "term": 2}
    ],
    "electiveSlots": [
      {"year": 1, "term": 2},
      {"year": 1, "term": 2},
      {"year": 2, "term": 1},
      {"year": 2, "term": 2},
      {"year": 3, "term": 1},
      {"year": 3, "term": 2},
      {"year": 3, "term": 2},
      {"year": 3, "term": 2}
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Internet of Things",
    "intakeYear": 2022,
    "intakeMonth": 2,
    "placements": [
      {"code": "COS10009", "category": "core", "year": 1, "term": 1},
      {"code": "COS10011", "category": "core", "year": 1, "term": 1},
      {"code": "COS10003", "category": "core", "year": 1, "term": 1},
      {"code": "TNE10006", "category": "core", "year": 1, "term": 1},
      {"code": "COS20007", "category": "major_core", "year": 1, "term": 2},
      {"code": "COS30015", "category": "major_core", "year": 1, "term": 2},
      {"code": "STA10003", "category": "major_core", "year": 2, "term": 1},
      {"code": "SWE30011", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS20015", "category": "core", "year": 2, "term": 1},
      {"code": "COS30017", "category": "major_core", "year": 2, "term": 2},
      {"code": "SWE20001", "category": "major_core", "year": 2, "term": 2},
      {"code": "SWE40001", "category": "core", "year": 3, "term": 1},
      {"code": "COS20019", "category": "major_core", "year": 3, "term": 1},
      {"code": "SWE40002", "category": "core", "year": 3, "term": 2},
      {"code": "ICT30005", "category": "core", "year": 3, "term": 2},
      {"code": "SWE30012", "category": "major_core", "year": 3, "term": 2}
    ],
    "electiveSlots": [
      {"year": 1, "term": 2},
      {"year": 1, "term": 2},
      {"year": 2, "term": 1},
      {"year": 2, "term": 2},
      {"year": 2, "term": 2},
      {"year": 3, "term": 1},
      {"year": 3, "term": 1},
      {"year": 3, "term": 2}
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Software Development",
    "intakeYear": 2022,
    "intakeMonth": 2,
    "placements": [
      {"code": "COS10009", "category": "core", "year": 1, "term": 1},
      {"code": "COS10011", "category": "core", "year": 1, "term": 1},
      {"code": "COS10003", "category": "core", "year": 1, "term": 1},
      {"code": "TNE10006", "category": "core", "year": 1, "term": 1},
      {"code": "COS20007", "category": "major_core", "year": 1, "term": 2},
      {"code": "COS20001", "category": "major_core", "year": 1, "term": 2},
      {"code": "COS30017", "category": "major_core", "year": 2, "term": 1},
      {"code": "SWE20001", "category": "major_core", "year": 2, "term": 1},
      {"code": "COS20015", "category": "core", "year": 2, "term": 1},
      {"code": "COS30008", "category": "major_core", "year": 2, "term": 2},
      {"code": "COS30041", "category": "major_core", "year": 2, "term": 2},
      {"code": "SWE30009", "category": "major_core", "year": 2, "term": 2},
      {"code": "SWE40001", "category": "core", "year": 3, "term": 1},
      {"code": "ICT30005", "category": "core", "year": 3, "term": 1},
      {"code": "SWE30011", "category": "major_core", "year": 3, "term": 1},
      {"code": "SWE40002", "category": "core", "year": 3, "term": 2}
    ],
    "electiveSlots": [
      {"year": 1, "term": 2},
      {"year": 1, "term": 2},
      {"year": 2, "term": 1},
      {"year": 2, "term": 2},
      {"year": 3, "term": 1},
      {"year": 3, "term": 2},
      {"year": 3, "term": 2},
      {"year": 3, "term": 2}
    ]
  }
]

const SOURCE_ELECTIVE_GROUPS: SourceElectiveGroup[] = [
  {
    "courseCode": "BA-CS",
    "major": "Artificial Intelligence",
    "intakeYear": 2025,
    "intakeMonth": 3,
    "units": [
      "COS30045",
      "COS20083",
      "COS30008",
      "COS30043",
      "COS30020",
      "INF10024",
      "COS10022",
      "COS10082",
      "COS20028"
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Cybersecurity",
    "intakeYear": 2025,
    "intakeMonth": 3,
    "units": [
      "SWE30009",
      "COS30047",
      "COS30045",
      "COS30020",
      "TNE10005",
      "COS30018",
      "INF10024",
      "COS10022",
      "COS10082",
      "COS20083",
      "COS20028"
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Data Science",
    "intakeYear": 2025,
    "intakeMonth": 3,
    "units": [
      "COS20083",
      "COS10082",
      "COS30008",
      "COS30018",
      "INF10024",
      "COS30043",
      "COS30020",
      "COS30082"
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Internet of Things",
    "intakeYear": 2025,
    "intakeMonth": 3,
    "units": [
      "SWE30009",
      "COS30045",
      "COS20030",
      "TNE30009",
      "COS30018",
      "INF10024",
      "COS10022",
      "COS10082",
      "COS20083",
      "COS20028"
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Software Development",
    "intakeYear": 2025,
    "intakeMonth": 3,
    "units": [
      "COS30017",
      "COS30020",
      "COS20030",
      "COS30018",
      "INF10024",
      "SWE40006",
      "COS10022",
      "COS10082",
      "COS20083",
      "COS20028"
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Artificial Intelligence",
    "intakeYear": 2024,
    "intakeMonth": 9,
    "units": [
      "INF10024",
      "COS30045",
      "COS30015",
      "COS20083",
      "COS30008",
      "COS30043",
      "COS30020",
      "COS10022",
      "COS10082",
      "COS20028"
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Cybersecurity",
    "intakeYear": 2024,
    "intakeMonth": 9,
    "units": [
      "INF10024",
      "SWE30009",
      "COS30045",
      "COS30047",
      "COS30082",
      "COS30020",
      "COS10022",
      "COS10082",
      "COS20083",
      "COS20028"
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Data Science",
    "intakeYear": 2024,
    "intakeMonth": 9,
    "units": [
      "INF10024",
      "COS20083",
      "COS10082",
      "COS30008",
      "COS30018",
      "COS30043",
      "COS30015",
      "COS30020",
      "COS30082"
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Internet of Things",
    "intakeYear": 2024,
    "intakeMonth": 9,
    "units": [
      "INF10024",
      "SWE30009",
      "COS30045",
      "COS30015",
      "TNE30009",
      "COS30018",
      "COS10022",
      "COS10082",
      "COS20083",
      "COS20028"
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Software Development",
    "intakeYear": 2024,
    "intakeMonth": 9,
    "units": [
      "INF10024",
      "COS30017",
      "COS30020",
      "COS20030",
      "COS30018",
      "COS30082",
      "SWE40006",
      "COS10022",
      "COS10082",
      "COS20083",
      "COS20028"
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Artificial Intelligence",
    "intakeYear": 2024,
    "intakeMonth": 2,
    "units": [
      "COS30045",
      "COS20083",
      "COS30008",
      "COS30043",
      "COS30020",
      "INF10024",
      "COS10022",
      "COS10082",
      "COS20028"
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Cybersecurity",
    "intakeYear": 2024,
    "intakeMonth": 2,
    "units": [
      "SWE30009",
      "COS30045",
      "COS30020",
      "TNE10005",
      "COS30018",
      "INF10024",
      "COS10022",
      "COS10082",
      "COS20083",
      "COS20028"
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Data Science",
    "intakeYear": 2024,
    "intakeMonth": 2,
    "units": [
      "COS20083",
      "COS10082",
      "COS30008",
      "COS30018",
      "INF10024",
      "COS30043",
      "COS30020",
      "COS30082"
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Internet of Things",
    "intakeYear": 2024,
    "intakeMonth": 2,
    "units": [
      "SWE30009",
      "COS30045",
      "COS20030",
      "TNE30009",
      "COS30018",
      "INF10024",
      "COS10022",
      "COS10082",
      "COS20083",
      "COS20028"
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Software Development",
    "intakeYear": 2024,
    "intakeMonth": 2,
    "units": [
      "COS30017",
      "COS30020",
      "COS20030",
      "COS30018",
      "INF10024",
      "SWE40006",
      "COS10022",
      "COS10082",
      "COS20083",
      "COS20028"
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Artificial Intelligence",
    "intakeYear": 2023,
    "intakeMonth": 9,
    "units": [
      "COS30045",
      "COS20083",
      "COS30008",
      "COS30043",
      "COS30020",
      "COS20015",
      "COS10022",
      "COS10082",
      "COS20028"
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Cybersecurity",
    "intakeYear": 2023,
    "intakeMonth": 9,
    "units": [
      "SWE30009",
      "COS30045",
      "COS30020",
      "TNE10005",
      "COS30018",
      "COS20015",
      "COS10022",
      "COS10082",
      "COS20083",
      "COS20028"
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Data Science",
    "intakeYear": 2023,
    "intakeMonth": 9,
    "units": [
      "COS20083",
      "COS10082",
      "COS30008",
      "COS30018",
      "COS20015",
      "COS30043",
      "COS30020",
      "COS30082"
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Internet of Things",
    "intakeYear": 2023,
    "intakeMonth": 9,
    "units": [
      "SWE30009",
      "COS30045",
      "COS20030",
      "TNE30009",
      "COS30018",
      "COS20015",
      "COS10022",
      "COS10082",
      "COS20083",
      "COS20028"
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Software Development",
    "intakeYear": 2023,
    "intakeMonth": 9,
    "units": [
      "COS30017",
      "COS30020",
      "COS20030",
      "COS30018",
      "COS20015",
      "SWE40006",
      "COS10022",
      "COS10082",
      "COS20083",
      "COS20028"
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Artificial Intelligence",
    "intakeYear": 2023,
    "intakeMonth": 2,
    "units": [
      "COS30045",
      "COS20083",
      "COS30008",
      "COS30043",
      "COS30020",
      "COS20015",
      "COS10022",
      "COS10082",
      "COS20028"
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Cybersecurity",
    "intakeYear": 2023,
    "intakeMonth": 2,
    "units": [
      "SWE30009",
      "COS30045",
      "COS30020",
      "TNE10005",
      "COS30018",
      "COS20015",
      "COS10022",
      "COS10082",
      "COS20083",
      "COS20028"
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Data Science",
    "intakeYear": 2023,
    "intakeMonth": 2,
    "units": [
      "COS20083",
      "COS10082",
      "COS30008",
      "COS30018",
      "COS20015",
      "COS30043",
      "COS30020",
      "COS30082"
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Internet of Things",
    "intakeYear": 2023,
    "intakeMonth": 2,
    "units": [
      "SWE30009",
      "COS30045",
      "COS20030",
      "TNE30009",
      "COS30018",
      "COS20015",
      "COS10022",
      "COS10082",
      "COS20083",
      "COS20028"
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Software Development",
    "intakeYear": 2023,
    "intakeMonth": 2,
    "units": [
      "COS30017",
      "COS30020",
      "COS20030",
      "COS30018",
      "COS20015",
      "SWE40006",
      "COS10022",
      "COS10082",
      "COS20083",
      "COS20028"
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Artificial Intelligence",
    "intakeYear": 2022,
    "intakeMonth": 9,
    "units": [
      "COS30043",
      "COS10004",
      "SWE30011",
      "COS20019",
      "COS30045",
      "COS10022",
      "COS10082",
      "COS20083",
      "COS20028"
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Cybersecurity",
    "intakeYear": 2022,
    "intakeMonth": 9,
    "units": [
      "COS30047",
      "COS10004",
      "COS20030",
      "COS20019",
      "COS30019",
      "COS10022",
      "COS10082",
      "COS20083",
      "COS20028"
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Data Science",
    "intakeYear": 2022,
    "intakeMonth": 9,
    "units": [
      "COS30043",
      "COS10082",
      "COS20083",
      "COS20019",
      "COS30082"
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Internet of Things",
    "intakeYear": 2022,
    "intakeMonth": 9,
    "units": [
      "COS30047",
      "COS10004",
      "COS20030",
      "TNE30009",
      "COS30019",
      "COS10022",
      "COS10082",
      "COS20083",
      "COS20028"
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Software Development",
    "intakeYear": 2022,
    "intakeMonth": 9,
    "units": [
      "COS30043",
      "COS10004",
      "COS20030",
      "COS20019",
      "COS30019",
      "COS10022",
      "COS10082",
      "COS20083",
      "COS20028"
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Artificial Intelligence",
    "intakeYear": 2022,
    "intakeMonth": 2,
    "units": [
      "COS30043",
      "COS10004",
      "SWE30011",
      "COS20019",
      "COS30045",
      "COS10022",
      "COS10082",
      "COS20083",
      "COS20028"
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Cybersecurity",
    "intakeYear": 2022,
    "intakeMonth": 2,
    "units": [
      "COS30047",
      "COS10004",
      "COS20030",
      "COS20019",
      "COS30019",
      "COS10022",
      "COS10082",
      "COS20083",
      "COS20028"
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Data Science",
    "intakeYear": 2022,
    "intakeMonth": 2,
    "units": [
      "COS30043",
      "COS10082",
      "COS20083",
      "COS20019",
      "COS30082"
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Internet of Things",
    "intakeYear": 2022,
    "intakeMonth": 2,
    "units": [
      "COS30047",
      "COS10004",
      "COS20030",
      "TNE30009",
      "COS30019",
      "COS10022",
      "COS10082",
      "COS20083",
      "COS20028"
    ]
  },
  {
    "courseCode": "BA-CS",
    "major": "Software Development",
    "intakeYear": 2022,
    "intakeMonth": 2,
    "units": [
      "COS30043",
      "COS10004",
      "COS20030",
      "COS20019",
      "COS30019",
      "COS10022",
      "COS10082",
      "COS20083",
      "COS20028"
    ]
  }
]

const SOURCE_SIMPLE_REQUISITES = {
  "prerequisite": [
    [
      "COS20007",
      "COS10009"
    ],
    [
      "COS20015",
      "COS10009"
    ],
    [
      "COS20030",
      "TNE10006"
    ],
    [
      "COS30008",
      "COS20007"
    ],
    [
      "COS30017",
      "COS20007"
    ],
    [
      "COS30018",
      "COS20007"
    ],
    [
      "COS30019",
      "COS20007"
    ],
    [
      "COS30045",
      "COS10009"
    ],
    [
      "COS30047",
      "TNE30009"
    ],
    [
      "COS40006",
      "COS40005"
    ],
    [
      "COS40003",
      "COS20007"
    ],
    [
      "ICT30010",
      "TNE10006"
    ],
    [
      "SWE20001",
      "COS20007"
    ],
    [
      "SWE30009",
      "COS20007"
    ],
    [
      "SWE40001",
      "COS20007"
    ],
    [
      "SWE40002",
      "SWE40001"
    ],
    [
      "TNE20002",
      "TNE10006"
    ],
    [
      "TNE30009",
      "TNE10006"
    ],
    [
      "TNE30012",
      "TNE20002"
    ]
  ],
  "corequisite": [
    [
      "COS10011",
      "COS10009"
    ],
    [
      "COS10004",
      "COS10009"
    ]
  ],
  "antirequisite": [
    [
      "COS10026",
      "COS10011"
    ]
  ]
} as Record<
  'prerequisite' | 'corequisite' | 'antirequisite',
  [string, string][]
>

const UNSUPPORTED_COMPLEX_REQUISITES = {
  creditPointRules: 3,
  andGroups: 9,
  orGroups: 4,
  mixedGroups: 5,
}

const STUDENT_DEFAULT_CREDIT_POINTS = 12.5

// The main seed stores academic terms, while the current Student schema stores calendar months; 3/4 use the existing interim mapping until the schema changes.
const STUDENT_TERM_TO_MONTH: Record<number, number> = {
  1: 3,
  2: 8,
  3: 6,
  4: 11,
}

function plannerKey(courseCode: string, major: string, intakeYear: number, intakeMonth: number) {
  return [courseCode, major, intakeYear, intakeMonth].join('|')
}

function termLabel(term: number) {
  if (term === 3) return 'Summer Term'
  if (term === 4) return 'Winter Term'
  return `Semester ${term}`
}

function sourceElectiveGroupFor(planner: SourcePlanner) {
  return SOURCE_ELECTIVE_GROUPS.find(group =>
    plannerKey(group.courseCode, group.major, group.intakeYear, group.intakeMonth) ===
    plannerKey(planner.courseCode, planner.major, planner.intakeYear, planner.intakeMonth),
  )
}

function studentAvailabilityMonths(offeredIn: number[]) {
  return [...new Set(offeredIn.map(term => STUDENT_TERM_TO_MONTH[term]).filter(Boolean))]
}

function compatibilityYearLevel(unit: SourceUnit) {
  // Unit year level is placement-specific in the main schema; use the lowest source placement only because the current Student Unit model requires one.
  return unit.compatibilityYearLevel ?? 1
}

function validateSourceData() {
  const unitCodes = new Set<string>()
  for (const unit of SOURCE_UNITS) {
    if (unitCodes.has(unit.code)) throw new Error(`Duplicate source unit code: ${unit.code}`)
    unitCodes.add(unit.code)
  }

  const plannerKeys = new Set<string>()
  for (const planner of SOURCE_PLANNERS) {
    if (planner.courseCode !== SOURCE_COURSE.code) {
      throw new Error(`Unknown planner course: ${planner.courseCode}`)
    }
    if (!SOURCE_MAJORS.includes(planner.major as typeof SOURCE_MAJORS[number])) {
      throw new Error(`Unknown planner major: ${planner.major}`)
    }

    const key = plannerKey(planner.courseCode, planner.major, planner.intakeYear, planner.intakeMonth)
    if (plannerKeys.has(key)) throw new Error(`Duplicate planner key: ${key}`)
    plannerKeys.add(key)

    for (const placement of planner.placements) {
      if (!unitCodes.has(placement.code)) {
        throw new Error(`Planner ${key} references unknown unit ${placement.code}`)
      }
    }

    for (const slot of planner.electiveSlots) {
      if (![1, 2, 3, 4].includes(slot.term)) {
        throw new Error(`Planner ${key} has unknown term ${slot.term}`)
      }
    }
  }

  for (const group of SOURCE_ELECTIVE_GROUPS) {
    const key = plannerKey(group.courseCode, group.major, group.intakeYear, group.intakeMonth)
    if (!plannerKeys.has(key)) throw new Error(`Elective group has no planner: ${key}`)
    for (const code of group.units) {
      if (!unitCodes.has(code)) throw new Error(`Elective group ${key} references unknown unit ${code}`)
    }
  }

  for (const [type, pairs] of Object.entries(SOURCE_SIMPLE_REQUISITES)) {
    for (const [unitCode, requisiteCode] of pairs) {
      if (!unitCodes.has(unitCode) || !unitCodes.has(requisiteCode)) {
        throw new Error(`Invalid ${type} requisite: ${unitCode} -> ${requisiteCode}`)
      }
    }
  }

  const unsupportedCount = Object.values(UNSUPPORTED_COMPLEX_REQUISITES)
    .reduce((sum, count) => sum + count, 0)
  console.warn(
    `Main-seed complex requisite rules not represented by current Student schema: ${unsupportedCount}`,
    UNSUPPORTED_COMPLEX_REQUISITES,
  )
}


// -----------------------------------------------------------------------------
// CMS user
// -----------------------------------------------------------------------------

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

// -----------------------------------------------------------------------------
// Academic content
// -----------------------------------------------------------------------------

async function createAcademicContent() {
  validateSourceData()

  if (await prisma.course.count() > 0) {
    console.log('Content already seeded, skipping.')
    return false
  }

  const unitMap = new Map<string, string>()
  for (const unit of SOURCE_UNITS) {
    const created = await prisma.unit.create({
      data: {
        code: unit.code,
        name: unit.name,
        // The main seed has no per-unit credit-point field.
        credit_points: STUDENT_DEFAULT_CREDIT_POINTS,
        year_level: compatibilityYearLevel(unit),
        availability: {
          create: studentAvailabilityMonths(unit.offeredIn).map(month => ({ month })),
        },
      },
    })
    unitMap.set(unit.code, created.id)
  }

  const course = await prisma.course.create({ data: SOURCE_COURSE })
  const majorMap = new Map<string, string>()
  for (const major of SOURCE_MAJORS) {
    const created = await prisma.major.create({
      data: { course_id: course.id, name: major },
    })
    majorMap.set(major, created.id)
  }

  let semesterCount = 0
  let semesterUnitCount = 0
  let electivePoolCount = 0

  for (const planner of SOURCE_PLANNERS) {
    const majorId = majorMap.get(planner.major)
    if (!majorId) throw new Error(`Missing major for planner: ${planner.major}`)

    const createdPlanner = await prisma.plannerTemplate.create({
      data: {
        course_id: course.id,
        major_id: majorId,
        intake_month: planner.intakeMonth,
        intake_year: planner.intakeYear,
        // Main templates represent a three-year/six-semester degree.
        duration_years: 3,
      },
    })

    const bySemester = new Map<string, SourcePlacement[]>()
    for (const placement of planner.placements) {
      const key = `${placement.year}|${placement.term}`
      const items = bySemester.get(key) ?? []
      items.push(placement)
      bySemester.set(key, items)
    }
    for (const slot of planner.electiveSlots) {
      const key = `${slot.year}|${slot.term}`
      const items = bySemester.get(key) ?? []
      items.push({ code: '', category: 'elective', year: slot.year, term: slot.term })
      bySemester.set(key, items)
    }

    for (const [key, items] of [...bySemester.entries()].sort(([a], [b]) => {
      const [ay, at] = a.split('|').map(Number)
      const [by, bt] = b.split('|').map(Number)
      return ay - by || at - bt
    })) {
      const [year, term] = key.split('|').map(Number)
      const semester = await prisma.semester.create({
        data: {
          template_id: createdPlanner.id,
          year_number: year,
          sem_number: term,
          label: termLabel(term),
        },
      })
      semesterCount += 1

      await prisma.semesterUnit.createMany({
        data: items.map((item, index) => ({
          semester_id: semester.id,
          unit_id: item.code ? unitMap.get(item.code) ?? null : null,
          category: item.category,
          is_elective_slot: !item.code,
          position: index + 1,
        })),
      })
      semesterUnitCount += items.length
    }

    const group = sourceElectiveGroupFor(planner)
    if (group) {
      const poolRows = [...new Set(group.units)].map(code => ({
        template_id: createdPlanner.id,
        unit_id: unitMap.get(code)!,
      }))
      await prisma.electivePoolUnit.createMany({ data: poolRows })
      electivePoolCount += poolRows.length
    }
  }

  const requisiteRows = Object.entries(SOURCE_SIMPLE_REQUISITES).flatMap(([requisite_type, pairs]) =>
    pairs.map(([unitCode, requisiteCode]) => ({
      unit_id: unitMap.get(unitCode)!,
      requisite_type: requisite_type as 'prerequisite' | 'corequisite' | 'antirequisite',
      requisite_unit_id: unitMap.get(requisiteCode)!,
    })),
  )
  await prisma.unitRequisite.createMany({ data: requisiteRows })

  console.log(`Created ${SOURCE_UNITS.length} source units`)
  console.log(`Created ${SOURCE_MAJORS.length} source majors`)
  console.log(`Created ${SOURCE_PLANNERS.length} source planner templates`)
  console.log(`Created ${semesterCount} semesters and ${semesterUnitCount} semester placements`)
  console.log(`Created ${electivePoolCount} direct elective-pool memberships`)
  console.log(`Created ${SOURCE_SIMPLE_REQUISITES.prerequisite.length} simple prerequisites`)
  console.log(`Created ${SOURCE_SIMPLE_REQUISITES.corequisite.length} simple corequisites`)
  console.log(`Created ${SOURCE_SIMPLE_REQUISITES.antirequisite.length} simple antirequisites`)
  return true
}

// -----------------------------------------------------------------------------
// Help content
// -----------------------------------------------------------------------------

async function seedHelpContent() {
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
      answer: 'WIL (ICT20016) is a mandatory industry placement unit typically completed in your final year. It provides real-world work experience relevant to your degree. Enrolment requires approval and is coordinated through the WIL office.',
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
      location: 'A001 - A002',
      hours: 'Mon - Fri, 9:00 am - 5:00 pm',
      closed_note: 'Closed on weekends and public holidays',
    },
  })

  await prisma.itHelpDesk.create({
    data: {
      telephone: '+6082 255000',
      email: 'servicedesk@swinburne.edu.my',
      location: 'G003',
      hours_mon_thu: '8:30 am - 5:30 pm',
      hours_fri: '8:30 am - 12:00 pm, 2:00 pm - 5:30 pm',
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

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

async function main() {
  await seedCmsUser()
  const academicSeeded = await createAcademicContent()
  if (academicSeeded) await seedHelpContent()
}

main().catch(console.error).finally(() => prisma.$disconnect())
