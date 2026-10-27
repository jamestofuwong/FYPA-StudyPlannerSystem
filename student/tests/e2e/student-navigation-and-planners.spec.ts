import { expect, test, type Page } from '@playwright/test'

const TARGET = {
  course: 'Bachelor of Computer Science',
  major: 'Artificial Intelligence',
  year: '2026',
  intake: 'September 2026',
}

async function configureArtificialIntelligencePlan(page: Page) {
  await page.getByLabel('Course').selectOption({ label: TARGET.course })
  await page.getByLabel('Major', { exact: true }).selectOption({ label: TARGET.major })
}

test.describe('student app navigation', () => {
  test('navigates between planners, units, plan builder, and help', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: 'Study Planners' })).toBeVisible()

    const destinations = [
      { link: 'Units', path: '/units', heading: 'Units' },
      { link: 'Plan Builder', path: '/plan-builder', heading: 'Plan Builder' },
      { link: 'Help', path: '/help', heading: 'Help & Support' },
      { link: 'Planners', path: '/', heading: 'Study Planners' },
    ]

    for (const destination of destinations) {
      await page.getByRole('link', { name: destination.link, exact: true }).click()
      await expect(page).toHaveURL(
        new RegExp(`${destination.path === '/' ? '/$' : `${destination.path}$`}`),
        { timeout: 15_000 },
      )
      await expect(page.getByRole('heading', { level: 1, name: destination.heading })).toBeVisible()
      await expect(page.getByRole('link', { name: destination.link, exact: true })).toHaveAttribute('aria-current', 'page')
    }
  })
})

test.describe('units page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/units')
    await expect(page.getByRole('heading', { level: 1, name: 'Units' })).toBeVisible()
  })

  test('searches by unit code, filters by year level, and clears an empty result', async ({ page }) => {
    const search = page.getByRole('searchbox', { name: 'Search units' })
    const yearFilters = page.getByRole('group', { name: 'Filter by year level' })

    await search.fill('COS30019')
    await expect(page.getByText('3 units found')).toBeVisible()
    await expect(page.getByRole('link', { name: /View Introduction to Artificial Intelligence/i })).toBeVisible()

    await yearFilters.getByRole('button', { name: 'Year 1' }).click()
    await expect(page.getByText('0 units found')).toBeVisible()
    await expect(page.getByText('No units found')).toBeVisible()

    await page.getByRole('button', { name: 'Clear filters' }).click()
    await expect(search).toHaveValue('')
    await expect(page.getByText(/\d+ units available/)).toBeVisible()
    await expect(yearFilters.getByRole('button', { name: 'All' })).toBeVisible()
  })

  test('moves through the catalogue with numbered, next, and previous navigation', async ({ page }) => {
    const rows = page.locator('tbody tr')
    const firstPageCode = (await rows.first().getByRole('cell').first().textContent())?.trim()

    await expect(page.getByRole('button', { name: 'Previous page' })).toBeDisabled()
    await page.getByRole('button', { name: 'Next page' }).click()
    await expect(page.getByRole('button', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page')
    await expect(rows.first().getByRole('cell').first()).not.toHaveText(firstPageCode ?? '')

    await page.getByRole('button', { name: 'Page 1' }).click()
    await expect(rows.first().getByRole('cell').first()).toHaveText(firstPageCode ?? '')

    await page.getByRole('button', { name: 'Next page' }).click()
    await page.getByRole('button', { name: 'Previous page' }).click()
    await expect(page.getByRole('button', { name: 'Page 1' })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('button', { name: 'Previous page' })).toBeDisabled()
  })

  test('opens a unit with the keyboard, follows its prerequisite, and returns to the catalogue', async ({ page }) => {
    await page.getByRole('searchbox', { name: 'Search units' }).fill('COS30019')
    const unitRow = page.getByRole('link', { name: 'View Introduction to Artificial Intelligence' })
    await unitRow.focus()
    await unitRow.press('Enter')

    await expect(page).toHaveURL(/\/units\/COS30019$/, { timeout: 15_000 })
    await expect(page.getByRole('heading', { level: 1, name: 'Introduction to Artificial Intelligence' })).toBeVisible()
    await expect(page.getByText('COS30019', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('12.5 cp', { exact: true }).first()).toBeVisible()
    await expect(page.getByText(/Unit Offer: Semester 1 & 2/)).toBeVisible()
    await expect(page.getByRole('heading', { level: 3, name: 'Requisites' })).toBeVisible()

    await page.getByRole('link', { name: 'COS20007', exact: true }).click()
    await expect(page).toHaveURL(/\/units\/COS20007$/, { timeout: 15_000 })
    await expect(page.getByRole('heading', { level: 1, name: 'Object-oriented Programming' })).toBeVisible()

    await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Units' }).click()
    await expect(page).toHaveURL(/\/units$/)
  })

  test('shows not-found recovery links for an unknown unit', async ({ page }) => {
    await page.goto('/units/NOT-A-UNIT')
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible()
    const helpfulPages = page.getByRole('navigation', { name: 'Helpful pages' })
    await expect(helpfulPages.getByRole('link')).toHaveCount(4)
    await helpfulPages.getByRole('link', { name: 'Units', exact: true }).click()
    await expect(page).toHaveURL(/\/units$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Units' })).toBeVisible()
  })
})

test.describe('plan builder', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/plan-builder')
    await page.evaluate(() => sessionStorage.clear())
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'Plan Builder' })).toBeVisible()
    await page.waitForFunction(() => sessionStorage.getItem('plan-builder-draft') !== null)
  })

  test('configures a course, majors, intake, completed units, and semester controls', async ({ page }) => {
    const course = page.getByLabel('Course')
    const major = page.getByLabel('Major', { exact: true })
    const secondMajor = page.getByLabel('Second Major')

    await expect(major).toBeDisabled()
    await course.selectOption({ label: TARGET.course })
    await major.selectOption({ label: TARGET.major })
    await secondMajor.selectOption({ label: 'Data Science' })
    await page.getByLabel('Intake Month').selectOption({ label: 'September' })
    await page.getByLabel('Intake Year').fill('2025')

    await page.getByRole('button', { name: '+ Add Semester' }).click()
    await expect(page.getByText('Semester 2', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Remove Semester 2' }).click()
    await expect(page.getByText('Semester 2', { exact: true })).toHaveCount(0)

    await page.getByRole('button', { name: '+ Add unit' }).click()
    const unitSearch = page.getByRole('searchbox', { name: 'Filter units to add' })
    await unitSearch.fill('COS30019')
    const prerequisiteUnit = page.getByRole('option').filter({ hasText: 'COS30019' })
    await expect(prerequisiteUnit).toHaveCount(1)
    await expect(prerequisiteUnit).toHaveAttribute('aria-disabled', 'true')
    await expect(prerequisiteUnit).toContainText('Required:')

    await unitSearch.fill('COS10009')
    const eligibleUnit = page.getByRole('option').filter({ hasText: 'COS10009' })
    await expect(eligibleUnit).toHaveCount(1)
    await expect(eligibleUnit).toHaveAttribute('aria-disabled', 'false')
    await eligibleUnit.click()
    await expect(page.getByText('COS10009', { exact: true })).toBeVisible()
    await expect(page.getByText('1 unit marked as completed')).toBeVisible()

    await page.getByRole('button', { name: 'Remove COS10009' }).click()
    await expect(page.getByText('COS10009', { exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: '+ Add unit' }).click()
    await page.getByRole('searchbox', { name: 'Filter units to add' }).fill('COS10009')
    await page.getByRole('option').filter({ hasText: 'COS10009' }).click()

    await page.getByRole('button', { name: 'Generate Study Plan' }).click()
    await expect(page.getByRole('heading', { level: 2, name: 'Your Study Plan' })).toBeVisible({ timeout: 15_000 })
    const generatedPlan = page.locator('#generated-plan')
    await expect(generatedPlan.getByText('September 2025', { exact: true })).toBeVisible()
    await expect(generatedPlan.getByText(TARGET.course, { exact: true })).toBeVisible()
    await expect(generatedPlan.getByText(TARGET.major, { exact: true })).toBeVisible()
    await expect(generatedPlan.getByText('Data Science', { exact: true })).toBeVisible()

    const completedRow = generatedPlan
      .getByRole('link', { name: 'View Introduction to Programming', exact: true })
      .locator('xpath=ancestor::tr')
    await expect(completedRow).toContainText('Completed')
    await expect(generatedPlan.getByRole('list', { name: 'Unit categories' })).toContainText('Major')
    await expect(generatedPlan.getByText('(AI)', { exact: true }).first()).toBeVisible()
  })

  test('unlocks prerequisite-dependent units only in later completed semesters', async ({ page }) => {
    await configureArtificialIntelligencePlan(page)

    const semesterOne = page.getByText('Semester 1', { exact: true }).locator('../..')
    await semesterOne.getByRole('button', { name: '+ Add unit' }).click()
    await semesterOne.getByRole('searchbox', { name: 'Filter units to add' }).fill('COS10009')
    await semesterOne.getByRole('option').filter({ hasText: 'COS10009' }).click()

    await semesterOne.getByRole('button', { name: '+ Add unit' }).click()
    await semesterOne.getByRole('searchbox', { name: 'Filter units to add' }).fill('COS20007')
    await expect(semesterOne.getByRole('option').filter({ hasText: 'COS20007' })).toHaveAttribute('aria-disabled', 'true')
    await semesterOne.getByRole('searchbox', { name: 'Filter units to add' }).press('Escape')

    await page.getByRole('button', { name: '+ Add Semester' }).click()
    const semesterTwo = page.getByText('Semester 2', { exact: true }).locator('../..')
    await semesterTwo.getByRole('button', { name: '+ Add unit' }).click()
    await semesterTwo.getByRole('searchbox', { name: 'Filter units to add' }).fill('COS20007')
    const objectOrientedProgramming = semesterTwo.getByRole('option').filter({ hasText: 'COS20007' })
    await expect(objectOrientedProgramming).toHaveAttribute('aria-disabled', 'false')
    await objectOrientedProgramming.click()

    await page.getByRole('button', { name: '+ Add Semester' }).click()
    const semesterThree = page.getByText('Semester 3', { exact: true }).locator('../..')
    await semesterThree.getByRole('button', { name: '+ Add unit' }).click()
    await semesterThree.getByRole('searchbox', { name: 'Filter units to add' }).fill('COS30019')
    await expect(semesterThree.getByRole('option').filter({ hasText: 'COS30019' })).toHaveAttribute('aria-disabled', 'false')
  })

  test('restores its draft and generated plan after a reload', async ({ page }) => {
    await configureArtificialIntelligencePlan(page)
    await page.getByLabel('Second Major').selectOption({ label: 'Data Science' })
    await page.getByLabel('Intake Month').selectOption({ label: 'September' })
    await page.getByLabel('Intake Year').fill('2025')
    await page.getByRole('button', { name: '+ Add unit' }).click()
    await page.getByRole('searchbox', { name: 'Filter units to add' }).fill('COS10009')
    await page.getByRole('option').filter({ hasText: 'COS10009' }).click()
    await page.getByRole('button', { name: 'Generate Study Plan' }).click()
    await expect(page.getByRole('heading', { level: 2, name: 'Your Study Plan' })).toBeVisible({ timeout: 15_000 })

    let generationRequests = 0
    page.on('request', request => {
      if (request.url().includes('/api/generate-plan')) generationRequests++
    })
    await page.reload()

    await expect(page.getByLabel('Course')).toHaveValue(/.+/)
    await expect(page.getByLabel('Major', { exact: true })).toHaveValue(/.+/)
    await expect(page.getByLabel('Second Major')).toHaveValue(/.+/)
    await expect(page.getByLabel('Intake Month')).toHaveValue('9')
    await expect(page.getByLabel('Intake Year')).toHaveValue('2025')
    await expect(page.getByText('COS10009', { exact: true }).first()).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'Your Study Plan' })).toBeVisible()
    expect(generationRequests).toBe(0)
  })

  test('handles missing templates and server failures without leaving generation stuck', async ({ page }) => {
    const generateButton = page.getByRole('button', { name: 'Generate Study Plan' })
    await expect(generateButton).toBeDisabled()
    await configureArtificialIntelligencePlan(page)
    await expect(generateButton).toBeEnabled()

    await page.route('**/api/generate-plan', route => route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'No plan template found' }),
    }))
    await generateButton.click()
    await expect(page.getByRole('alert').filter({ hasText: 'No plan template found' })).toHaveText('No plan template found for the selected configuration. Try a different course or major.')
    await expect(generateButton).toBeEnabled()

    await page.unroute('**/api/generate-plan')
    await page.route('**/api/generate-plan', route => route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Internal server error' }),
    }))
    await generateButton.click()
    await expect(page.getByRole('alert').filter({ hasText: 'An error occurred' })).toHaveText('An error occurred while generating the plan. Please try again.')
    await expect(generateButton).toBeEnabled()
  })
})

test.describe('help pages', () => {
  const faqs = [
    {
      question: 'How do I find the right study plan for my course?',
      answer: 'Use the Study Planners page to search by course name or major. Each plan shows a full semester-by-semester breakdown of required units. You can also use the Plan Builder to generate a personalised plan based on your intake and completed units.',
    },
    {
      question: 'Can I take units out of sequence?',
      answer: 'Units must generally be taken in the order shown in your study plan. Prerequisites must be completed before you can enrol in a unit. Contact your Head of Department if you believe you have equivalent prior learning.',
    },
    {
      question: 'What is a Prescribed Elective?',
      answer: 'Prescribed electives are units approved for your course and major. Unlike free electives, you must choose from the list of prescribed electives set by your faculty. Your study plan will list the options available to you.',
    },
    {
      question: 'What is Work Integrated Learning (WIL)?',
      answer: 'WIL (ICT20016) is a mandatory industry placement unit typically completed in your final year. It provides real-world work experience relevant to your degree. Enrolment requires approval and is coordinated through the WIL office.',
    },
    {
      question: 'How do I apply for a unit exemption or credit transfer?',
      answer: 'Submit a Credit Transfer Application through the student portal. Supporting documents such as transcripts and unit outlines from your previous institution will be required. Contact General Enquiries at Student HQ for assistance.',
    },
    {
      question: 'Where can I get academic advice?',
      answer: 'You can reach out to your Head of Department for advice specific to your course and major. Their contact details are listed on the Heads of Department page under the Help section.',
    },
  ]

  test.beforeEach(async ({ page }) => {
    await page.goto('/help')
    await expect(page.getByRole('heading', { level: 1, name: 'Help & Support' })).toBeVisible()
  })

  test('displays every FAQ with the correct answer and accordion behaviour', async ({ page }) => {
    const faqSection = page.getByRole('region', { name: 'Frequently asked questions' })

    for (const [index, faq] of faqs.entries()) {
      const question = faqSection.getByRole('button', { name: faq.question })
      await expect(question).toHaveAttribute('aria-expanded', 'false')
      await question.click()
      await expect(question).toHaveAttribute('aria-expanded', 'true')
      await expect(faqSection.getByText(faq.answer, { exact: true })).toBeVisible()

      if (index > 0) {
        await expect(
          faqSection.getByRole('button', { name: faqs[index - 1].question }),
        ).toHaveAttribute('aria-expanded', 'false')
        await expect(faqSection.getByText(faqs[index - 1].answer, { exact: true })).toHaveCount(0)
      }
    }

    const lastQuestion = faqSection.getByRole('button', { name: faqs.at(-1)!.question })
    await lastQuestion.click()
    await expect(lastQuestion).toHaveAttribute('aria-expanded', 'false')
    await expect(faqSection.getByText(faqs.at(-1)!.answer, { exact: true })).toHaveCount(0)
  })

  test('shows support details and exposes a working IT help-desk email link', async ({ page }) => {
    const support = page.getByRole('complementary', { name: 'Support channels' })
    await expect(support.getByText('General Enquiries', { exact: true })).toBeVisible()
    await expect(support.getByText('Student HQ, A001 - A002', { exact: true })).toBeVisible()
    await expect(support.getByText('IT Help Desk', { exact: true })).toBeVisible()
    await expect(support.getByText('+6082 255000', { exact: true })).toBeVisible()

    const serviceDeskEmail = support.getByRole('link', { name: 'servicedesk@swinburne.edu.my' })
    await expect(serviceDeskEmail).toHaveAttribute('href', 'mailto:servicedesk@swinburne.edu.my')
  })

  test('opens Heads of Department, can email a department head, and returns via breadcrumb', async ({ page }) => {
    await page.getByRole('link', { name: /Heads of Department/ }).click()
    await expect(page).toHaveURL(/\/help\/heads-of-department$/, { timeout: 15_000 })
    await expect(page.getByRole('heading', { level: 1, name: 'Heads of Department' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'Faculty of Engineering, Computing and Science' })).toBeVisible()

    const email = page.getByRole('link', { name: 'hod-computing@swinburne.edu.my' })
    const departmentRow = email.locator('..')
    await expect(departmentRow).toContainText('Department of Computing')
    await expect(departmentRow).toContainText('Head of Department')
    await expect(email).toHaveAttribute('href', 'mailto:hod-computing@swinburne.edu.my')
    await email.click()
    await expect(page).toHaveURL(/\/help\/heads-of-department$/)

    await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Help & Support' }).click()
    await expect(page).toHaveURL(/\/help$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Help & Support' })).toBeVisible()
  })
})

test.describe('planners page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => sessionStorage.clear())
    await page.reload()
  })

  test('searches and filters to the correct course, major, and intake year', async ({ page }) => {
    const targetCards = page.getByRole('link', {
      name: `View ${TARGET.course} ${TARGET.major} planner`,
    })

    await page.getByRole('searchbox', { name: 'Search planners' }).fill('artificial intelligence')
    await page.getByRole('group', { name: 'Filter by course' }).getByRole('button', { name: TARGET.course }).click()
    await page.getByRole('group', { name: 'Filter by major' }).getByRole('button', { name: TARGET.major }).click()
    await page.getByRole('group', { name: 'Filter by intake year' }).getByRole('button', { name: TARGET.year }).click()

    await expect(page.getByText('2 planners found')).toBeVisible()
    await expect(targetCards).toHaveCount(2)
    await expect(targetCards.filter({ hasText: `Intake: ${TARGET.intake}` })).toBeVisible()
    await expect(targetCards.first()).toContainText(TARGET.major)
    await expect(targetCards.first()).toContainText(TARGET.course)
  })

  test('shows an empty state for an unmatched search and recovers by clearing filters', async ({ page }) => {
    await page.getByRole('searchbox', { name: 'Search planners' }).fill('not-a-real-planner')

    await expect(page.getByText('0 planners found')).toBeVisible()
    await expect(page.getByText('No planners found')).toBeVisible()
    await expect(page.getByText('Try adjusting your search or filter.')).toBeVisible()

    await page.getByRole('button', { name: 'Clear filters' }).click()
    await expect(page.getByRole('searchbox', { name: 'Search planners' })).toHaveValue('')
    await expect(page.getByText(/\d+ planners available/)).toBeVisible()
  })

  test('opens the selected planner through loading, shows exact details, and goes back', async ({ page }) => {
    await page.getByRole('searchbox', { name: 'Search planners' }).fill(TARGET.major)
    const targetCard = page.getByRole('link', {
      name: `View ${TARGET.course} ${TARGET.major} planner`,
    }).filter({ hasText: `Intake: ${TARGET.intake}` })

    await targetCard.click({ noWaitAfter: true })
    await expect(page.getByRole('status', { name: 'Loading study planner...' })).toBeVisible()
    await expect(page).toHaveURL(/\/planners\/[^/]+$/)

    await expect(page.getByRole('heading', { level: 1, name: TARGET.course })).toBeVisible()
    await expect(page.getByText(TARGET.major, { exact: true })).toBeVisible()
    await expect(page.getByText(`Intake: ${TARGET.intake}`, { exact: true })).toBeVisible()

    await page.getByRole('link', { name: 'Back to planners' }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Study Planners' })).toBeVisible()
    await expect(page.getByRole('searchbox', { name: 'Search planners' })).toHaveValue(TARGET.major)
    await expect(targetCard).toBeVisible()
  })

  test('shows semester dates and course totals and opens a unit from the plan', async ({ page }) => {
    await page.getByRole('searchbox', { name: 'Search planners' }).fill(TARGET.major)
    await page.getByRole('link', {
      name: `View ${TARGET.course} ${TARGET.major} planner`,
    }).filter({ hasText: `Intake: ${TARGET.intake}` }).click()

    await expect(page).toHaveURL(/\/planners\/[^/]+$/, { timeout: 15_000 })
    const studyPlan = page.getByRole('region', { name: 'Study plan by year' })
    await expect(studyPlan.getByRole('heading', { level: 2, name: 'Year One' })).toBeVisible()
    await expect(studyPlan.getByRole('columnheader', { name: 'Semester 1 - Sep 2026' })).toBeVisible()
    await expect(studyPlan.getByRole('columnheader', { name: 'Semester 2 - Feb 2027' })).toBeVisible()

    const courseInformation = page.getByRole('complementary', { name: 'Course information' })
    await expect(courseInformation.getByText(/\d+ units total/)).toBeVisible()
    await expect(courseInformation.getByText(/\d+(?:\.\d+)? cp/).first()).toBeVisible()
    await expect(courseInformation.getByText('Core Units', { exact: true })).toBeVisible()
    await expect(courseInformation.getByText('Major Core', { exact: true })).toBeVisible()

    await studyPlan.getByRole('link', { name: 'View Introduction to Programming' }).click()
    await expect(page).toHaveURL(/\/units\/COS10009$/, { timeout: 15_000 })
    await expect(page.getByRole('heading', { level: 1, name: 'Introduction to Programming' })).toBeVisible()
  })

  test('shows the not-found page for an unknown planner', async ({ page }) => {
    const unknownPlannerId = '00000000-0000-4000-8000-000000000000'
    await page.goto(`/planners/${unknownPlannerId}`)
    await expect(page.getByText(/not found/i)).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`/planners/${unknownPlannerId}$`))
  })
})
