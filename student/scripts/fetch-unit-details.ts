import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SOURCE_UNITS, type SourceUnit } from '../data/source-units'
import {
  fetchOfficialUnitDetail,
  normalizeUnitCode,
  type OfficialUnitDetail,
} from '../lib/unit-detail-official-fetch'

const OUTPUT_PATH = fileURLToPath(new URL('../data/unit-details.json', import.meta.url))
type SourceUnitGroup = { normalizedCode: string; entries: SourceUnit[] }

// Combine duplicate or annotated source entries so each normalized unit is fetched once.
function groupSourceUnits(units: SourceUnit[]): SourceUnitGroup[] {
  const groups = new Map<string, SourceUnitGroup>()
  for (const unit of units) {
    const normalizedCode = normalizeUnitCode(unit.code)
    const group = groups.get(normalizedCode) ?? { normalizedCode, entries: [] }
    group.entries.push(unit)
    groups.set(normalizedCode, group)
  }
  return [...groups.values()].sort((a, b) => a.normalizedCode.localeCompare(b.normalizedCode))
}

// Run the existing sequential collection and write the same deterministic JSON output.
async function main(): Promise<void> {
  const groups = groupSourceUnits(SOURCE_UNITS)
  const results: OfficialUnitDetail[] = []

  for (const [index, group] of groups.entries()) {
    const result = await fetchOfficialUnitDetail(
      group.normalizedCode,
      group.entries[0].name,
      group.entries,
      { useCache: true },
    )
    results.push(result)
    console.log(`[${index + 1}/${groups.length}] ${group.normalizedCode}: ${result.status}`)
  }

  await mkdir(dirname(OUTPUT_PATH), { recursive: true })
  await writeFile(OUTPUT_PATH, `${JSON.stringify({
    schemaVersion: 1,
    source: 'Swinburne official websites',
    units: results,
  }, null, 2)}\n`, 'utf8')
  console.log(`Wrote ${results.length} unique normalized unit records from ${SOURCE_UNITS.length} source entries to ${OUTPUT_PATH}`)
}

// Keep importing this module side-effect free; run collection only as a CLI command.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error('Unit detail collection failed:', error)
    process.exitCode = 1
  })
}
