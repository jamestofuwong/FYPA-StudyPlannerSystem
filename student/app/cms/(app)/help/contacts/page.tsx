import { prisma } from '@/lib/prisma'
import { saveGeneralEnquiries, saveItHelpDesk } from './contacts-actions'
import styles from './page.module.css'

export default async function ContactsPage() {
  const [enquiries, itDesk] = await Promise.all([
    prisma.generalEnquiries.findFirst(),
    prisma.itHelpDesk.findFirst(),
  ])

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Contact Information</h1>
      <p className={styles.subheading}>Manage General Enquiries and IT Help Desk contact details.</p>

      <div className={styles.grid}>
        {/* General Enquiries */}
        <form action={saveGeneralEnquiries} className={styles.card}>
          <h2 className={styles.cardHeading}>General Enquiries</h2>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="enq-venue_name">Venue Name</label>
            <input
              id="enq-venue_name"
              name="venue_name"
              className={styles.input}
              defaultValue={enquiries?.venue_name ?? ''}
              placeholder="e.g. Student Hub"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="enq-location">Location</label>
            <input
              id="enq-location"
              name="location"
              className={styles.input}
              defaultValue={enquiries?.location ?? ''}
              placeholder="e.g. Building A, Level 1"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="enq-hours">Operating Hours</label>
            <input
              id="enq-hours"
              name="hours"
              className={styles.input}
              defaultValue={enquiries?.hours ?? ''}
              placeholder="e.g. Mon–Fri 9am–5pm"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="enq-closed_note">
              Closed Note <span className={styles.optional}>(optional)</span>
            </label>
            <input
              id="enq-closed_note"
              name="closed_note"
              className={styles.input}
              defaultValue={enquiries?.closed_note ?? ''}
              placeholder="e.g. Closed on public holidays"
            />
          </div>

          <button type="submit" className={styles.saveBtn}>Save</button>
        </form>

        {/* IT Help Desk */}
        <form action={saveItHelpDesk} className={styles.card}>
          <h2 className={styles.cardHeading}>IT Help Desk</h2>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="it-telephone">Telephone</label>
            <input
              id="it-telephone"
              name="telephone"
              className={styles.input}
              defaultValue={itDesk?.telephone ?? ''}
              placeholder="e.g. +61 8 9360 0000"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="it-email">Email</label>
            <input
              id="it-email"
              name="email"
              type="email"
              className={styles.input}
              defaultValue={itDesk?.email ?? ''}
              placeholder="e.g. ithelp@university.edu.au"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="it-location">Location</label>
            <input
              id="it-location"
              name="location"
              className={styles.input}
              defaultValue={itDesk?.location ?? ''}
              placeholder="e.g. Building B, Level 2"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="it-hours_mon_thu">Hours (Mon–Thu)</label>
            <input
              id="it-hours_mon_thu"
              name="hours_mon_thu"
              className={styles.input}
              defaultValue={itDesk?.hours_mon_thu ?? ''}
              placeholder="e.g. 8am–6pm"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="it-hours_fri">Hours (Fri)</label>
            <input
              id="it-hours_fri"
              name="hours_fri"
              className={styles.input}
              defaultValue={itDesk?.hours_fri ?? ''}
              placeholder="e.g. 8am–5pm"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="it-closed_note">
              Closed Note <span className={styles.optional}>(optional)</span>
            </label>
            <input
              id="it-closed_note"
              name="closed_note"
              className={styles.input}
              defaultValue={itDesk?.closed_note ?? ''}
              placeholder="e.g. Closed on public holidays"
            />
          </div>

          <button type="submit" className={styles.saveBtn}>Save</button>
        </form>
      </div>
    </div>
  )
}
