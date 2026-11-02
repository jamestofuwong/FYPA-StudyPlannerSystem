/**
 * Copilot answer buttons
 *
 * Every workflow must say where its result can be seen (or say explicitly that
 * it has no page), and the buttons it builds must be well formed.
 */

jest.mock('../../../core/services/portal/portalSessionService', () => ({
  searchStudents: jest.fn(),
  fetchEnrollments: jest.fn(),
  fetchDegreeAudit: jest.fn(),
  getStatus: jest.fn(),
}));

import { allWorkflows } from '../../../core/services/copilot/workflowRegistry';
import {
  workflowLinks,
  linksForWorkflow,
  DASHBOARD_SECTIONS,
  MAX_LIST_LINKS,
} from '../../../core/services/copilot/workflowLinks';

const PLANNER_A = '11111111-1111-4111-8111-111111111111';
const PLANNER_B = '22222222-2222-4222-8222-222222222222';

describe('workflow link table', () => {
  it('has an entry for every workflow, and no entry for a workflow that does not exist', () => {
    const ids = allWorkflows.map((w) => w.id).sort();
    expect(Object.keys(workflowLinks).sort()).toEqual(ids);
  });

  it('only jumps to dashboard sections the dashboard actually has', () => {
    const studentParams = { studentId: '102780123', enrollMode: 'latest', plannerId: PLANNER_A, newPlannerId: PLANNER_A, unitCode: 'COS10009' };
    for (const workflow of allWorkflows) {
      for (const link of linksForWorkflow(workflow.id, studentParams, {})) {
        if (link.target === 'dashboard' && link.section) {
          expect(DASHBOARD_SECTIONS).toContain(link.section);
        }
      }
    }
  });

  it('gives every button a label and a known page', () => {
    const params = { studentId: '102780123', plannerId: PLANNER_A, plannerId1: PLANNER_A, plannerId2: PLANNER_B, newPlannerId: PLANNER_B, unitCode: 'COS10009', prefix: 'COS' };
    for (const workflow of allWorkflows) {
      for (const link of linksForWorkflow(workflow.id, params, { planners: [{ id: PLANNER_A, majorName: 'Software' }] })) {
        expect(link.label.trim()).not.toBe('');
        expect(['dashboard', 'pathway', 'planners', 'units', 'scraping']).toContain(link.target);
      }
    }
  });

  it('never throws on an unexpected result shape', () => {
    for (const workflow of allWorkflows) {
      expect(() => linksForWorkflow(workflow.id, {}, null)).not.toThrow();
      expect(() => linksForWorkflow(workflow.id, { studentId: 7 }, 'oops')).not.toThrow();
    }
    expect(linksForWorkflow('not_a_workflow', {}, {})).toEqual([]);
  });
});

describe('student answers', () => {
  it('open the dashboard on the tab that shows the result, and ask for the student to be prepared', () => {
    const [link] = linksForWorkflow('get_student_major', { studentId: '102780123' }, {});
    expect(link).toMatchObject({
      target: 'dashboard',
      section: 'ranked-planners',
      query: { studentId: '102780123', enrollMode: 'latest' },
      student: { studentId: '102780123', enrollMode: 'latest' },
    });
  });

  it.each([
    ['get_student_progress', 'graduation'],
    ['check_graduation_status', 'graduation'],
    ['get_student_failed_units', 'units'],
    ['get_student_units', 'units'],
    ['get_student_enrollment_history', 'enrollment'],
    ['get_available_units_for_student', 'analytics'],
  ])('%s jumps to %s', (id, section) => {
    const [link] = linksForWorkflow(id, { studentId: '1' }, {});
    expect(link.section).toBe(section);
  });

  it('keeps the enrollment mode the user asked for', () => {
    const [link] = linksForWorkflow('get_student_units', { studentId: '1', enrollMode: 'mpu' }, {});
    expect(link.query?.enrollMode).toBe('mpu');
    expect(link.student?.enrollMode).toBe('mpu');
  });

  it('offers a student view and a planner view together when comparing to a planner', () => {
    const links = linksForWorkflow('compare_student_to_planner', { studentId: '1', plannerId: PLANNER_A }, {});
    expect(links.map((l) => l.target)).toEqual(['dashboard', 'planners']);
    expect(links[0].student?.plannerId).toBe(PLANNER_A);
    expect(links[1].query).toEqual({ plannerId: PLANNER_A });
  });

  it('offers the pathway page for elective options, also with the student prepared', () => {
    const links = linksForWorkflow('get_student_elective_options', { studentId: '1', plannerId: PLANNER_A }, {});
    const pathway = links.find((l) => l.target === 'pathway');
    expect(pathway?.student).toMatchObject({ studentId: '1', plannerId: PLANNER_A });
  });

  it('gives no student button when the student is unknown', () => {
    expect(linksForWorkflow('get_student_major', {}, {})).toEqual([]);
  });

  it('opens each search result without preparing them all in advance', () => {
    const links = linksForWorkflow('search_student', { studentId: 'ann' }, {
      students: [{ studentId: '1', name: 'Ann Lee' }, { studentId: '2', name: 'Ann Tan' }],
    });
    expect(links).toHaveLength(2);
    expect(links.every((l) => l.student === undefined)).toBe(true);
    expect(links[0]).toMatchObject({ label: 'Open Ann Lee', target: 'dashboard', query: { studentId: '1' } });
  });
});

describe('planner and unit answers', () => {
  it('opens one planner', () => {
    expect(linksForWorkflow('get_planner_details', { plannerId: PLANNER_A }, { plannerId: PLANNER_A }))
      .toEqual([{ label: 'View planner', target: 'planners', query: { plannerId: PLANNER_A } }]);
  });

  it('opens both planners of a comparison, named', () => {
    const links = linksForWorkflow('compare_two_planners', { plannerId1: PLANNER_A, plannerId2: PLANNER_B }, { planner1Name: 'Software', planner2Name: 'Data' });
    expect(links.map((l) => l.label)).toEqual(['View Software', 'View Data']);
  });

  it('caps a long list of planners', () => {
    const planners = Array.from({ length: 12 }, (_, i) => ({ id: `id-${i}`, majorName: `Major ${i}`, intakeYear: 2024 }));
    const links = linksForWorkflow('find_planner_by_major', {}, { planners });
    expect(links).toHaveLength(MAX_LIST_LINKS);
  });

  it('opens the units page filtered to the unit', () => {
    expect(linksForWorkflow('get_unit_details', { unitCode: 'COS10009' }, {}))
      .toEqual([{ label: 'View COS10009', target: 'units', query: { q: 'COS10009' } }]);
  });

  it('adds the unit button to the planners that contain it', () => {
    const links = linksForWorkflow('get_planners_containing_unit', { unitCode: 'COS10009' }, { planners: [{ id: PLANNER_A, majorName: 'Software', intakeYear: 2025 }] });
    expect(links.map((l) => l.target)).toEqual(['planners', 'units']);
  });
});
