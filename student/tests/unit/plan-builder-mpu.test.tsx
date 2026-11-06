/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import PlanBuilderClient from '@student/app/plan-builder/PlanBuilderClient'
import type { PlannerCourseOption } from '@student/lib/planners'
import type { UnitListing } from '@student/lib/types'
import type { GenerationInput } from '@student/lib/plan-builder'

jest.mock('@student/components/common/PendingNavigation', () => ({
  PendingLink: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
  usePendingNavigation: () => ({ push: jest.fn(), activePendingHref: null }),
}))

const mockGenerate = jest.fn<Promise<unknown>, [GenerationInput]>()
jest.mock('@student/lib/plan-builder', () => ({ generatePlan: (input: GenerationInput) => mockGenerate(input) }))

const unit = (code: string): UnitListing => ({ code, name: `${code} name`, creditPoints: 12.5, yearLevel: 1, availability: ['Semester 1'], prerequisites: [], requisiteGroups: [] } as unknown as UnitListing)
const UNITS = ['COS10009', 'MPU3212'].map(unit)
const OPTIONS: PlannerCourseOption[] = [{
  courseId: 'c1', courseName: 'Bachelor of Computer Science',
  majors: [{ majorId: 'm1', majorName: 'Data Science', plannerId: 'p1' }],
  secondMajors: [],
}]

const result = { semesters: [], completedCodes: new Set<string>(), electivePool: [], warnings: [] }

function pickMajor() {
  fireEvent.change(screen.getByLabelText('Course'), { target: { value: 'c1' } })
  fireEvent.change(screen.getByLabelText('Major'), { target: { value: 'p1' } })
}
const generateButton = () => screen.getByRole('button', { name: /generate study plan/i })
const dialog = () => screen.queryByRole('dialog', { name: /did not add any MPU units/i })

beforeEach(() => { sessionStorage.clear(); mockGenerate.mockReset(); mockGenerate.mockResolvedValue(result) })
afterEach(cleanup)

describe('Plan Builder: the question about MPU units', () => {
  test('is asked when no MPU unit was added, and says what no answer means', () => {
    render(<PlanBuilderClient plannerOptions={OPTIONS} units={UNITS} />)
    pickMajor()
    fireEvent.click(generateButton())

    expect(dialog()).toBeInTheDocument()
    expect(screen.getByText(/takes it that you have not completed any MPU units/i)).toBeInTheDocument()
    expect(mockGenerate).not.toHaveBeenCalled()     // nothing is generated until the student chooses
  })

  test('the first button has the focus when it opens', () => {
    render(<PlanBuilderClient plannerOptions={OPTIONS} units={UNITS} />)
    pickMajor()
    fireEvent.click(generateButton())
    expect(screen.getByRole('button', { name: 'Include the MPU units' })).toHaveFocus()
  })

  test('"Include" plans the MPU units', async () => {
    render(<PlanBuilderClient plannerOptions={OPTIONS} units={UNITS} />)
    pickMajor()
    fireEvent.click(generateButton())
    fireEvent.click(screen.getByRole('button', { name: 'Include the MPU units' }))

    await waitFor(() => expect(mockGenerate).toHaveBeenCalledTimes(1))
    expect(mockGenerate.mock.calls[0][0].config).toMatchObject({ plannerId: 'p1', includeMpu: true })
    expect(dialog()).toBeNull()
    expect(screen.queryByTestId('mpu-left-out')).toBeNull()
  })

  test('"Leave out" plans without the MPU units, and the page says so', async () => {
    render(<PlanBuilderClient plannerOptions={OPTIONS} units={UNITS} />)
    pickMajor()
    fireEvent.click(generateButton())
    fireEvent.click(screen.getByRole('button', { name: 'Leave the MPU units out' }))

    await waitFor(() => expect(mockGenerate).toHaveBeenCalledTimes(1))
    expect(mockGenerate.mock.calls[0][0].config).toMatchObject({ includeMpu: false })
    expect(await screen.findByTestId('mpu-left-out')).toHaveTextContent('MPU units are not in this plan')
  })

  test('Cancel closes it, plans nothing and gives the focus back to Generate', () => {
    render(<PlanBuilderClient plannerOptions={OPTIONS} units={UNITS} />)
    pickMajor()
    fireEvent.click(generateButton())
    fireEvent.click(screen.getByRole('button', { name: 'Cancel and add MPU units' }))

    expect(dialog()).toBeNull()
    expect(mockGenerate).not.toHaveBeenCalled()
    expect(generateButton()).toHaveFocus()
  })

  test('Escape and a click outside the box close it without planning', () => {
    render(<PlanBuilderClient plannerOptions={OPTIONS} units={UNITS} />)
    pickMajor()
    fireEvent.click(generateButton())
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(dialog()).toBeNull()

    fireEvent.click(generateButton())
    expect(dialog()).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('mpu-prompt-backdrop'))
    expect(dialog()).toBeNull()
    expect(mockGenerate).not.toHaveBeenCalled()
  })

  test('the Tab key stays inside the box', () => {
    render(<PlanBuilderClient plannerOptions={OPTIONS} units={UNITS} />)
    pickMajor()
    fireEvent.click(generateButton())
    const first = screen.getByRole('button', { name: 'Include the MPU units' })
    const last = screen.getByRole('button', { name: 'Cancel and add MPU units' })

    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true })
    expect(last).toHaveFocus()
    fireEvent.keyDown(last, { key: 'Tab' })
    expect(first).toHaveFocus()
  })

  test('is not asked when an MPU unit was added: the MPU units are planned', async () => {
    sessionStorage.setItem('plan-builder-draft', JSON.stringify({
      selectedCourseId: 'c1', selectedPlannerId: 'p1', selectedSecondMajorId: '', intakeYear: 2026, intakeMonth: 3,
      completedSemesters: [{ id: 'sem-1', unitCodes: ['MPU3212'] }],
    }))
    render(<PlanBuilderClient plannerOptions={OPTIONS} units={UNITS} />)
    await waitFor(() => expect(generateButton()).toBeEnabled())
    fireEvent.click(generateButton())

    await waitFor(() => expect(mockGenerate).toHaveBeenCalledTimes(1))
    expect(dialog()).toBeNull()
    expect(mockGenerate.mock.calls[0][0].config).toMatchObject({ includeMpu: true })
  })

  test('a unit that is not MPU does not count as one', () => {
    sessionStorage.setItem('plan-builder-draft', JSON.stringify({
      selectedCourseId: 'c1', selectedPlannerId: 'p1', selectedSecondMajorId: '', intakeYear: 2026, intakeMonth: 3,
      completedSemesters: [{ id: 'sem-1', unitCodes: ['COS10009'] }],
    }))
    render(<PlanBuilderClient plannerOptions={OPTIONS} units={UNITS} />)
    fireEvent.click(generateButton())
    expect(dialog()).toBeInTheDocument()
  })
})
