import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { CatalogProvider } from '@student/components/CatalogProvider'
import { getCatalog } from '@student/lib/catalog'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Study Planners — Swinburne Sarawak',
  description: 'Browse and explore degree and diploma study planners.',
  icons: {
    icon: '/swinburne-logo.jpg',
  },
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const catalog = await getCatalog()

  return (
    <html lang="en" className={inter.variable}>
      <body>
        <CatalogProvider initialCatalog={catalog}>{children}</CatalogProvider>
      </body>
    </html>
  )
}
