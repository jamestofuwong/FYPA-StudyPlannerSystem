import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { load, type CheerioAPI } from 'cheerio'
import type { AnyNode, Element } from 'domhandler'
import { SOURCE_UNITS, type SourceUnit } from '../data/source-units'
import {
  UNIT_EQUIVALENCES,
  UNIT_SOURCE_OVERRIDES,
  type UnitSourceKind,
} from '../data/unit-detail-sources'

const OUTPUT_PATH = fileURLToPath(new URL('../data/unit-details.json', import.meta.url))
const REQUEST_DELAY_MS = 1_500
const REQUEST_TIMEOUT_MS = 25_000
const MAX_ATTEMPTS = 3
const MAX_REDIRECTS = 5
const USER_AGENT = 'FYPA-Student-UnitDetails-Collector/1.0 (development data collection)'
const SECTION_NAMES = ['Overview', 'Unit Learning Outcomes', 'Content', 'Assessment'] as const
type SectionName = typeof SECTION_NAMES[number]
type HeadingSection = SectionName | 'Aims and learning outcomes'
type FetchStatus =
  | 'ok'
  | 'partial'
  | 'catalog_only'
  | 'historical_reference_only'
  | 'fetch_failed'
  | 'page_not_found'
  | 'parse_failed'
  | 'identity_mismatch'

type LearningOutcome = { number: number; description: string }
type Assessment = {
  position: number
  type: string
  task: string
  weightingRaw: string
  weight: number | null
  uloMappingRaw: string
  ulos: number[]
}
type CatalogueMatch = { title: string; cohort: string | null }
type UnitDetails = {
  unitCode: string
  originalCode: string
  normalizedCode: string
  sourceAliases?: string[]
  sourceUrl: string
  sourceKind: UnitSourceKind
  status: FetchStatus
  officialTitle: string | null
  catalogueMatches?: CatalogueMatch[]
  verifiedEquivalentCode?: string
  equivalenceEvidenceUrl?: string
  overview: string | null
  learningOutcomes: LearningOutcome[]
  contentTopics: { position: number; topic: string }[]
  assessments: Assessment[]
  missingSections: SectionName[]
  warnings: string[]
}
type SourceUnitGroup = { normalizedCode: string; entries: SourceUnit[] }
type OfficialResource = { body: string | null; contentType: string; finalUrl: URL }

class UnsafeDestinationError extends Error {}
class HttpStatusError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`)
  }
}

// Clean page text so layout whitespace does not affect matching or saved details.
function normalizeText(value: string): string {
  return value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
}

// Normalize source codes before matching them or building official page URLs.
function normalizeUnitCode(code: string): string {
  return code.trim().replace(/\*Optional$/i, '').replace(/\s+/g, '').toUpperCase()
}

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

// Build the standard official unit URL from the normalized code prefix.
function sourceUrlFor(unitCode: string): string {
  const normalizedCode = normalizeUnitCode(unitCode)
  const prefix = normalizedCode[0]?.toLowerCase()
  if (!prefix) throw new Error(`Cannot build an official unit URL from an empty code: ${unitCode}`)
  return `https://www.swinburne.edu.au/course/unit/${prefix}/${encodeURIComponent(normalizedCode.toLowerCase())}/`
}

// Prefer audited special sources and equivalents when a normal unit page is unsuitable.
function sourceFor(unitCode: string): { url: string; sourceKind: UnitSourceKind } {
  const normalizedCode = normalizeUnitCode(unitCode)
  const override = UNIT_SOURCE_OVERRIDES[normalizedCode]
  const equivalence = UNIT_EQUIVALENCES[normalizedCode]
  return {
    url: override?.url ?? equivalence?.evidenceUrl ?? sourceUrlFor(unitCode),
    sourceKind: override?.sourceKind ?? (equivalence ? 'equivalent_unit_page' : 'official_unit_page'),
  }
}

// Read heading depth so section extraction stops at the correct next heading.
function headingLevel(element: Element): number {
  const tagLevel = /^h([1-6])$/i.exec(element.tagName)?.[1]
  if (tagLevel) return Number(tagLevel)
  return Number(element.attribs['aria-level'] ?? 2)
}

// Recognize only the requested detail sections, while supporting the Sarawak heading variant.
function headingSection(text: string): HeadingSection | null {
  const normalized = normalizeText(text).toLowerCase().replace(/[’']/g, '').replace(/:$/, '')
  if (normalized === 'overview') return 'Overview'
  if (normalized === 'unit learning outcomes') return 'Unit Learning Outcomes'
  if (normalized === 'aims and learning outcomes') return 'Aims and learning outcomes'
  if (normalized === 'content') return 'Content'
  if (normalized === 'assessment') return 'Assessment'
  return null
}

// Detect a new section heading so its content is not mixed into the previous section.
function hasBoundaryHeading($: CheerioAPI, node: AnyNode, maxLevel: number): boolean {
  const $node = $(node)
  const candidates = $node.is('h1, h2, h3, h4, h5, h6, [role="heading"]')
    ? [node]
    : $node.find('h1, h2, h3, h4, h5, h6, [role="heading"]').toArray()
  return candidates.some(candidate => candidate.type === 'tag' && headingLevel(candidate) <= maxLevel)
}

// Collect the content following a heading without crossing into the next section.
function sectionNodes($: CheerioAPI, heading: Element): AnyNode[] {
  const level = headingLevel(heading)
  let branch: AnyNode = heading
  let parent = heading.parent

  while (parent && parent.type !== 'root') {
    const following = $(branch).nextAll().toArray()
    if (following.length) {
      const collected: AnyNode[] = []
      for (const node of following) {
        if (hasBoundaryHeading($, node, level)) break
        collected.push(node)
      }
      if (collected.some(node => normalizeText($(node).text()).length > 0)) return collected
    }
    branch = parent
    parent = parent.parent
  }

  return []
}

// Remove page controls and scripts before using a section's visible text.
function cleanFragmentText($: CheerioAPI, nodes: AnyNode[]): string {
  const fragment = $('<div></div>')
  for (const node of nodes) fragment.append($(node).clone())
  fragment.find('script, style, noscript, nav, button, svg').remove()
  return normalizeText(fragment.text())
}

// Read top-level list entries so nested lists do not create duplicate details.
function sectionListItems($: CheerioAPI, nodes: AnyNode[]): string[] {
  const values: string[] = []
  for (const node of nodes) {
    const $node = $(node)
    if ($node.is('li') && !$node.parents('li').length) {
      const value = normalizeText($node.clone().children('ul, ol').remove().end().text())
      if (value) values.push(value)
      continue
    }
    $node.find('li').each((_index, item) => {
      const $item = $(item)
      if ($item.parents('li').length) return
      const value = normalizeText($item.clone().children('ul, ol').remove().end().text())
      if (value) values.push(value)
    })
  }
  return values
}

// Preserve outcome order and use listed numbers, falling back to their page order.
function makeOutcomes(items: string[], warnings: string[]): LearningOutcome[] {
  if (!items.length) {
    warnings.push('Unit Learning Outcomes section had no extractable list items.')
    return []
  }
  return items.map((item, index) => {
    const numbered = /^(?:ULO\s*)?(\d+)[.)]?\s+(.+)$/i.exec(item)
    return {
      number: numbered ? Number(numbered[1]) : index + 1,
      description: numbered ? numbered[2].trim() : item,
    }
  })
}

// Extract learning outcomes from the standard unit-page section.
function extractOutcomes($: CheerioAPI, nodes: AnyNode[], warnings: string[]): LearningOutcome[] {
  return makeOutcomes(sectionListItems($, nodes), warnings)
}

// Find the outcomes list used by Sarawak pages without treating other text as outcomes.
function extractSarawakOutcomes($: CheerioAPI, nodes: AnyNode[], warnings: string[]): LearningOutcome[] {
  const markerIndex = nodes.findIndex(node => /students who successfully complete this unit/i.test($(node).text()))
  if (markerIndex < 0) return makeOutcomes([], warnings)

  const listNodes: AnyNode[] = []
  for (const node of nodes.slice(markerIndex + 1)) {
    if ($(node).is('h1, h2, h3, h4, h5, h6, [role="heading"]')) break
    if ($(node).find('h1, h2, h3, h4, h5, h6, [role="heading"]').length) break
    if ($(node).is('ol, ul') || $(node).find('ol, ul').length) listNodes.push(node)
    if (listNodes.length) break
  }
  return makeOutcomes(sectionListItems($, listNodes), warnings)
}

// Extract ordered content topics from lists, or paragraphs when no list is provided.
function extractContentTopics($: CheerioAPI, nodes: AnyNode[], warnings: string[]): { position: number; topic: string }[] {
  const topics = sectionListItems($, nodes)
  if (!topics.length) {
    for (const node of nodes) {
      $(node).find('p').each((_index, paragraph) => {
        const value = normalizeText($(paragraph).text())
        if (value) topics.push(value)
      })
    }
  }
  if (!topics.length) warnings.push('Content section had no extractable topics.')
  return topics.map((topic, index) => ({ position: index + 1, topic }))
}

// Parse only clear numeric ULO lists so uncertain mappings remain available as raw text.
function parseUloMapping(raw: string): number[] | null {
  const value = normalizeText(raw).replace(/^ulos?\s*[:\-]?\s*/i, '')
  if (!value || !/^\d+(?:\s*(?:,|;|&|\band\b)\s*\d+)*$/i.test(value)) return null
  return value.match(/\d+/g)?.map(Number) ?? null
}

// Match assessment columns by their headings because official tables may order them differently.
function assessmentHeaders($: CheerioAPI, row: Element): Map<string, number> {
  const headers = new Map<string, number>()
  $(row).children('th, td').each((index, cell) => {
    const label = normalizeText($(cell).text()).toLowerCase().replace(/[’']/g, '').replace(/[^a-z]/g, '')
    if (label === 'type') headers.set('type', index)
    if (label === 'task') headers.set('task', index)
    if (label === 'weighting' || label === 'weight') headers.set('weighting', index)
    if (label === 'ulos' || label === 'ulomapping') headers.set('ulos', index)
  })
  return headers
}

// Preserve official weighting text and parse a number only for one clear percentage.
function assessmentFromCells(
  cells: string[],
  position: number,
  warnings: string[],
): Assessment {
  const [type = '', task = '', weightingRaw = '', uloMappingRaw = ''] = cells
  const percentage = /^(\d+(?:\.\d+)?)\s*%$/.exec(weightingRaw)
  const ulos = parseUloMapping(uloMappingRaw)
  if (!percentage) warnings.push(`Assessment ${position} has nonnumeric or unrecognized weighting: ${weightingRaw || '(blank)'}.`)
  if (uloMappingRaw && !ulos) warnings.push(`Assessment ${position} ULO mapping could not be parsed confidently: ${uloMappingRaw}.`)
  return {
    position,
    type,
    task,
    weightingRaw,
    weight: percentage ? Number(percentage[1]) : null,
    uloMappingRaw,
    ulos: ulos ?? [],
  }
}

// Read assessment details from list text when the page has no structured assessment table.
function assessmentFromText(value: string, position: number, warnings: string[]): Assessment {
  const text = normalizeText(value).replace(/^\d+[.)]\s*/, '')
  const weightingMatch = /((?:\d+(?:\.\d+)?\s*(?:-|–|to)\s*\d+(?:\.\d+)?\s*%|\d+(?:\.\d+)?\s*%(?:\s*[x×]\s*\d+(?:\.\d+)?\s*(?:=\s*\d+(?:\.\d+)?\s*%)?)?|pass\s*\/\s*fail))\s*$/i.exec(text)
  const weightingRaw = weightingMatch?.[1] ?? ''
  const assessmentLabel = weightingMatch ? text.slice(0, weightingMatch.index).trim() : text
  const taskMatch = /\((individual|group|pair|team|online|written|practical)\)/i.exec(assessmentLabel)
  const task = taskMatch?.[1] ?? ''
  const type = (taskMatch ? assessmentLabel.replace(taskMatch[0], '') : assessmentLabel).replace(/[:\-\s]+$/, '').trim()
  const uloMatch = /\b(?:ulos?|learning outcomes?)\s*[:\-]\s*([\d,;&\s]+)$/i.exec(type)
  const uloMappingRaw = uloMatch?.[1] ?? ''
  const cleanType = uloMatch ? type.slice(0, uloMatch.index).trim() : type
  return assessmentFromCells([cleanType || text, task, weightingRaw, uloMappingRaw], position, warnings)
}

// Extract assessments in page order and warn when weighting or ULO text is unclear.
function extractAssessments($: CheerioAPI, nodes: AnyNode[], warnings: string[]): Assessment[] {
  const assessments: Assessment[] = []
  let matchingTableCount = 0

  for (const node of nodes) {
    const $root = $(node)
    const tables = $root.is('table') ? [$root[0]] : $root.find('table').toArray()
    for (const table of tables) {
      const rows = $(table).find('tr').toArray()
      const headerIndex = rows.findIndex(row => {
        const labels = assessmentHeaders($, row)
        return ['type', 'task', 'weighting', 'ulos'].every(key => labels.has(key))
      })
      if (headerIndex < 0) continue
      matchingTableCount += 1
      const headers = assessmentHeaders($, rows[headerIndex])
      for (const row of rows.slice(headerIndex + 1)) {
        const cells = $(row).children('th, td').toArray()
        if (!cells.length) continue
        const cellText = (key: string) => {
          const cell = cells[headers.get(key)!]
          return cell ? normalizeText($(cell).text()) : ''
        }
        const values = ['type', 'task', 'weighting', 'ulos'].map(cellText)
        if (values.some(Boolean)) assessments.push(assessmentFromCells(values, assessments.length + 1, warnings))
      }
    }
  }

  if (!matchingTableCount) {
    const rows: string[] = []
    for (const node of nodes) {
      const $node = $(node)
      const orderedLists = $node.is('ol') ? [$node[0]] : $node.find('ol').toArray()
      for (const list of orderedLists) {
        const items = sectionListItems($, [list]).filter(item => /\d+(?:\.\d+)?\s*%|pass\s*\/\s*fail/i.test(item))
        if (items.length) {
          rows.push(...items)
          break
        }
      }
      if (rows.length) break
    }
    rows.forEach((row, index) => assessments.push(assessmentFromText(row, index + 1, warnings)))
  }

  if (!matchingTableCount && !assessments.length) warnings.push('Assessment section had no extractable assessment rows.')
  else if (matchingTableCount > 1) warnings.push(`Found ${matchingTableCount} assessment tables; rows were collected in page order.`)
  return assessments
}

// Normalize titles for identity checks without changing the saved official wording.
function normalizedTitle(value: string): string {
  return normalizeText(value).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')
}

// Match a unit code even when an official page adds spaces inside the code.
function codePattern(unitCode: string): RegExp {
  const normalized = normalizeUnitCode(unitCode)
  const prefix = normalized.slice(0, 3).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const digits = normalized.slice(3).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\b${prefix}\\s*${digits}\\b`, 'i')
}

// Collect only overview, outcomes, content, and assessments; requisites stay with academic seed data.
function parseUnitPage(
  html: string,
  sourceUrl: string,
  unitCode: string,
  sourceKind: UnitSourceKind = 'official_unit_page',
  expectedName = '',
): UnitDetails {
  const $ = load(html)
  const warnings: string[] = []
  const missingSections: SectionName[] = []
  const found = new Map<HeadingSection, AnyNode[]>()

  $('h1, h2, h3, h4, h5, h6, [role="heading"]').each((_index, heading) => {
    if (heading.type !== 'tag') return
    const name = headingSection($(heading).text())
    if (name && !found.has(name)) found.set(name, sectionNodes($, heading))
  })

  const aimsNodes = found.get('Aims and learning outcomes') ?? []
  const overviewNodes = found.get('Overview') ?? []
  let overview = cleanFragmentText($, overviewNodes) || null
  if (!overview && aimsNodes.length) {
    const aim = aimsNodes.map(node => normalizeText($(node).text())).find(text => /^this unit aims?\b/i.test(text))
    if (aim) overview = aim
  }
  if (!overview) missingSections.push('Overview')

  const outcomeNodes = found.get('Unit Learning Outcomes') ?? []
  const learningOutcomes = outcomeNodes.length
    ? extractOutcomes($, outcomeNodes, warnings)
    : aimsNodes.length
      ? extractSarawakOutcomes($, aimsNodes, warnings)
      : makeOutcomes([], warnings)
  if (!learningOutcomes.length) missingSections.push('Unit Learning Outcomes')

  const contentNodes = found.get('Content') ?? []
  const contentTopics = extractContentTopics($, contentNodes, warnings)
  if (!contentTopics.length) missingSections.push('Content')

  const assessmentNodes = found.get('Assessment') ?? []
  const assessments = extractAssessments($, assessmentNodes, warnings)
  if (!assessments.length) missingSections.push('Assessment')

  const heading = normalizeText($('h1').first().text())
  if (/page not found|404|we couldn.t find/i.test(heading)) {
    return failedUnit(unitCode, unitCode, sourceUrl, sourceKind, 'page_not_found', 'Official page returned a not-found heading.')
  }
  if (sourceKind === 'sarawak_unit_page') {
    const pageText = normalizeText($('body').text())
    const headingCode = $('h1, h2, h3, h4').toArray().map(node => normalizeText($(node).text())).find(text => /\b[A-Z]{3}\s*\d{4,5}\b/i.test(text))
    if (headingCode && !codePattern(unitCode).test(headingCode)) {
      return failedUnit(unitCode, unitCode, sourceUrl, sourceKind, 'identity_mismatch', `Page heading identifies a different unit: ${headingCode}`)
    }
    if (!codePattern(unitCode).test(pageText) && normalizedTitle(heading) !== normalizedTitle(expectedName)) {
      return failedUnit(unitCode, unitCode, sourceUrl, sourceKind, 'identity_mismatch', 'The official override page did not expose the requested code or matching title.')
    }
  }

  const officialTitle = heading || null
  if (sourceKind !== 'equivalent_unit_page' && officialTitle && expectedName && normalizedTitle(officialTitle) !== normalizedTitle(expectedName)) {
    warnings.push(`Official title differs from the unchanged source-unit title: "${officialTitle}".`)
  }
  if (sourceKind === 'sarawak_unit_page' && !codePattern(unitCode).test(normalizeText($('body').text()))) {
    warnings.push('Unit identity was matched by the audited official URL and title; the code was not present in page text.')
  }
  if (!found.size || missingSections.length === SECTION_NAMES.length) {
    return {
      ...failedUnit(unitCode, unitCode, sourceUrl, sourceKind, 'parse_failed', 'No requested Unit Detail sections could be extracted.'),
      officialTitle,
      missingSections: [...SECTION_NAMES],
      warnings,
    }
  }

  return {
    unitCode,
    originalCode: unitCode,
    normalizedCode: unitCode,
    sourceUrl,
    sourceKind,
    status: missingSections.length ? 'partial' : 'ok',
    officialTitle,
    overview,
    learningOutcomes,
    contentTopics,
    assessments,
    missingSections,
    warnings,
  }
}

// Return a consistent empty-detail record when a source cannot be safely used.
function failedUnit(
  unitCode: string,
  originalCode: string,
  sourceUrl: string,
  sourceKind: UnitSourceKind,
  status: FetchStatus,
  warning: string,
): UnitDetails {
  return {
    unitCode,
    originalCode,
    normalizedCode: unitCode,
    sourceUrl,
    sourceKind,
    status,
    officialTitle: null,
    overview: null,
    learningOutcomes: [],
    contentTopics: [],
    assessments: [],
    missingSections: [...SECTION_NAMES],
    warnings: [warning],
  }
}

// Allow HTTPS destinations only on the two approved official Swinburne domains.
function assertOfficialUrl(url: URL): void {
  const allowedHosts = new Set(['www.swinburne.edu.au', 'www.swinburne.edu.my'])
  if (url.protocol !== 'https:' || !allowedHosts.has(url.hostname.toLowerCase())) {
    throw new UnsafeDestinationError(`Refused non-official destination: ${url.origin}`)
  }
}

// Check that a URL path still identifies the requested unit after redirects or canonicalization.
function isExpectedUnitPath(url: URL, unitCode: string): boolean {
  const normalizedCode = normalizeUnitCode(unitCode).toLowerCase()
  const match = /^\/course\/unit\/([a-z])\/([^/]+)\/?$/i.exec(url.pathname)
  if (!match) return false
  try {
    return match[1].toLowerCase() === normalizedCode[0] && decodeURIComponent(match[2]).toLowerCase() === normalizedCode
  } catch {
    return false
  }
}

let lastRequestAt = 0
const resourceCache = new Map<string, Promise<OfficialResource>>()

// Space requests apart so sequential collection does not overload the official site.
async function waitForRequestSlot(): Promise<void> {
  const remaining = REQUEST_DELAY_MS - (Date.now() - lastRequestAt)
  if (lastRequestAt && remaining > 0) await delay(remaining)
  lastRequestAt = Date.now()
}

// Fetch one official page with a timeout and validate every redirect destination.
async function fetchOfficialResourceOnce(startUrl: string): Promise<OfficialResource> {
  let currentUrl = new URL(startUrl)
  assertOfficialUrl(currentUrl)

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    await waitForRequestSlot()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    let response: Response
    try {
      response = await fetch(currentUrl, {
        headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml,application/pdf' },
        redirect: 'manual',
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeout)
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location')
      await response.body?.cancel()
      if (!location) throw new Error('Redirect response did not include a Location header.')
      if (redirectCount === MAX_REDIRECTS) throw new Error(`Exceeded the ${MAX_REDIRECTS}-redirect limit.`)
      currentUrl = new URL(location, currentUrl)
      assertOfficialUrl(currentUrl)
      continue
    }

    const finalUrl = new URL(response.url || currentUrl.href)
    assertOfficialUrl(finalUrl)
    if (!response.ok) {
      await response.body?.cancel()
      throw new HttpStatusError(response.status)
    }

    const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? ''
    const isHtml = contentType === 'text/html' || contentType === 'application/xhtml+xml'
    return { body: isHtml ? await response.text() : null, contentType, finalUrl }
  }
  throw new Error('Redirect handling ended unexpectedly.')
}

// Reuse fetched pages and retry only temporary network or server failures.
async function fetchOfficialResource(url: string): Promise<OfficialResource> {
  const cached = resourceCache.get(url)
  if (cached) return cached

  const request = (async () => {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        return await fetchOfficialResourceOnce(url)
      } catch (error) {
        if (attempt < MAX_ATTEMPTS && isTransient(error)) {
          await delay(1_000 * attempt)
          continue
        }
        throw error
      }
    }
    throw new Error('Fetch attempts ended without a result.')
  })()
  resourceCache.set(url, request)
  return request
}

// Avoid retrying unsafe URLs or permanent HTTP errors that will not improve on another attempt.
function isTransient(error: unknown): boolean {
  if (error instanceof UnsafeDestinationError) return false
  if (error instanceof HttpStatusError) return error.status === 408 || error.status === 429 || error.status >= 500
  return error instanceof TypeError || (error instanceof Error && error.name === 'AbortError')
}

// Read MPU catalogue identity and cohort evidence without inventing rich unit details.
function parseCatalogueMatches(html: string, unitCode: string): CatalogueMatch[] {
  const $ = load(html)
  const target = normalizeUnitCode(unitCode)
  const matches: CatalogueMatch[] = []
  let currentCohort: string | null = null
  $('h1, h2, h3, h4, h5, h6, tr').each((_index, node) => {
    if (/^h[1-6]$/i.test(node.tagName ?? '')) {
      const heading = normalizeText($(node).text())
      if (/degree/i.test(heading) && /cohort|intake|before|from/i.test(heading)) currentCohort = heading
      return
    }

    const row = node
    const cells = $(row).children('th, td').toArray().map(cell => normalizeText($(cell).text()))
    const rowText = normalizeText(cells.join(' '))
    const codes = [...rowText.matchAll(/MPU\s*(\d{4})/gi)].map(match => `MPU${match[1]}`.toUpperCase())
    if (!codes.includes(target)) return

    const codeIndex = cells.findIndex(cell => normalizeUnitCode(cell) === target)
    const title = (codeIndex >= 0 ? cells.slice(codeIndex + 1) : cells).find(value => value && !/^MPU\s*\d{4}$/i.test(value)) ?? ''
    if (title && !/unit code|unit\s*$/i.test(title)) matches.push({ title, cohort: currentCohort })
  })
  return [...new Map(matches.map(match => [`${match.title}|${match.cohort ?? ''}`, match])).values()]
}

// Record an official reference that identifies a unit but has no rich detail sections.
function referenceOnlyUnit(
  unitCode: string,
  originalCode: string,
  sourceUrl: string,
  sourceKind: UnitSourceKind,
  warning: string,
): UnitDetails {
  return {
    ...failedUnit(unitCode, originalCode, sourceUrl, sourceKind, 'historical_reference_only', warning),
  }
}

// Attach original-code, alias, override, and verified-equivalent provenance to each result.
function finalizeUnit(
  result: UnitDetails,
  group: SourceUnitGroup,
  sourceUrl: string,
): UnitDetails {
  const originalCode = group.entries[0].code
  const aliases = group.entries.slice(1).map(entry => entry.code)
  const equivalence = UNIT_EQUIVALENCES[group.normalizedCode]
  const override = UNIT_SOURCE_OVERRIDES[group.normalizedCode]
  const warnings = [...result.warnings]
  if (aliases.length) {
    warnings.push(`Source entries ${[originalCode, ...aliases].join(', ')} normalize to one unit; one detail record was emitted.`)
  }
  if (override?.notes) warnings.push(override.notes)
  if (equivalence) {
    warnings.push(result.sourceKind === 'equivalent_unit_page'
      ? `Unit Detail content is sourced from verified equivalent ${equivalence.code}; the original ${group.normalizedCode} page was not found.`
      : `Verified equivalent ${equivalence.code} is recorded, but its Unit Detail content was not used for ${group.normalizedCode}.`)
  }

  return {
    ...result,
    unitCode: group.normalizedCode,
    originalCode,
    normalizedCode: group.normalizedCode,
    ...(aliases.length ? { sourceAliases: aliases } : {}),
    sourceUrl,
    ...(equivalence ? {
      verifiedEquivalentCode: equivalence.code,
      equivalenceEvidenceUrl: equivalence.evidenceUrl,
    } : {}),
    warnings,
  }
}

// Fetch the selected official source and choose a clear status for each unit's result.
async function fetchUnit(group: SourceUnitGroup): Promise<UnitDetails> {
  const unitCode = group.normalizedCode
  const expectedName = group.entries[0].name
  const override = UNIT_SOURCE_OVERRIDES[unitCode]
  const source = sourceFor(unitCode)
  const expectedPageCode = source.sourceKind === 'equivalent_unit_page'
    ? UNIT_EQUIVALENCES[unitCode]?.code
    : source.sourceKind === 'official_unit_page' ? unitCode : null

  if (source.sourceKind === 'mpu_catalogue') {
    try {
      const resource = await fetchOfficialResource(source.url)
      if (!resource.body) throw new Error(`Catalogue returned unsupported content type: ${resource.contentType || '(missing)'}`)
      const catalogueMatches = parseCatalogueMatches(resource.body, unitCode)
      const warnings = ['The official MPU catalogue confirms unit identity/cohort information but does not provide the requested Unit Detail sections.']
      if (!catalogueMatches.length) warnings.push(`The catalogue page did not yield a matching row for ${unitCode}; verify this code and cohort manually.`)
      const titles = [...new Set(catalogueMatches.map(match => match.title))]
      if (titles.some(title => normalizedTitle(title) !== normalizedTitle(expectedName))) {
        warnings.push(`MPU catalogue title differs from the unchanged source-unit title: ${titles.join(' / ')}.`)
      }
      const record: UnitDetails = {
        unitCode,
        originalCode: group.entries[0].code,
        normalizedCode: unitCode,
        sourceUrl: resource.finalUrl.href,
        sourceKind: 'mpu_catalogue',
        status: 'catalog_only',
        officialTitle: titles.length === 1 ? titles[0] : null,
        catalogueMatches,
        overview: null,
        learningOutcomes: [],
        contentTopics: [],
        assessments: [],
        missingSections: [...SECTION_NAMES],
        warnings,
      }
      return finalizeUnit(record, group, resource.finalUrl.href)
    } catch (error) {
      return finalizeUnit(
        failedUnit(unitCode, group.entries[0].code, source.url, 'mpu_catalogue', 'fetch_failed', messageOf(error)),
        group,
        source.url,
      )
    }
  }

  try {
    const resource = await fetchOfficialResource(source.url)
    if (!resource.body) {
      return finalizeUnit(
        failedUnit(unitCode, group.entries[0].code, resource.finalUrl.href, source.sourceKind, 'parse_failed', `Expected an HTML unit page, received ${resource.contentType || 'an unknown content type'}.`),
        group,
        resource.finalUrl.href,
      )
    }

    if (expectedPageCode && !isExpectedUnitPath(resource.finalUrl, expectedPageCode)) {
      return finalizeUnit(
        failedUnit(unitCode, group.entries[0].code, resource.finalUrl.href, source.sourceKind, 'identity_mismatch', `Redirected to a different or unexpected unit page: ${resource.finalUrl.pathname}`),
        group,
        resource.finalUrl.href,
      )
    }

    const $ = load(resource.body)
    const canonical = $('link[rel="canonical"]').attr('href') ?? $('meta[property="og:url"]').attr('content')
    if (canonical) {
      const canonicalUrl = new URL(canonical, resource.finalUrl)
      assertOfficialUrl(canonicalUrl)
      if (expectedPageCode && !isExpectedUnitPath(canonicalUrl, expectedPageCode)) {
        return finalizeUnit(
          failedUnit(unitCode, group.entries[0].code, resource.finalUrl.href, source.sourceKind, 'identity_mismatch', `Page canonical URL points to a different or unexpected unit: ${canonicalUrl.pathname}`),
          group,
          resource.finalUrl.href,
        )
      }
    }

    const result = parseUnitPage(resource.body, resource.finalUrl.href, unitCode, source.sourceKind, expectedName)
    return finalizeUnit(result, group, resource.finalUrl.href)
  } catch (error) {
    if (error instanceof HttpStatusError && error.status === 404 && override?.referenceUrl && override.referenceKind) {
      try {
        const reference = await fetchOfficialResource(override.referenceUrl)
        const warning = `Official ${override.referenceKind.replaceAll('_', ' ')} source identifies this unit but does not provide the requested full Unit Detail sections.`
        const record = referenceOnlyUnit(unitCode, group.entries[0].code, reference.finalUrl.href, override.referenceKind, warning)
        return finalizeUnit(record, group, reference.finalUrl.href)
      } catch (referenceError) {
        return finalizeUnit(
          failedUnit(unitCode, group.entries[0].code, override.referenceUrl, override.referenceKind, 'fetch_failed', `Unit page returned 404; reference source could not be fetched: ${messageOf(referenceError)}`),
          group,
          override.referenceUrl,
        )
      }
    }

    if (error instanceof HttpStatusError && error.status === 404) {
      const equivalence = UNIT_EQUIVALENCES[unitCode]
      if (equivalence) {
        const record = referenceOnlyUnit(
          unitCode,
          group.entries[0].code,
          source.url,
          'equivalence_evidence',
          `The official page for verified equivalent ${equivalence.code} was unavailable; no equivalent Unit Detail content was collected.`,
        )
        return finalizeUnit(record, group, source.url)
      }
      return finalizeUnit(
        failedUnit(unitCode, group.entries[0].code, source.url, source.sourceKind, 'page_not_found', 'Official unit page returned HTTP 404 and no audited reference source is configured.'),
        group,
        source.url,
      )
    }
    const status = error instanceof UnsafeDestinationError ? 'identity_mismatch' : 'fetch_failed'
    return finalizeUnit(
      failedUnit(unitCode, group.entries[0].code, source.url, source.sourceKind, status, messageOf(error)),
      group,
      source.url,
    )
  }
}

// Convert different request errors into readable warning text.
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// Pause between requests or retries without blocking the Node event loop.
function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

// Run the collection in unit-code order and write one deterministic JSON file for review.
async function main(): Promise<void> {
  resourceCache.clear()
  lastRequestAt = 0
  // Normalize duplicate and annotated source codes before fetching pages.
  const groups = groupSourceUnits(SOURCE_UNITS)
  const results: UnitDetails[] = []

  // Fetch units sequentially so the configured request delay is respected.
  for (const [index, group] of groups.entries()) {
    const result = await fetchUnit(group)
    results.push(result)
    console.log(`[${index + 1}/${groups.length}] ${group.normalizedCode}: ${result.status}`)
  }

  // Keep the output directory available and save UTF-8 JSON for later seed review.
  await mkdir(dirname(OUTPUT_PATH), { recursive: true })
  await writeFile(OUTPUT_PATH, `${JSON.stringify({
    schemaVersion: 1,
    source: 'Swinburne official websites',
    units: results,
  }, null, 2)}\n`, 'utf8')
  console.log(`Wrote ${results.length} unique normalized unit records from ${SOURCE_UNITS.length} source entries to ${OUTPUT_PATH}`)
}

// Start collection only when this file is run directly, not when helpers are imported.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error('Unit detail collection failed:', error)
    process.exitCode = 1
  })
}

export {
  extractAssessments,
  extractContentTopics,
  extractOutcomes,
  assertOfficialUrl,
  groupSourceUnits,
  normalizeUnitCode,
  parseCatalogueMatches,
  parseUnitPage,
  parseUloMapping,
  sourceFor,
  sourceUrlFor,
}
