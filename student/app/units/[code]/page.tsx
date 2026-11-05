import { notFound } from 'next/navigation'
import Link from 'next/link'
import Nav from '@student/components/Nav/Nav'
import { getCachedUnit } from '@student/lib/catalog'
import { requisiteCreditPoints } from '@student/lib/requisites'
import { officialUnitUrl } from '@core/shared/unitLinks'
import RequisiteExpression from './RequisiteExpression'
import styles from './page.module.css'

interface Props {
  params: Promise<{ code: string }>
}

function availabilityValue(availability: string[] | undefined): string {
  if (!availability || availability.length === 0) return 'TBC'

  const semesterNums: string[] = []
  const others: string[] = []

  for (const term of availability) {
    const semester = term.match(/^Semester (\d+)$/)
    if (semester) {
      semesterNums.push(semester[1])
      continue
    }
    if (term === 'Summer Term') {
      others.push('Summer')
      continue
    }
    if (term === 'Winter Term') {
      others.push('Winter')
      continue
    }
    others.push(term)
  }

  const parts: string[] = []
  if (semesterNums.length > 0) {
    parts.push(`Semester ${semesterNums.join(' & ')}`)
  }
  parts.push(...others)

  return parts.join(', ')
}

export default async function UnitDetailPage({ params }: Props) {
  const { code } = await params
  const unit = await getCachedUnit(code)

  if (!unit) notFound()

  const year = unit.yearLevel ?? 0
  const requiredCreditPoints = [...new Set(requisiteCreditPoints(unit.requisiteGroups, 'prerequisite'))]
  const availValue = availabilityValue(unit.availability)
  const offerText = `Unit Offer: ${availValue}`
  // MPU units have no page of their own on the university website, so they get no button
  const officialUrl = officialUnitUrl(unit.code)
  const hasUnitDetails = Boolean(unit.overview?.trim()) ||
    unit.learningOutcomes.length > 0 ||
    unit.content.length > 0 ||
    unit.assessment.length > 0

  return (
    <div className={styles.page}>
      <Nav />
      <main className={styles.main}>

        {/* Breadcrumb */}
        <nav className={styles.breadcrumb} aria-label="Breadcrumb">
          <Link href="/units" className={styles.breadcrumbLink}>Units</Link>
          <span className={styles.breadcrumbSep} aria-hidden="true">/</span>
          <span className={styles.breadcrumbCurrent}>{unit.code}</span>
        </nav>

        {/* Hero */}
        <div className={styles.hero}>
          <div className={styles.heroMeta}>
            {year > 0 && <span className={styles.metaItem}>Year {year}</span>}
            {year > 0 && <span className={styles.metaDivider} aria-hidden="true">·</span>}
            <span className={styles.metaItem}>{unit.creditPoints} cp</span>
          </div>
          <h1 className={styles.heroTitle}>{unit.name}</h1>
          <p className={styles.heroCode}>{unit.code}</p>
          <p className={styles.availSummary}>{offerText}</p>
          {officialUrl && (
            <a
              className={styles.officialLink}
              href={officialUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`View ${unit.code} on the university website (opens in a new tab)`}
            >
              View on the university website
              <svg className={styles.officialLinkIcon} viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
                <path d="M9 2h5v5M14 2L7.5 8.5M12 9.5V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          )}
        </div>

        {/* Content grid */}
        <div className={styles.contentGrid}>

          {/* Left — main content */}
          <div className={styles.content}>
            {!hasUnitDetails ? (
              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Unit details unavailable</h2>
                <p className={styles.overviewText}>Detailed information for this unit is currently unavailable.</p>
              </section>
            ) : (
              <>
                {/* Overview */}
                <section className={styles.section}>
                  <h2 className={styles.sectionTitle}>Overview</h2>
                  <p className={styles.overviewText}>{unit.overview}</p>
                </section>

                {/* Learning outcomes */}
                {unit.learningOutcomes.length > 0 && (
                  <section className={styles.section}>
                    <h2 className={styles.sectionTitle}>Unit Learning Outcomes</h2>
                    <ol className={styles.outcomeList}>
                      {unit.learningOutcomes.map((lo, i) => (
                        <li key={i} className={styles.outcomeItem}>{lo}</li>
                      ))}
                    </ol>
                  </section>
                )}

                {/* Content / topics */}
                {unit.content.length > 0 && (
                  <section className={styles.section}>
                    <h2 className={styles.sectionTitle}>Content</h2>
                    <ul className={styles.contentList}>
                      {unit.content.map((topic, i) => (
                        <li key={i} className={styles.contentItem}>{topic}</li>
                      ))}
                    </ul>
                  </section>
                )}

                {/* Assessment */}
                {unit.assessment.length > 0 && (
                  <section className={styles.section}>
                    <h2 className={styles.sectionTitle}>Assessment</h2>
                    <div className={styles.assessWrap}>
                      <table className={styles.assessTable}>
                        <thead>
                          <tr className={styles.assessHeaderRow}>
                            <th className={styles.assessColType}>Type</th>
                            <th className={styles.assessColTask}>Task</th>
                            <th className={styles.assessColUlo}>ULOs</th>
                            <th className={styles.assessColWeight}>Weight</th>
                          </tr>
                        </thead>
                        <tbody>
                          {unit.assessment.map((item, i) => {
                            const weightLabel = item.weightingRaw?.trim()
                              ? item.weightingRaw
                              : item.weight != null ? `${item.weight}%` : 'Not specified'
                            return (
                              <tr key={i} className={styles.assessRow}>
                                <td className={styles.assessType}>{item.type}</td>
                                <td className={styles.assessType}>{item.task || '—'}</td>
                                <td className={styles.assessUlo}>{item.ulos.join(', ')}</td>
                                <td className={styles.assessWeight}>{weightLabel}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}
              </>
            )}

          </div>

          {/* Right — sidebar */}
          <aside className={styles.sidebar}>

            <div className={styles.sideCard}>
              <h3 className={styles.sideCardTitle}>Unit Information</h3>
              <dl className={styles.infoList}>
                <div className={styles.infoRow}>
                  <dt className={styles.infoLabel}>Unit Code</dt>
                  <dd className={styles.infoValue}>{unit.code}</dd>
                </div>
                <div className={styles.infoRow}>
                  <dt className={styles.infoLabel}>CP</dt>
                  <dd className={styles.infoValue}>{unit.creditPoints} cp</dd>
                </div>
                {requiredCreditPoints.length > 0 && (
                  <div className={styles.infoRow}>
                    <dt className={styles.infoLabel}>Required CP</dt>
                    <dd className={styles.infoValue}>
                      {requiredCreditPoints.map(points => `${points} cp`).join(' / ')}
                    </dd>
                  </div>
                )}
                {year > 0 && (
                  <div className={styles.infoRow}>
                    <dt className={styles.infoLabel}>Year Level</dt>
                    <dd className={styles.infoValue}>Year {year}</dd>
                  </div>
                )}
                <div className={styles.infoRow}>
                  <dt className={styles.infoLabel}>Availability</dt>
                  <dd className={styles.infoValue}>{availValue}</dd>
                </div>
              </dl>
            </div>

            <div className={styles.sideCard}>
              <h3 className={styles.sideCardTitle}>Requisites</h3>
              <div className={styles.reqBody}>

                {/* Prerequisite */}
                <div className={styles.reqSection}>
                  <div className={styles.reqTypeRow}>
                    <span className={styles.reqTypeName}>Prerequisite</span>
                    <span className={styles.tooltipWrap}>
                      <span className={styles.tooltipIcon} aria-label="What is a prerequisite?">ⓘ</span>
                      <span className={styles.tooltipBox} role="tooltip">
                        Must be completed before enrolling in this unit.
                      </span>
                    </span>
                  </div>
                  <p className={styles.reqNone}>
                    <RequisiteExpression
                      groups={unit.requisiteGroups}
                      type="prerequisite"
                      fallbackCodes={unit.prerequisites}
                    />
                  </p>
                </div>

                {/* Co-requisite */}
                <div className={styles.reqSection}>
                  <div className={styles.reqTypeRow}>
                    <span className={styles.reqTypeName}>Co-requisite</span>
                    <span className={styles.tooltipWrap}>
                      <span className={styles.tooltipIcon} aria-label="What is a co-requisite?">ⓘ</span>
                      <span className={styles.tooltipBox} role="tooltip">
                        Must be enrolled in concurrently or completed before this unit.
                      </span>
                    </span>
                  </div>
                  <p className={styles.reqNone}>
                    <RequisiteExpression
                      groups={unit.requisiteGroups}
                      type="corequisite"
                      fallbackCodes={unit.corequisites}
                    />
                  </p>
                </div>

                {/* Anti-requisite */}
                <div className={styles.reqSection}>
                  <div className={styles.reqTypeRow}>
                    <span className={styles.reqTypeName}>Anti-requisite</span>
                    <span className={styles.tooltipWrap}>
                      <span className={styles.tooltipIcon} aria-label="What is an anti-requisite?">ⓘ</span>
                      <span className={styles.tooltipBox} role="tooltip">
                        Cannot be taken if you have already completed this unit.
                      </span>
                    </span>
                  </div>
                  <p className={styles.reqNone}>
                    <RequisiteExpression
                      groups={unit.requisiteGroups}
                      type="antirequisite"
                      fallbackCodes={unit.antirequisites}
                    />
                  </p>
                </div>

              </div>
            </div>

          </aside>
        </div>

      </main>
    </div>
  )
}
