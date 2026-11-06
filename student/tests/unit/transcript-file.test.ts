import { MAX_TRANSCRIPT_BYTES, readTranscriptFile, type RowReader } from '@/lib/transcript-file'

const HEADER = ['Course', 'Course Title', 'Level', 'Credits', 'Earned', 'Status', 'Grade', 'Term']
const rows = (...body: unknown[][]) => [HEADER, ...body]
const unit = (code: string, term: string, grade = 'D', status = 'Complete') => [code, code, null, 12.5, 12.5, status, grade, term]

const file = (name = 'results.xlsx', size = 100) => {
  const f = new File(['x'], name)
  Object.defineProperty(f, 'size', { value: size })
  return f
}
const reader = (data: unknown[][]): RowReader => jest.fn().mockResolvedValue(data)

describe('readTranscriptFile', () => {
  test('turns the rows of a results file into completed semesters', async () => {
    const result = await readTranscriptFile(file(), reader(rows(unit('COS10009', '2026_MAR_S1'), unit('COS20007', '2026_SEP_S2'))))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rowCount).toBe(2)
    expect(result.transcript.semesters.map((s) => s.unitCodes)).toEqual([['COS10009'], ['COS20007']])
  })

  test('gives the reader the file the student chose, and nothing else leaves the function', async () => {
    const read = reader(rows(unit('COS10009', '2026_MAR_S1', 'HD')))
    const chosen = file()
    const result = await readTranscriptFile(chosen, read)
    expect(read).toHaveBeenCalledWith(chosen)
    expect(JSON.stringify(result)).not.toMatch(/HD/)
  })

  test('refuses a file that is not .xlsx, is empty, or is too big, without reading it', async () => {
    const read = reader(rows(unit('COS10009', '2026_MAR_S1')))
    for (const bad of [file('results.pdf'), file('results.xls'), file('results'), file('results.xlsx', 0), file('results.xlsx', MAX_TRANSCRIPT_BYTES + 1)]) {
      const result = await readTranscriptFile(bad, read)
      expect(result.ok).toBe(false)
    }
    expect(read).not.toHaveBeenCalled()
  })

  test('accepts the extension in capitals', async () => {
    const result = await readTranscriptFile(file('RESULTS.XLSX'), reader(rows(unit('COS10009', '2026_MAR_S1'))))
    expect(result.ok).toBe(true)
  })

  test('a file that cannot be read gives a plain message and no details', async () => {
    const result = await readTranscriptFile(file(), jest.fn().mockRejectedValue(new Error('zip: bad header at 0x1f')))
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/could not be read/) })
    expect(JSON.stringify(result)).not.toMatch(/zip|0x1f/)
  })

  test('a file without the results columns says which ones are missing', async () => {
    const result = await readTranscriptFile(file(), reader([['Name', 'Age'], ['A', 3]]))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/Course/)
  })

  test('a file with a header and no units says so', async () => {
    const result = await readTranscriptFile(file(), reader(rows()))
    expect(result).toEqual({ ok: false, error: 'File has no data rows.' })
  })

  test('title rows above the header, and extra columns, are fine, as in the advisor app', async () => {
    const result = await readTranscriptFile(file(), reader([['Student results'], [], ['Term', 'Course', 'Credits', 'Earned', 'Status', 'Grade', 'Notes'], ['2026_MAR_S1', 'COS10009', 12.5, 12.5, 'Complete', 'D', 'x']]))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.transcript.semesters[0].unitCodes).toEqual(['COS10009'])
  })
})
