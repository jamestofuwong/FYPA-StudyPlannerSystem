'use client';

import styles from './page.module.css';
import { SCRAPER_STEPS } from '../../../../core/shared/types/scraping';
import { useScraperContext } from '../../../components/providers/ScraperContext';

export default function ScrapingPage() {
  const {
    phase, currentUrl, botStep, showBrowser, error,
    scrapeResult, log, stepIndex, studentId, partitionId,
    isBusy, isElectron,
    setStudentId,
    execStep, execNextStep, execAll, handleClearSession,
    registerWebviewSlot,
  } = useScraperContext();

  const successResult = scrapeResult?.scraped ? scrapeResult : null;

  return (
    <div className={styles.panel}>
      <div className={styles.sectionTitle}>Student Portal Data Scraping</div>

      <div className={styles.splitLayout}>
        <div className={styles.splitMain}>

          {/* Controls card */}
          <div className={styles.card}>
            <div className={styles.cardTitle}>Portal Session</div>

            {!isElectron && (
              <div style={{ color: 'var(--accent-yellow)', fontSize: 12, marginBottom: 12 }}>
                This feature requires the desktop (Electron) app.
              </div>
            )}

            <div className={styles.formGrid2} style={{ marginBottom: 12 }}>
              <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                <label className={styles.formLabel}>Student ID</label>
                <input
                  className={`${styles.formInput} ${styles.formInputMono}`}
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  placeholder="e.g. 102788984"
                  disabled={isBusy}
                />
              </div>
              <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                <label className={styles.formLabel}>Session</label>
                <input
                  className={`${styles.formInput} ${styles.formInputMono}`}
                  value={partitionId}
                  readOnly
                />
              </div>
            </div>

            <div className={styles.btnGroup}>
              <button
                className={styles.btnSecondary}
                onClick={handleClearSession}
                disabled={!isElectron || isBusy}
              >
                Clear Session
              </button>
              <button
                className={styles.btnPrimary}
                onClick={execNextStep}
                disabled={!isElectron || isBusy || stepIndex >= SCRAPER_STEPS.length}
              >
                Next Step
              </button>
              <button
                className={styles.btnSuccess}
                onClick={execAll}
                disabled={!isElectron || isBusy}
              >
                Run All Steps
              </button>
              {SCRAPER_STEPS.map((step, idx) => (
                <button
                  key={step.id}
                  onClick={() => { setStudentId(studentId); execStep(step.id); }}
                  disabled={!isElectron || isBusy}
                  className={styles.btnSecondary}
                  style={{ fontSize: 11 }}
                >
                  {step.label}
                </button>
              ))}
            </div>

            <div style={{ marginTop: 12, display: 'flex', gap: 20, fontSize: 12 }}>
              <span>
                <span style={{ color: 'var(--text-muted)' }}>Phase: </span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-blue)' }}>{phase}</span>
              </span>
              <span>
                <span style={{ color: 'var(--text-muted)' }}>Step: </span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                  {stepIndex < SCRAPER_STEPS.length
                    ? `${stepIndex + 1}/${SCRAPER_STEPS.length} — ${SCRAPER_STEPS[stepIndex].label}`
                    : `Done (${SCRAPER_STEPS.length}/${SCRAPER_STEPS.length})`}
                </span>
              </span>
            </div>

            {botStep && (
              <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                {botStep}
              </div>
            )}

            {currentUrl && (
              <div style={{ marginTop: 4, fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                {currentUrl}
              </div>
            )}
          </div>

          {/* Webview slot — the persistent webview tracks this div's position */}
          {isElectron && phase !== 'idle' && (
            <div className={styles.card} style={{ padding: 0, overflow: 'hidden' }}>
              {phase === 'login' && (
                <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--accent-yellow)', borderBottom: '1px solid var(--panel-border)' }}>
                  Microsoft login detected — please sign in below.
                </div>
              )}
              {/* This div is the slot — the fixed webview overlays it exactly */}
              <div
                ref={registerWebviewSlot}
                style={{ width: '100%', height: showBrowser ? 540 : 320 }}
              />
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{ color: 'var(--accent-red)', fontSize: 12, marginBottom: 12, padding: '8px 12px', background: 'rgba(244,135,113,0.08)', border: '1px solid rgba(244,135,113,0.3)', borderRadius: 4 }}>
              {error}
            </div>
          )}

          {/* Step log */}
          {log.length > 0 && (
            <>
              <div className={styles.sectionTitle}>Scrape Log</div>
              <div style={{
                background: '#0d0d0d',
                border: '1px solid var(--panel-border)',
                borderRadius: 4,
                padding: 12,
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                maxHeight: 160,
                overflowY: 'auto',
                marginBottom: 16,
              }}>
                {log.map((line, i) => (
                  <div
                    key={i}
                    style={{
                      marginBottom: 2,
                      color: line.startsWith('✓') ? 'var(--accent-green)'
                           : line.startsWith('✗') ? 'var(--accent-red)'
                           : line.startsWith('⚠') ? 'var(--accent-yellow)'
                           : 'var(--text-muted)',
                    }}
                  >
                    {line}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Scraped program data */}
          {successResult && (
            <>
              <div className={styles.sectionTitle}>Current Program</div>
              <div className={styles.card}>
                <div className={styles.formGrid2}>
                  {(Object.entries(successResult.data) as [string, string | null][]).map(([key, val]) => (
                    <div key={key} className={styles.formGroup} style={{ marginBottom: 0 }}>
                      <label className={styles.formLabel}>{key}</label>
                      <div className={styles.fieldValueMono}>{val ?? '—'}</div>
                    </div>
                  ))}
                </div>
              </div>

              {successResult.gridRows && successResult.gridRows.length > 0 && (
                <>
                  <div className={styles.sectionTitle}>
                    Course Audit ({successResult.gridRowCount} rows)
                  </div>
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Course ID</th>
                          <th>Title</th>
                          <th>Credits</th>
                          <th>Earned</th>
                          <th>Status</th>
                          <th>Grade</th>
                          <th>Term</th>
                        </tr>
                      </thead>
                      <tbody>
                        {successResult.gridRows.map((row, i) => (
                          <tr key={i}>
                            <td><code className={styles.code}>{row.courseId}</code></td>
                            <td>{row.courseTitle}</td>
                            <td className={styles.tdRight}>{row.credits}</td>
                            <td className={styles.tdRight}>{row.earned}</td>
                            <td>
                              <span className={`${styles.badge} ${
                                row.status === 'Complete' ? styles.badgeGreen :
                                row.status === 'Future'   ? styles.badgeBlue  :
                                                            styles.badgeYellow
                              }`}>
                                {row.status}
                              </span>
                            </td>
                            <td><code className={styles.code}>{row.grade || '—'}</code></td>
                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>{row.term}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}

          {scrapeResult && !scrapeResult.scraped && (
            <div style={{ color: 'var(--accent-red)', fontSize: 12, padding: '8px 12px', background: 'rgba(244,135,113,0.08)', border: '1px solid rgba(244,135,113,0.3)', borderRadius: 4 }}>
              Scrape failed: {scrapeResult.error}
            </div>
          )}
        </div>

        {/* Sidebar stats */}
        <div className={styles.splitSide}>
          <div className={styles.sectionTitle}>Scraping Stats</div>
          <div className={styles.card}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className={`${styles.statCard} ${styles.blue}`} style={{ margin: 0 }}>
                <div className={styles.statLabel}>Course Rows</div>
                <div className={styles.statValue}>{successResult?.gridRowCount ?? '—'}</div>
                <div className={styles.statSub}>from course audit grid</div>
              </div>
              <div className={`${styles.statCard} ${styles.green}`} style={{ margin: 0 }}>
                <div className={styles.statLabel}>Cum GPA</div>
                <div className={styles.statValue} style={{ fontSize: 20 }}>
                  {successResult?.data.enrollmentCumGPA ?? '—'}
                </div>
                <div className={styles.statSub}>enrollment cumulative</div>
              </div>
              <div className={`${styles.statCard} ${styles.yellow}`} style={{ margin: 0 }}>
                <div className={styles.statLabel}>Status</div>
                <div className={styles.statValue} style={{ fontSize: 14, paddingTop: 4 }}>
                  {successResult?.data.status ?? phase}
                </div>
                <div className={styles.statSub}>
                  {successResult ? `${successResult.rowCount} program rows` : 'awaiting scrape'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
