import { notFound } from 'next/navigation'
import Link from 'next/link'
import Nav from '@student/components/Nav/Nav'
import { getUnit } from '@student/lib/units'
import styles from './page.module.css'

interface Props {
  params: Promise<{ code: string }>
}

function unitYear(code: string): number {
  const match = code.match(/\d/)
  return match ? parseInt(match[0]) : 0
}

export default async function UnitDetailPage({ params }: Props) {
  const { code } = await params
  const unit = await getUnit(code)

  if (!unit) notFound()

  const year = unitYear(unit.code)

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
            <span className={styles.metaItem}>{unit.creditPoints} credit points</span>
          </div>
          <h1 className={styles.heroTitle}>{unit.name}</h1>
          <p className={styles.heroCode}>{unit.code}</p>
          {unit.availability && unit.availability.length > 0 && (
            <div className={styles.availRow}>
              <span className={styles.availLabel}>Offered in</span>
              <div className={styles.availMonths}>
                {unit.availability.map(a => (
                  <span key={a} className={styles.availMonth}>
                    {a}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Content grid */}
        <div className={styles.contentGrid}>

          {/* Left — main content */}
          <div className={styles.content}>

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
                        <th className={styles.assessColTask}>Task</th>
                        <th className={styles.assessColType}>Type</th>
                        <th className={styles.assessColUlo}>ULOs</th>
                        <th className={styles.assessColWeight}>Weight</th>
                      </tr>
                    </thead>
                    <tbody>
                      {unit.assessment.map((item, i) => (
                        <tr key={i} className={styles.assessRow}>
                          <td className={styles.assessTask}>{item.title}</td>
                          <td className={styles.assessType}>{item.type}</td>
                          <td className={styles.assessUlo}>{item.ulos.join(', ')}</td>
                          <td className={styles.assessWeight}>{item.weight}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
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
                  <dt className={styles.infoLabel}>Credit Points</dt>
                  <dd className={styles.infoValue}>{unit.creditPoints}</dd>
                </div>
                {year > 0 && (
                  <div className={styles.infoRow}>
                    <dt className={styles.infoLabel}>Year Level</dt>
                    <dd className={styles.infoValue}>Year {year}</dd>
                  </div>
                )}
                {unit.availability && unit.availability.length > 0 && (
                  <div className={styles.infoRow}>
                    <dt className={styles.infoLabel}>Availability</dt>
                    <dd className={styles.infoValue}>{unit.availability.join(', ')}</dd>
                  </div>
                )}
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
                  {unit.prerequisites && unit.prerequisites.length > 0 ? (
                    <ul className={styles.reqList}>
                      {unit.prerequisites.map(c => (
                        <li key={c}>
                          <Link href={`/units/${c}`} className={styles.reqLink}>{c}</Link>
                        </li>
                      ))}
                    </ul>
                  ) : <p className={styles.reqNone}>None</p>}
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
                  {unit.corequisites && unit.corequisites.length > 0 ? (
                    <ul className={styles.reqList}>
                      {unit.corequisites.map(c => (
                        <li key={c}>
                          <Link href={`/units/${c}`} className={styles.reqLink}>{c}</Link>
                        </li>
                      ))}
                    </ul>
                  ) : <p className={styles.reqNone}>None</p>}
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
                  {unit.antirequisites && unit.antirequisites.length > 0 ? (
                    <ul className={styles.reqList}>
                      {unit.antirequisites.map(c => (
                        <li key={c}>
                          <Link href={`/units/${c}`} className={styles.reqLink}>{c}</Link>
                        </li>
                      ))}
                    </ul>
                  ) : <p className={styles.reqNone}>None</p>}
                </div>

              </div>
            </div>

          </aside>
        </div>

      </main>
    </div>
  )
}
