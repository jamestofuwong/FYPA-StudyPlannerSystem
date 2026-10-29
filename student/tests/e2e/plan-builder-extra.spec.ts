import { test, expect } from './helpers/fixtures'

test('generated plan respects prerequisites, offering semesters and completed-unit uniqueness', async ({ page, db }) => {
  const course = (await db.query("INSERT INTO courses (name,code,updated_at) VALUES ('E2E Sequence Degree','E2E-SEQUENCE',now()) RETURNING id")).rows[0].id
  const major = (await db.query("INSERT INTO majors (course_id,name,updated_at) VALUES ($1,'E2E Sequence',now()) RETURNING id", [course])).rows[0].id
  const planner = (await db.query('INSERT INTO planner_templates (course_id,major_id,intake_year,intake_month,duration_semesters,updated_at) VALUES ($1,$2,2026,9,6,now()) RETURNING id', [course, major])).rows[0].id
  const ids: string[] = []
  for (let n = 1; n <= 3; n++) {
    const id = (await db.query('INSERT INTO units (unit_code,unit_name,credit_points,year_level,updated_at) VALUES ($1,$2,12.5,1,now()) RETURNING id', [`TST9100${n}`, `Sequence Unit ${n}`])).rows[0].id
    ids.push(id)
    await db.query("INSERT INTO template_units (planner_template_id,unit_id,category,year_level,semester,updated_at) VALUES ($1,$2,'core',1,1,now())", [planner, id])
    // The shared schema stores teaching terms (1/2), not calendar month numbers.
    for (const term of n === 1 ? [1, 2] : n === 2 ? [2] : [1]) await db.query('INSERT INTO unit_offerings (unit_id,offered_in,updated_at) VALUES ($1,$2,now())', [id, term])
    if (n > 1) {
      const group = (await db.query('INSERT INTO unit_requisite_groups (unit_id) VALUES ($1) RETURNING id', [id])).rows[0].id
      await db.query("INSERT INTO unit_requisite_conditions (group_id,type,unit_id,requisite_type) VALUES ($1,'unit',$2,'prerequisite')", [group, ids[n - 2]])
    }
  }
  try {
    await page.goto('/plan-builder')
    await page.getByLabel('Course', { exact: true }).selectOption({ label: 'E2E Sequence Degree' })
    await page.getByLabel('Major', { exact: true }).selectOption({ label: 'E2E Sequence' })
    await page.getByLabel('Intake Month').selectOption('9')
    const response = page.waitForResponse(r => r.url().endsWith('/api/generate-plan') && r.request().method() === 'POST')
    await page.getByRole('button', { name: 'Generate Study Plan' }).click()
    const result = await (await response).json()
    const placements = result.semesters.flatMap((s: any) => s.units.map((u: any) => ({ code: u.code, year: s.year, semester: s.semester })))
    expect(placements.map((p: any) => p.code).sort()).toEqual(['TST91001', 'TST91002', 'TST91003'])
    const position = (code: string) => placements.find((p: any) => p.code === code)!
    const index = (p: any) => (p.year - 1) * 2 + p.semester
    expect(index(position('TST91001'))).toBeLessThan(index(position('TST91002')))
    expect(index(position('TST91002'))).toBeLessThan(index(position('TST91003')))
    // September intake: odd progression semesters are calendar semester 2.
    expect(position('TST91002').semester % 2).toBe(1)
    expect(position('TST91003').semester % 2).toBe(0)
    for (const semester of result.semesters) expect(semester.units.length).toBeLessThanOrEqual(4)
    await expect(page.getByRole('heading', { name: 'Your Study Plan' })).toBeVisible()
    await page.getByRole('button', { name: '+ Add unit', exact: true }).click()
    await page.getByRole('searchbox', { name: 'Filter units to add' }).fill('TST91001')
    await page.getByRole('option').filter({ hasText: 'TST91001' }).click()
    const secondResponse = page.waitForResponse(r => r.url().endsWith('/api/generate-plan') && r.request().method() === 'POST')
    await page.getByRole('button', { name: 'Generate Study Plan' }).click()
    const second = await (await secondResponse).json()
    expect(second.completedCodes).toEqual(['TST91001'])
    expect(second.semesters.flatMap((s: any) => s.units).filter((u: any) => u.code === 'TST91001')).toHaveLength(1)
  } finally {
    await db.query('DELETE FROM planner_templates WHERE id=$1', [planner])
    await db.query('DELETE FROM units WHERE id=ANY($1::uuid[])', [ids])
    await db.query('DELETE FROM majors WHERE id=$1', [major])
    await db.query('DELETE FROM courses WHERE id=$1', [course])
  }
})

test('generation API rejects invalid input and returns not-found for an unknown template', async ({ request, db }) => {
  const unknown = '00000000-0000-4000-8000-000000000000'
  for (const data of [ {}, { config: { plannerId: unknown }, completedSemesters: 'invalid' },
    { config: { plannerId: unknown, intakeMonth: 13 }, completedSemesters: [] } ]) {
    expect((await request.post('/api/generate-plan', { data })).status()).toBe(400)
  }
  expect((await request.post('/api/generate-plan', { data: { config: { plannerId: unknown, intakeMonth: 9, intakeYear: 2026 }, completedSemesters: [] } })).status()).toBe(404)
})
