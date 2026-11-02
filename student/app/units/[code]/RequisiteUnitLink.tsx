'use client'

import type { MouseEvent } from 'react'
import { usePendingNavigation } from '@student/components/common/PendingNavigation'
import styles from './page.module.css'

interface Props {
  code: string
}

export default function RequisiteUnitLink({ code }: Props) {
  const href = `/units/${code}`
  const navigation = usePendingNavigation('Loading unit details...')
  const pending = navigation.activePendingHref === href

  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.defaultPrevented ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    ) {
      return
    }

    event.preventDefault()
    navigation.push(href)
  }

  return (
    <a href={href} className={styles.reqLink} onClick={onClick}>
      {code}
      {pending && <span className={styles.reqInlineSpinner} aria-hidden="true" />}
    </a>
  )
}
