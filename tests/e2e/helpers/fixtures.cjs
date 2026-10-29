const XLSX = require('xlsx-js-style');
const { jsPDF } = require('jspdf');
const { autoTable } = require('jspdf-autotable');

function planner(major = 'E2E Software', courseCode = 'E2E-CS', year = 2024) {
  const unit = (code, category) => ({ unit_code: code, unit_name: `Synthetic ${code}`, category,
    year_level: code.startsWith('COS1') ? 1 : 2, semester: 1, offered_in: [1, 2], prerequisite: null });
  const core = ['COS10001', 'COS10002', 'COS10003', 'COS10004'].map(c => unit(c, 'core'));
  const majorUnits = (major === 'E2E Software'
    ? ['COS20001', 'COS20002', 'COS20003', 'COS20004', 'COS30002']
    : ['SWE20001', 'SWE20002', 'SWE20003', 'SWE20004', 'SWE30002']).map(c => unit(c, 'major_core'));
  return { file_name: 'synthetic-planner.pdf', course_information: {
    course: 'Bachelor of Computer Science', course_code: courseCode, major,
    intake: 'February', intake_year: year, course_type: 'degree', duration_semesters: 6,
    requirements: { core: { count: 4, cp: 50 }, major: { count: 5, cp: 63 },
      elective: { count: 0, cp: 0 }, wil: { count: 0, cp: 0 } },
  }, categories: { core_units: core, major_units: majorUnits, mpu_group: [],
    elective_groups: { prescribed_elective: [], elective: [] }, wil_group: [] } };
}

function transcript(bulk = false) {
  const codes = ['COS10001', 'COS10002', 'COS10003', 'COS10004', 'COS20001', 'COS20002', 'COS20003', 'COS20004'];
  const headers = ['Course', 'Course Title', 'Credits', 'Earned', 'Status', 'Grade', 'Term'];
  const rows = codes.map(code => [code, `Synthetic ${code}`, 12.5, 12.5, 'Complete', 'HD', '2024_FEB_S1']);
  const data = bulk ? [['Student ID', ...headers], ...['900000001', '900000002'].flatMap(id => rows.map(r => [id, ...r]))] : [headers, ...rows];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), 'DPA');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function plannerPdf() {
  const doc = new jsPDF();
  doc.setFontSize(10);
  doc.text(['Bachelor of Computer Science - Synthetic Extraction BA-CS', 'Semester 1 | 2025',
    '2 Core Units (25 credit points)', '0 Major Units (0 credit points)',
    '0 Elective Units (0 credit points)', 'Year 1', 'Semester 1'], 12, 16);
  autoTable(doc, { startY: 53, theme: 'grid', bodyStyles: { fillColor: [198, 217, 241] },
    alternateRowStyles: { fillColor: [198, 217, 241] }, head: [['Unit Code', 'Unit Name', 'Prerequisite', 'Offered in']],
    body: [['TST10001', 'Synthetic Foundations', 'Nil', 'Semester 1 & 2'],
      ['TST10002', 'Synthetic Applications', 'Nil', 'Semester 1 & 2']] });
  return Buffer.from(doc.output('arraybuffer'));
}
module.exports = { planner, transcript, plannerPdf };
