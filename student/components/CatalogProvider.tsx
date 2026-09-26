'use client'

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { canonicalJson } from '@student/lib/canonical-json'
import type { StudentCatalog } from '@student/lib/catalog-types'

const CatalogContext = createContext<StudentCatalog | null>(null)

export function useCatalog(): StudentCatalog {
  const catalog = useContext(CatalogContext)
  if (!catalog) throw new Error('useCatalog must be used inside CatalogProvider')
  return catalog
}

export function CatalogProvider({
  initialCatalog,
  children,
}: {
  initialCatalog: StudentCatalog
  children: ReactNode
}) {
  const [catalog, setCatalog] = useState(initialCatalog)
  const snapshot = useRef(canonicalJson(initialCatalog))
  const pathname = usePathname()
  const skipFirstNavigation = useRef(true)

  useEffect(() => {
    let cancelled = false
    let inflight = false

    async function refresh() {
      if (inflight) return
      inflight = true
      try {
        const res = await fetch('/api/bootstrap', { cache: 'no-store' })
        if (!res.ok || cancelled) return
        const next = (await res.json()) as StudentCatalog
        const nextJson = canonicalJson(next)
        if (nextJson === snapshot.current) return
        snapshot.current = nextJson
        setCatalog(next)
      } catch {
        // Keep the catalog already on screen.
      } finally {
        inflight = false
      }
    }

    function onFocus() {
      if (document.visibilityState === 'hidden') return
      refresh()
    }

    if (skipFirstNavigation.current) {
      skipFirstNavigation.current = false
    } else if (!pathname.startsWith('/cms')) {
      refresh()
    }

    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      cancelled = true
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [pathname])

  return <CatalogContext.Provider value={catalog}>{children}</CatalogContext.Provider>
}
