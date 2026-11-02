'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { DashboardHandoff } from '../../../core/services/copilot/handoff';
import { useStudentSession } from './StudentSessionContext';
import { useToast } from './ToastProvider';

const URL_PARAMS = ['handoff', 'studentId', 'enrollMode', 'section'];

function asMode(value: string | null): 'latest' | 'earliest' | 'mpu' {
  return value === 'earliest' || value === 'mpu' ? value : 'latest';
}

/**
 * Picks up a copilot button's link. When the link carries a prepared student
 * (`handoff`), it fills the shared student session so the destination page opens
 * already populated. When it does not, or the prepared data is gone, it asks the
 * dashboard to load the student itself. Lives in the pages layout so it works
 * whichever page the button opened.
 */
export default function CopilotHandoffLoader() {
  const pathname = usePathname();
  const router = useRouter();
  const { showToast } = useToast();
  const session = useStudentSession();
  // The effect below runs once per navigation and must read the session as it is
  // then, not as it was when the effect was created.
  const sessionRef = useRef(session);
  sessionRef.current = session;
  // Development runs every effect twice back to back; this keeps one link from
  // being handled twice. It is cleared once handled, so the same link works again.
  const inFlightRef = useRef('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const handoffId = params.get('handoff');
    const studentId = params.get('studentId')?.trim() ?? '';
    const onDashboard = pathname === '/dashboard';
    // A bare studentId only means something on the dashboard, which can search for it.
    if (!handoffId && !(studentId && onDashboard)) return;

    const linkKey = `${pathname}?${window.location.search}`;
    if (inFlightRef.current === linkKey) return;
    inFlightRef.current = linkKey;

    const enrollMode = asMode(params.get('enrollMode'));
    const section = params.get('section');

    const consume = () => {
      const rest = new URLSearchParams(window.location.search);
      URL_PARAMS.forEach((key) => rest.delete(key));
      const query = rest.toString();
      router.replace(query ? `${pathname}?${query}` : pathname);
      inFlightRef.current = '';
    };

    const askDashboardToSearch = () => {
      if (!studentId) return;
      if (onDashboard) {
        sessionRef.current.setHandoffArrival({ studentId, enrollMode, section, load: true });
        consume();
      } else {
        // Only the dashboard can search; the section there still matches the answer.
        router.replace(`/dashboard?${new URLSearchParams({ studentId, enrollMode, ...(section ? { section } : {}) })}`);
        inFlightRef.current = '';
      }
    };

    (async () => {
      if (!handoffId) {
        askDashboardToSearch();
        return;
      }

      const res = await fetch(`/api/copilot/handoff/${encodeURIComponent(handoffId)}`).catch(() => null);
      if (!res?.ok) {
        showToast('That result is no longer available, so it is being loaded again.', 'info');
        askDashboardToSearch();
        if (!studentId) consume();
        return;
      }

      const h = (await res.json()) as DashboardHandoff;
      const s = sessionRef.current;

      // The same student and enrollment is already on screen: keep it, so edits to
      // their pathway are not discarded; only follow the answer to its planner.
      const sameStudent =
        s.studentLoaded && s.scrapedStudent?.studentId === h.studentId && s.dashboardData?.enrollmentMode === h.enrollMode;
      if (sameStudent) {
        if (h.requestedPlannerId) {
          const idx = (s.dashboardData?.planners ?? []).findIndex((p: { id?: string }) => p?.id === h.requestedPlannerId);
          if (idx >= 0) s.setSelectedPlannerIdx(idx);
        }
      } else {
        s.setIsImported(false);
        s.setDataSource('scrape');
        s.setRestoredSession(null);
        s.setScrapedStudent({ student: h.student, studentId: h.studentId });
        s.setDashboardData(h.dashboardData);
        s.setManualPlanner(h.manualPlanner);
        s.setSelectedPlannerIdx(h.selectedPlannerIdx);
        s.setStudentLoaded(true);
      }

      // The dashboard's own fields are local to that page, so leave them for it to pick up.
      if (onDashboard) {
        s.setHandoffArrival({
          studentId: h.studentId,
          enrollMode: h.enrollMode as 'latest' | 'earliest' | 'mpu',
          section,
          dbId: h.dbId,
          studentName: h.studentName,
          enrollments: h.enrollments,
        });
      }
      consume();
    })();

    // Runs per navigation; the URL is read directly so the effect does not need Suspense.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return null;
}
