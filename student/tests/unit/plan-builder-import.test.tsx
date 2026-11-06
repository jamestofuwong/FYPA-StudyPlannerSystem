/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react'
import PlanBuilderClient from '@student/app/plan-builder/PlanBuilderClient'
import type { UnitListing } from '@student/lib/types'
import type { TranscriptReadResult } from '@student/lib/transcript-file'

jest.mock('@student/components/common/PendingNavigation', () => ({
  PendingLink: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
  usePendingNavigation: () => ({ push: jest.fn(), activePendingHref: null }),
}))

const mockRead = jest.fn<Promise<TranscriptReadResult>, [File]>()
jest.mock('@student/lib/transcript-file', () => ({ readTranscriptFile: (file: File) => mockRead(file) }))

const unit = (code: string): UnitListing => ({ code, name: `${code} name`, creditPoints: 12.5, yearLevel: 1, availability: ['Semester 1', 'Semester 2'], prerequisites: [], requisiteGroups: [] } as unknown as UnitListing)
const UNITS = ['COS10003', 'COS10009', 'COS20007', 'COS30019'].map(unit)

const transcript = (over: Partial<Extract<TranscriptReadResult, { ok: true }>['transcript']> = {}): TranscriptReadResult => ({
  ok: true,
  rowCount: 4,
  transcript: {
    semesters: [
      { term: '2026_MAR_S1', unitCodes: ['COS10003', 'COS10009'] },
      { term: '2026_SEP_S2', unitCodes: ['COS20007'] },
    ],
    passed: ['COS10003', 'COS10009', 'COS20007'], inProgress: [], failed: [], withoutTerm: [], firstTerm: '2026_MAR_S1',
    ...over,
  },
})

const chooseFile = async (name = 'results.xlsx') => {
  const input = screen.getByTestId('transcript-file') as HTMLInputElement
  fireEvent.change(input, { target: { files: [new File(['x'], name)] } })
  await waitFor(() => expect(mockRead).toHaveBeenCalled())
}
const table = (n: number) => screen.getByText(`Semester ${n}`).closest('.completedTable') as HTMLElement

beforeEach(() => { sessionStorage.clear(); mockRead.mockReset() })
afterEach(cleanup)

describe('Plan Builder: import from Excel', () => {
  test('says that the file stays on the device and offers the import', () => {
    render(<PlanBuilderClient plannerOptions={[]} units={UNITS} />)
    expect(screen.getByRole('button', { name: 'Import from Excel' })).toBeInTheDocument()
    expect(screen.getByText(/read on this device/)).toBeInTheDocument()
    expect(screen.getByText(/not uploaded or stored/)).toBeInTheDocument()
  })

  test('puts the units of the file into the semesters it names, and says what it did', async () => {
    mockRead.mockResolvedValue(transcript())
    render(<PlanBuilderClient plannerOptions={[]} units={UNITS} />)
    await chooseFile()

    const notice = await screen.findByTestId('import-notice')
    expect(notice).toHaveTextContent('Imported 3 units in 2 semesters.')
    expect(notice).toHaveTextContent('The file starts in 2026_MAR_S1. Check that the intake above matches.')
    expect(within(table(1)).getByText('COS10003')).toBeInTheDocument()
    expect(within(table(1)).getByText('COS10009')).toBeInTheDocument()
    expect(within(table(2)).getByText('COS20007')).toBeInTheDocument()
    expect(screen.getByText('3 units marked as completed')).toBeInTheDocument()
  })

  test('a skipped semester stays as an empty one', async () => {
    mockRead.mockResolvedValue(transcript({ semesters: [{ term: '2026_MAR_S1', unitCodes: ['COS10009'] }, { term: '', unitCodes: [] }, { term: '2027_MAR_S1', unitCodes: ['COS20007'] }] }))
    render(<PlanBuilderClient plannerOptions={[]} units={UNITS} />)
    await chooseFile()
    await screen.findByTestId('import-notice')
    expect(screen.getAllByText(/^Semester \d$/)).toHaveLength(3)
    expect(within(table(3)).getByText('COS20007')).toBeInTheDocument()
    expect(within(table(2)).queryByText(/^COS/)).toBeNull()
  })

  test('reports units that are in progress, failed, not in the unit list, or without a term', async () => {
    mockRead.mockResolvedValue(transcript({
      semesters: [{ term: '2026_MAR_S1', unitCodes: ['COS10009', 'XYZ99999', 'COS30019'] }],
      inProgress: ['COS30019'], failed: ['COS10003'], withoutTerm: ['COS30019'],
    }))
    render(<PlanBuilderClient plannerOptions={[]} units={UNITS} />)
    await chooseFile()
    const notice = await screen.findByTestId('import-notice')
    expect(notice).toHaveTextContent('Imported 2 units in 1 semester.')
    expect(notice).toHaveTextContent('counted as done: COS30019')
    expect(notice).toHaveTextContent('Failed units are not counted, so the plan includes them again: COS10003')
    expect(notice).toHaveTextContent('left out: XYZ99999')
    expect(notice).toHaveTextContent('No term was found for COS30019, so they are in Semester 1')
    expect(screen.queryByText('XYZ99999')).toBeNull()
  })

  test('a file that cannot be used shows its message and changes nothing', async () => {
    mockRead.mockResolvedValue({ ok: false, error: 'Choose an Excel file that ends in .xlsx.' })
    render(<PlanBuilderClient plannerOptions={[]} units={UNITS} />)
    await chooseFile('results.pdf')
    const notice = await screen.findByTestId('import-notice')
    expect(notice).toHaveTextContent('The file was not imported.')
    expect(notice).toHaveTextContent('Choose an Excel file that ends in .xlsx.')
    expect(screen.queryByText(/units? marked as completed/)).toBeNull()
  })

  test('a file whose units are all unknown to the website is refused', async () => {
    mockRead.mockResolvedValue(transcript({ semesters: [{ term: '2026_MAR_S1', unitCodes: ['XYZ99999'] }] }))
    render(<PlanBuilderClient plannerOptions={[]} units={UNITS} />)
    await chooseFile()
    expect(await screen.findByTestId('import-notice')).toHaveTextContent('None of the units in the file are in this website')
  })

  test('units already entered are replaced only after the student agrees', async () => {
    mockRead.mockResolvedValue(transcript())
    const confirm = jest.spyOn(window, 'confirm')
    render(<PlanBuilderClient plannerOptions={[]} units={UNITS} />)

    await chooseFile()
    await screen.findByTestId('import-notice')
    expect(confirm).not.toHaveBeenCalled()          // nothing was entered, so nothing is asked

    confirm.mockReturnValue(false)
    mockRead.mockResolvedValue(transcript({ semesters: [{ term: '2026_MAR_S1', unitCodes: ['COS30019'] }] }))
    await chooseFile()
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1))
    expect(within(table(1)).getByText('COS10003')).toBeInTheDocument()   // declined: the first import is still there
    expect(screen.queryByText('COS30019')).toBeNull()

    confirm.mockReturnValue(true)
    await chooseFile()
    await waitFor(() => expect(within(table(1)).getByText('COS30019')).toBeInTheDocument())
    expect(screen.queryByText('COS10003')).toBeNull()
    confirm.mockRestore()
  })

  test('only unit codes are kept in the tab: no grade reaches the draft', async () => {
    mockRead.mockResolvedValue(transcript())
    render(<PlanBuilderClient plannerOptions={[]} units={UNITS} />)
    await chooseFile()
    await screen.findByTestId('import-notice')
    await waitFor(() => expect(sessionStorage.getItem('plan-builder-draft')).toContain('COS10009'))
    expect(sessionStorage.getItem('plan-builder-draft')).not.toMatch(/"grade"|HD/)
  })
})
