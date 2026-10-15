/** @jest-environment jsdom */
// @ts-nocheck
import React from 'react';
import { render, waitFor, act } from '@testing-library/react';
import CopilotHandoffLoader from '@/components/providers/CopilotHandoffLoader';
import { StudentSessionProvider, useStudentSession } from '@/components/providers/StudentSessionContext';
import { ToastProvider } from '@/components/providers/ToastProvider';

let mockPathname = '/dashboard';
const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: jest.fn(), prefetch: jest.fn() }),
  usePathname: () => mockPathname,
  useSearchParams: () => new URLSearchParams(),
}));

let session;
function Probe() {
  session = useStudentSession();
  return null;
}

const HANDOFF = {
  studentId: '102780123',
  enrollMode: 'latest',
  dbId: 55,
  studentName: 'Ann Lee',
  enrollments: [{ EnrollId: 1, EnrollmentDesc: 'BA-CS' }],
  student: { studentName: 'Ann Lee', courseList: [], selectedEnrollment: 'BA-CS' },
  dashboardData: { enrollmentMode: 'latest', planners: [{ id: 'p1' }, { id: 'p2' }], completedCodes: [] },
  requestedPlannerId: undefined,
  selectedPlannerIdx: 0,
  manualPlanner: null,
};

const reply = (status, body) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });

function openUrl(path, search) {
  window.history.pushState({}, '', `${path}${search}`);
  mockPathname = path;
}

const mount = () =>
  render(
    <ToastProvider>
      <StudentSessionProvider>
        <Probe />
        <CopilotHandoffLoader />
      </StudentSessionProvider>
    </ToastProvider>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn();
});

describe('a copilot link with prepared data', () => {
  it('fills the session, leaves the dashboard its fields and the section, and drops the single-use id', async () => {
    global.fetch.mockImplementation(() => reply(200, HANDOFF));
    openUrl('/dashboard', '?handoff=h1&studentId=102780123&enrollMode=latest&section=graduation');
    mount();

    await waitFor(() => expect(session.studentLoaded).toBe(true));
    expect(global.fetch).toHaveBeenCalledWith('/api/copilot/handoff/h1');
    expect(session.scrapedStudent.studentId).toBe('102780123');
    expect(session.dashboardData.planners).toHaveLength(2);
    expect(session.handoffArrival).toMatchObject({
      studentId: '102780123',
      section: 'graduation',
      dbId: 55,
      studentName: 'Ann Lee',
    });
    expect(session.handoffArrival.load).toBeUndefined();
    expect(mockReplace).toHaveBeenCalledWith('/dashboard');
  });

  it('keeps other query parameters when it cleans up', async () => {
    global.fetch.mockImplementation(() => reply(200, HANDOFF));
    openUrl('/dashboard', '?handoff=h1&studentId=1&keep=yes');
    mount();
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/dashboard?keep=yes'));
  });

  it('selects the manually chosen planner when the answer was about one outside the top three', async () => {
    global.fetch.mockImplementation(() => reply(200, { ...HANDOFF, selectedPlannerIdx: -1, manualPlanner: { id: 'p9' } }));
    openUrl('/dashboard', '?handoff=h1&studentId=102780123');
    mount();
    await waitFor(() => expect(session.studentLoaded).toBe(true));
    expect(session.selectedPlannerIdx).toBe(-1);
    expect(session.manualPlanner).toEqual({ id: 'p9' });
  });

  it('works for the pathway page too, without leaving a dashboard arrival behind', async () => {
    global.fetch.mockImplementation(() => reply(200, HANDOFF));
    openUrl('/pathway', '?handoff=h1&studentId=102780123');
    mount();
    await waitFor(() => expect(session.studentLoaded).toBe(true));
    expect(session.handoffArrival).toBeNull();
    expect(mockReplace).toHaveBeenCalledWith('/pathway');
  });

  describe('when the same student is already on screen', () => {
    // A new element each time: React skips re-rendering an identical one, and the
    // loader must see the new pathname.
    const tree = () => (
      <ToastProvider>
        <StudentSessionProvider>
          <Probe />
          <CopilotHandoffLoader />
        </StudentSessionProvider>
      </ToastProvider>
    );

    async function startWithStudentLoaded() {
      openUrl('/units', '');
      const view = render(tree());
      await act(async () => {
        session.setScrapedStudent({ studentId: '102780123', student: {} });
        session.setDashboardData({ enrollmentMode: 'latest', planners: [{ id: 'p1' }, { id: 'p2' }], marker: 'keep-me' });
        session.setStudentLoaded(true);
      });
      return view;
    }

    it('keeps it, so edits to their pathway are not discarded', async () => {
      global.fetch.mockImplementation(() => reply(200, HANDOFF));
      const view = await startWithStudentLoaded();

      openUrl('/dashboard', '?handoff=h2&studentId=102780123&section=units');
      view.rerender(tree());

      await waitFor(() => expect(session.handoffArrival).toMatchObject({ section: 'units' }));
      expect(session.dashboardData.marker).toBe('keep-me');
    });

    it('still follows the answer to its planner when that planner is among the matches', async () => {
      global.fetch.mockImplementation(() => reply(200, { ...HANDOFF, requestedPlannerId: 'p2', selectedPlannerIdx: 1 }));
      const view = await startWithStudentLoaded();

      openUrl('/dashboard', '?handoff=h2&studentId=102780123&section=units');
      view.rerender(tree());

      await waitFor(() => expect(session.selectedPlannerIdx).toBe(1));
      expect(session.dashboardData.marker).toBe('keep-me');
    });

    it('replaces it when the link is about a different student', async () => {
      global.fetch.mockImplementation(() => reply(200, { ...HANDOFF, studentId: '999' }));
      const view = await startWithStudentLoaded();

      openUrl('/dashboard', '?handoff=h2&studentId=999');
      view.rerender(tree());

      await waitFor(() => expect(session.scrapedStudent.studentId).toBe('999'));
      expect(session.dashboardData.marker).toBeUndefined();
    });
  });
});

describe('a copilot link whose prepared data is gone', () => {
  it('asks the dashboard to search for the student itself', async () => {
    global.fetch.mockImplementation(() => reply(404, { error: 'expired' }));
    openUrl('/dashboard', '?handoff=old&studentId=102780123&enrollMode=mpu&section=units');
    mount();

    await waitFor(() => expect(session.handoffArrival).not.toBeNull());
    expect(session.handoffArrival).toMatchObject({ studentId: '102780123', enrollMode: 'mpu', section: 'units', load: true });
    expect(session.studentLoaded).toBe(false);
  });

  it('sends a pathway link to the dashboard, which is the page that can search', async () => {
    global.fetch.mockImplementation(() => reply(502, { error: 'failed' }));
    openUrl('/pathway', '?handoff=old&studentId=102780123&enrollMode=latest');
    mount();
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    const target = mockReplace.mock.calls[0][0];
    expect(target.startsWith('/dashboard?')).toBe(true);
    expect(new URLSearchParams(target.split('?')[1]).get('studentId')).toBe('102780123');
  });
});

describe('a student picked from search results', () => {
  it('needs no fetch: the dashboard is asked to search', async () => {
    openUrl('/dashboard', '?studentId=102780123&enrollMode=latest');
    mount();
    await waitFor(() => expect(session.handoffArrival).toMatchObject({ studentId: '102780123', load: true }));
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/dashboard');
  });
});

describe('an ordinary visit', () => {
  it('does nothing', async () => {
    openUrl('/dashboard', '');
    mount();
    await act(async () => {});
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(session.handoffArrival).toBeNull();
  });

  it('ignores a studentId on pages that cannot search', async () => {
    openUrl('/units', '?studentId=102780123');
    mount();
    await act(async () => {});
    expect(global.fetch).not.toHaveBeenCalled();
    expect(session.handoffArrival).toBeNull();
  });
});
