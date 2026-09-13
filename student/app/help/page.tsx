import Link from 'next/link'
import Nav from '@student/components/Nav/Nav'
import FaqAccordion from './FaqAccordion'
import styles from './page.module.css'
import { prisma } from '@/lib/prisma'

export default async function HelpPage() {
  const [faqItems, generalEnquiries, itHelpDesk] = await Promise.all([
    prisma.faqItem.findMany({ orderBy: { position: 'asc' } }),
    prisma.generalEnquiries.findFirst(),
    prisma.itHelpDesk.findFirst(),
  ])

  return (
    <div className={styles.page}>
      <Nav />
      <main className={styles.main}>

        {/* Hero */}
        <div className={styles.hero}>
          <h1 className={styles.heroTitle}>Help & Support</h1>
          <p className={styles.heroSubtitle}>
            Find answers to common questions, or reach out through one of our support channels.
          </p>
        </div>

        {/* Two-column layout */}
        <div className={styles.contentGrid}>

          {/* LEFT: FAQ */}
          <section aria-label="Frequently asked questions">
            <h2 className={styles.sectionTitle}>Frequently Asked Questions</h2>
            {faqItems.length > 0 ? (
              <FaqAccordion items={faqItems.map(f => ({ question: f.question, answer: f.answer }))} />
            ) : (
              <p style={{ color: '#6b7280', fontSize: 14 }}>No FAQ items available yet.</p>
            )}
          </section>

          {/* RIGHT: Sidebar */}
          <aside aria-label="Support channels">
            <h2 className={styles.sectionTitle}>Get in Touch</h2>

            <div className={styles.sidebar}>

              {/* Heads of Department */}
              <Link href="/help/heads-of-department" className={styles.hodCard}>
                <div className={styles.hodCardIcon}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </div>
                <div className={styles.hodCardBody}>
                  <div className={styles.hodCardTitle}>Heads of Department</div>
                  <div className={styles.hodCardSubtitle}>
                    View contact details for all department heads across the university.
                  </div>
                </div>
                <svg className={styles.hodCardArrow} width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>

              {/* General Enquiries */}
              {generalEnquiries && (
                <div className={styles.channelCard}>
                  <div className={styles.channelIcon}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                  </div>
                  <div className={styles.channelBody}>
                    <div className={styles.channelTitle}>General Enquiries</div>
                    <p className={styles.channelDesc}>For enrolment, fees, timetabling, and general administrative matters.</p>
                    <div className={styles.infoBlock}>
                      <div className={styles.infoRow}>
                        <span className={styles.infoLabel}>Location</span>
                        <span className={styles.infoValue}>{generalEnquiries.venue_name}, {generalEnquiries.location}</span>
                      </div>
                      <div className={styles.infoRow}>
                        <span className={styles.infoLabel}>Hours</span>
                        <span className={styles.infoValue}>{generalEnquiries.hours}</span>
                      </div>
                      {generalEnquiries.closed_note && (
                        <div className={styles.infoNote}>{generalEnquiries.closed_note}</div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* IT Help Desk */}
              {itHelpDesk && (
                <div className={styles.channelCard}>
                  <div className={styles.channelIcon}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="3" width="20" height="14" rx="2" />
                      <path d="M8 21h8M12 17v4" />
                    </svg>
                  </div>
                  <div className={styles.channelBody}>
                    <div className={styles.channelTitle}>IT Help Desk</div>
                    <p className={styles.channelDesc}>For technical issues with the student portal, Canvas, or this study planner system.</p>
                    <div className={styles.infoBlock}>
                      <div className={styles.infoRow}>
                        <span className={styles.infoLabel}>Tel</span>
                        <span className={styles.infoValue}>{itHelpDesk.telephone}</span>
                      </div>
                      <div className={styles.infoRow}>
                        <span className={styles.infoLabel}>Email</span>
                        <a href={`mailto:${itHelpDesk.email}`} className={styles.infoLink}>{itHelpDesk.email}</a>
                      </div>
                      <div className={styles.infoRow}>
                        <span className={styles.infoLabel}>Location</span>
                        <span className={styles.infoValue}>{itHelpDesk.location}</span>
                      </div>
                      <div className={styles.infoRow}>
                        <span className={styles.infoLabel}>Hours</span>
                        <span className={styles.infoValue}>
                          {itHelpDesk.hours_mon_thu}<br />
                          {itHelpDesk.hours_fri}
                        </span>
                      </div>
                      {itHelpDesk.closed_note && (
                        <div className={styles.infoNote}>{itHelpDesk.closed_note}</div>
                      )}
                    </div>
                  </div>
                </div>
              )}

            </div>
          </aside>

        </div>
      </main>
    </div>
  )
}
