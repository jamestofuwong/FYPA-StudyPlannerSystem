import type { Metadata } from 'next';
import './globals.css';
import Topbar from '../components/Topbar';
import Sidebar from '../components/Sidebar';

export const metadata: Metadata = {
  title: 'FYPA Cloud Admin',
  description: 'Planner management and sync dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
          <Topbar />
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            <Sidebar />
            <main style={{
              flex: 1,
              overflowY: 'auto',
              background: 'var(--bg)',
            }}>
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
