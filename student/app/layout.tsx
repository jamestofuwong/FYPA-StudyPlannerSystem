import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Inter } from 'next/font/google'
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
  // The Content-Security-Policy uses a new nonce for every request (proxy.ts), and Next.js can only put that nonce
  // on its inline scripts while it renders the request. A page that is prerendered at build time has no nonce, its
  // scripts are blocked and it never becomes interactive. Waiting for a request makes every page render per request.
  // The data is still cached (lib/catalog.ts), so this costs a render, not a database query.
  await connection()

  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  )
}
