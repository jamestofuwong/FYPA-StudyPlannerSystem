'use client'

import Nav from '@student/components/Nav/Nav'
import UnitCatalog from '@student/components/UnitCatalog/UnitCatalog'
import { useCatalog } from '@student/components/CatalogProvider'
import styles from './page.module.css'

export default function UnitsPage() {
  const { units } = useCatalog()

  return (
    <div className={styles.page}>
      <Nav />
      <main className={styles.main}>

        <div className={styles.hero}>
          <h1 className={styles.heroTitle}>Units</h1>
          <p className={styles.heroSubtitle}>
            Browse all available units. Search by code or name, or filter by year level.
          </p>
        </div>

        <UnitCatalog units={units} />

      </main>
    </div>
  )
}
