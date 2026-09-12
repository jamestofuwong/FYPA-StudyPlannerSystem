'use client'

import { useState } from 'react'
import styles from './page.module.css'

interface FaqItem {
  question: string
  answer: string
}

interface Props {
  items: FaqItem[]
}

export default function FaqAccordion({ items }: Props) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  function toggle(i: number) {
    setOpenIndex(prev => (prev === i ? null : i))
  }

  return (
    <div className={styles.accordion}>
      {items.map((item, i) => {
        const isOpen = openIndex === i
        return (
          <div key={i} className={`${styles.accordionItem} ${isOpen ? styles.accordionItemOpen : ''}`}>
            <button
              className={styles.accordionBtn}
              onClick={() => toggle(i)}
              aria-expanded={isOpen}
            >
              <span className={styles.accordionQuestion}>{item.question}</span>
              <span className={styles.accordionChevron} aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </button>
            {isOpen && (
              <div className={styles.accordionBody}>
                <p className={styles.accordionAnswer}>{item.answer}</p>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
