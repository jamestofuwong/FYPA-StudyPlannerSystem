/**
 * Behaviour of the router that goes beyond picking a workflow: planner names, "this semester", replies that are not clean,
 * requests to change data, and messages that no workflow can answer. The model is replaced by a stand-in.
 */
jest.mock('puppeteer', () => ({ __esModule: true, default: { launch: jest.fn() } }));

import { allWorkflows } from '../../../core/services/copilot/workflowRegistry';
import { routeAndExtract, isWriteRequest } from '../../../core/services/copilot/copilotService';
import { findPlannerMentions } from '../../../core/services/copilot/plannerNames';
import { semesterOfDate } from '../../../core/services/copilot/semester';
import type { PlannerRef } from '../../../core/services/copilot/types';

const planner = (id: string, major: string, year: number, month: number | null = 2): PlannerRef =>
  ({ id, majorName: major, courseName: 'Bachelor of Computer Science', intakeYear: year, intakeMonth: month });

const CATALOGUE: PlannerRef[] = [
  planner('ds-2024', 'Data Science', 2024), planner('ds-2025', 'Data Science', 2025), planner('ds-2026', 'Data Science', 2026),
  planner('cy-2025', 'Cybersecurity', 2025), planner('cy-2026', 'Cybersecurity', 2026),
  planner('ai-2026', 'Artificial Intelligence', 2026),
  planner('iot-2025', 'Internet of Things', 2025),
  planner('sd-2026', 'Software Development', 2026),
  { id: 'gen-2025', majorName: null, courseName: 'Diploma of Information Technology', intakeYear: 2025, intakeMonth: 3 },
];

let calls = 0;
/** A stand-in model. `answer` is a workflow id, or a function of the ids that it is shown. */
function mockModel(answer: string | ((ids: string[]) => string)) {
  calls = 0;
  global.fetch = jest.fn(async (_u: unknown, init: { body: string }) => {
    calls++;
    const prompt: string = JSON.parse(init.body).prompt;
    const ids = prompt.split('Workflows:\n')[1].split('\n\nUser message:')[0].split('\n').map((l) => l.split(':')[0]);
    return { ok: true, json: async () => ({ response: typeof answer === 'function' ? answer(ids) : answer }), text: async () => '' } as Response;
  }) as unknown as typeof fetch;
}
const ask = (text: string, opts: Parameters<typeof routeAndExtract>[2] = {}) =>
  routeAndExtract([{ role: 'user', content: text }], allWorkflows, opts);
const withPlanners = { loadPlanners: async () => CATALOGUE };

beforeAll(() => { jest.spyOn(console, 'log').mockImplementation(() => {}); });
afterAll(() => jest.restoreAllMocks());

describe('planner names', () => {
  test.each([
    ['the Data Science planner', 'Data Science'],
    ['data science', 'Data Science'],
    ['DATA SCIENCE', 'Data Science'],
    ['cyber security', 'Cybersecurity'],
    ['cybersecurity', 'Cybersecurity'],
    ['Internet of Things', 'Internet of Things'],
    ['the IoT major', 'Internet of Things'],
    ['the AI planner', 'Artificial Intelligence'],
    ['artificial intelligence', 'Artificial Intelligence'],
    ['software development', 'Software Development'],
  ])('"%s" is found as %s', (text, name) => {
    expect(findPlannerMentions(`show me ${text}`, CATALOGUE).map((m) => m.name)).toEqual([name]);
  });

  test('a message without a planner name finds nothing', () => {
    expect(findPlannerMentions('Which units has 102780123 failed?', CATALOGUE)).toEqual([]);
    expect(findPlannerMentions('what is the capital of France', CATALOGUE)).toEqual([]);
  });

  test('a year chooses the intake; without a year the latest intake is used and the note says so', () => {
    const named = findPlannerMentions('data science planner for 2024', CATALOGUE)[0];
    expect(named.planner.id).toBe('ds-2024');
    expect(named.assumedLatest).toBe(false);
    const latest = findPlannerMentions('data science planner', CATALOGUE)[0];
    expect(latest.planner.id).toBe('ds-2026');
    expect(latest.assumedLatest).toBe(true);
  });

  test('a planner with only one intake is not reported as a guess', () => {
    expect(findPlannerMentions('internet of things planner', CATALOGUE)[0].assumedLatest).toBe(false);
  });

  test('two names are returned in the order that they are written', () => {
    expect(findPlannerMentions('compare cybersecurity and data science', CATALOGUE).map((m) => m.planner.id)).toEqual(['cy-2026', 'ds-2026']);
    expect(findPlannerMentions('compare data science and cybersecurity', CATALOGUE).map((m) => m.planner.id)).toEqual(['ds-2026', 'cy-2026']);
  });

  test('a planner without a major is found by its course name', () => {
    expect(findPlannerMentions('the diploma of information technology planner', CATALOGUE)[0].planner.id).toBe('gen-2025');
  });

  test('the course name that all majors share does not choose a major', () => {
    expect(findPlannerMentions('the bachelor of computer science planner', CATALOGUE)).toEqual([]);
  });

  test('an empty catalogue finds nothing', () => {
    expect(findPlannerMentions('data science', [])).toEqual([]);
  });
});

describe('planner names in the router', () => {
  test('a student compared to a named planner gets the planner id and a note', async () => {
    mockModel('compare_student_to_planner');
    const r = await ask('Compare 102780123 to the Data Science planner', withPlanners);
    expect(r.workflowId).toBe('compare_student_to_planner');
    expect(r.params).toMatchObject({ studentId: '102780123', plannerId: 'ds-2026' });
    expect(r.missingParams).toEqual([]);
    expect(r.notes?.[0]).toMatch(/Data Science.*2026.*latest/);
  });

  test('a year in the message chooses the intake', async () => {
    mockModel('get_planner_details');
    const r = await ask('show me the data science planner for 2024', withPlanners);
    expect(r.params.plannerId).toBe('ds-2024');
  });

  test('two planners fill both parameters of a comparison', async () => {
    mockModel('compare_two_planners');
    const r = await ask('Compare the Data Science planner and the Cybersecurity planner', withPlanners);
    expect(r.params).toMatchObject({ plannerId1: 'ds-2026', plannerId2: 'cy-2026' });
    expect(r.missingParams).toEqual([]);
  });

  test('"switch to" uses the last planner that is named as the new planner', async () => {
    mockModel('get_plan_switch_impact');
    const r = await ask('What happens if 102780123 switches to Cybersecurity?', withPlanners);
    expect(r.params).toMatchObject({ studentId: '102780123', newPlannerId: 'cy-2026' });
  });

  test('a planner id in the message wins over a name', async () => {
    mockModel('get_planner_details');
    const id = '3f2b8c1e-9d4a-4e7b-a1c5-6d8e2f0b7a93';
    const r = await ask(`details of ${id} (not data science)`, withPlanners);
    expect(r.params.plannerId).toBe(id);
    expect(r.notes).toBeUndefined();
  });

  test('without a planner name the planner is asked for', async () => {
    mockModel('is_student_on_track');
    const r = await ask('Is 102780123 on track?', withPlanners);
    expect(r.missingParams).toEqual(['plannerId']);
  });

  test('a name that no planner has leaves the planner missing', async () => {
    mockModel('get_planner_details');
    const r = await ask('show me the Underwater Basket Weaving planner', withPlanners);
    expect(r.missingParams).toEqual(['plannerId']);
  });

  test('the planners are loaded only when the workflow needs one', async () => {
    const load = jest.fn(async () => CATALOGUE);
    mockModel('get_student_major');
    await ask('What major is 102780123 in?', { loadPlanners: load });
    expect(load).not.toHaveBeenCalled();
  });

  test('if the planners cannot be loaded, the question still gets an answer that asks for the planner', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockModel('get_planner_details');
    const r = await ask('show me the data science planner', { loadPlanners: async () => { throw new Error('db down'); } });
    expect(r.canHandle).toBe(true);
    expect(r.missingParams).toEqual(['plannerId']);
  });
});

describe('"this semester"', () => {
  test.each([
    [new Date('2026-03-10'), 1], [new Date('2026-06-30'), 1], [new Date('2026-07-01'), 2], [new Date('2026-10-26'), 2], [new Date('2026-01-05'), 1],
  ])('%s is semester %i', (date, sem) => {
    expect(semesterOfDate(date)).toBe(sem);
  });

  test.each([
    ['is COS20007 offered this semester?', new Date('2026-03-10'), 1],
    ['is COS20007 offered this semester?', new Date('2026-10-26'), 2],
    ['is COS20007 running next semester', new Date('2026-03-10'), 2],
    ['is COS20007 running next sem', new Date('2026-10-26'), 1],
    ['does COS20007 run in the current semester', new Date('2026-10-26'), 2],
    ['is COS20007 offered in sem 2', new Date('2026-03-10'), 2],
    ['is COS20007 offered in sem2', new Date('2026-03-10'), 2],
    ['is COS20007 offered in semester two', new Date('2026-03-10'), 2],
    ['is COS20007 offered in the 1st semester', new Date('2026-10-26'), 1],
    ['is COS20007 offered in the summer term', new Date('2026-10-26'), 3],
    ['is COS20007 offered in winter', new Date('2026-10-26'), 4],
  ])('"%s" on %s means semester %i', async (text, now, expected) => {
    mockModel('is_unit_offered_this_semester');
    const r = await ask(text, { now });
    expect(r.params).toMatchObject({ unitCode: 'COS20007', semester: expected });
  });

  test('a named semester wins over "this semester"', async () => {
    mockModel('is_unit_offered_this_semester');
    const r = await ask('is COS20007 offered this semester, I mean semester 1', { now: new Date('2026-10-26') });
    expect(r.params.semester).toBe(1);
  });

  test('with no semester word at all the semester is asked for', async () => {
    mockModel('is_unit_offered_this_semester');
    const r = await ask('is COS20007 offered?', { now: new Date('2026-10-26') });
    expect(r.missingParams).toEqual(['semester']);
  });
});

describe('major names and prefixes', () => {
  test.each([
    ['Find the planner for Data Science', 'Data Science'],
    ['is there a planner for "Cybersecurity"', 'Cybersecurity'],
    ['What is the planner ID for the Software Development major?', 'Software Development'],
    ['I need the planner for artificial intelligence, 2025 intake', 'artificial intelligence'],
    ['where can I find the plan for the Internet of Things major', 'Internet of Things'],
    ['which planner is there for data science', 'data science'],
  ])('"%s" gives the major "%s"', async (text, name) => {
    mockModel('find_planner_by_major');
    const r = await ask(text);
    expect(r.params.majorName).toBe(name);
  });

  test.each([
    ['List all COS units', 'COS'], ['show me the swe units', 'SWE'], ['Which units start with ICT?', 'ICT'],
    ['what mpu units do we have', 'MPU'], ['units that begin with cos', 'COS'],
  ])('"%s" gives the prefix %s', async (text, prefix) => {
    mockModel('get_units_by_prefix');
    const r = await ask(text);
    expect(r.params.prefix).toBe(prefix);
  });

  test('common words before "units" are not taken as a prefix', async () => {
    mockModel('get_units_by_prefix');
    for (const text of ['list the units', 'show me all units', 'which core units are there']) {
      const r = await ask(text);
      expect(r.params.prefix).toBeUndefined();
    }
  });
});

describe('what the model writes back', () => {
  test.each([
    ['get_units_by_semester:1', 'get_units_by_semester'],
    ['get_units_by_semester(1)', 'get_units_by_semester'],
    ['`get_units_by_semester`', 'get_units_by_semester'],
    ['**get_units_by_semester**', 'get_units_by_semester'],
    ['GET_UNITS_BY_SEMESTER', 'get_units_by_semester'],
    ['Workflow ID: get_units_by_semester', 'get_units_by_semester'],
    ['The best match is get_units_by_semester.', 'get_units_by_semester'],
    ['get_units_by_semester\nget_unit_details', 'get_units_by_semester'],
    ['<think>maybe</think>\nget_units_by_semester', 'get_units_by_semester'],
  ])('%j is understood as %s', async (answer, id) => {
    mockModel(answer);
    const r = await ask('which units run in semester 2');
    expect(r.workflowId).toBe(id);
    expect(r.params.semester).toBe(2);
  });

  test.each(['none', 'None.', '"none"', '', 'get_planet_details', 'I do not know'])('%j is a refusal', async (answer) => {
    mockModel(answer);
    expect((await ask('which units run in semester 2')).canHandle).toBe(false);
  });

  test('an id that the model was not shown is refused, even when it is a real workflow', async () => {
    mockModel('get_portal_status');
    expect((await ask('which units run in semester 2')).canHandle).toBe(false);
  });

  test('a word that contains an id is not an id', async () => {
    mockModel('xget_units_by_semesterx');
    expect((await ask('which units run in semester 2')).canHandle).toBe(false);
  });
});

describe('requests to change data', () => {
  test.each([
    'Change the grade of 102780123 in COS10009 to HD',
    'delete the Data Science planner',
    'please update the planner for 2025',
    'Can you remove COS10009 from the Data Science planner?',
    'could you add a unit to the planner',
    'I want to edit the grade of 102780123',
    'rename the cybersecurity planner',
    'Email the student about their results',
    'Set the threshold to 80',
    'create a new planner',
  ])('"%s" is refused without a model call', async (text) => {
    mockModel('get_student_grade_for_unit');
    const r = await ask(text);
    expect(isWriteRequest(text)).toBe(true);
    expect(r).toMatchObject({ canHandle: false, workflowId: null, refusal: 'read_only' });
    expect(calls).toBe(0);
  });

  test.each([
    'Can 102780123 add COS10009 next semester?',
    'What grade did 102780123 get in COS10009?',
    'Which units can be removed from the plan?',
    'what happens if 102780123 changes major',
    'Did 102780123 update their enrollment?',
    'Show the planner that was created in 2025',
    'How do I change my password',
  ])('"%s" is a question, not a request to change data', (text) => {
    expect(isWriteRequest(text)).toBe(false);
  });
});

describe('messages that no workflow can answer', () => {
  test.each([
    'What is the weather like today?', 'Tell me a joke', 'What is the capital of France?', 'How do I cook nasi lemak?',
  ])('"%s" is answered without calling the model', async (text) => {
    mockModel('list_planners');
    const r = await ask(text);
    expect(r.canHandle).toBe(false);
    expect(calls).toBe(0);
  });

  test('an empty message is refused without a model call', async () => {
    mockModel('list_planners');
    expect((await ask('')).canHandle).toBe(false);
    expect(calls).toBe(0);
  });

  test('a message that is only a student id is offered to the student workflows', async () => {
    mockModel((ids) => ids[0]);
    const r = await ask('102780123');
    expect(r.canHandle).toBe(true);
    expect(r.params.studentId).toBe('102780123');
  });

  test('a message that is only a unit code is offered to the unit workflows', async () => {
    const takesCode = (id: string) => allWorkflows.find((w) => w.id === id)!.params.some((p) => p.name === 'unitCode');
    let shown: string[] = [];
    mockModel((ids) => { shown = ids; return ids.find(takesCode) ?? 'none'; });
    const r = await ask('COS30019');
    expect(shown.filter(takesCode).length).toBeGreaterThanOrEqual(2);
    expect(r.params.unitCode).toBe('COS30019');
  });
});

describe('what the model is shown', () => {
  test('at most 10 workflows, and at least 4 when something matched', async () => {
    let shown: string[] = [];
    mockModel((ids) => { shown = ids; return ids[0]; });
    await ask('which units has 102780123 failed in the planner');
    expect(shown.length).toBeLessThanOrEqual(10);
    expect(shown.length).toBeGreaterThanOrEqual(4);
  });

  test('a unit code points at the unit workflows', async () => {
    let shown: string[] = [];
    mockModel((ids) => { shown = ids; return ids[0]; });
    await ask('where is ict10001 used');
    expect(shown).toContain('get_planners_containing_unit');
  });

  test('a year points at the intake year workflow', async () => {
    let shown: string[] = [];
    mockModel((ids) => { shown = ids; return ids[0]; });
    await ask('what majors are available for 2024');
    expect(shown).toContain('get_planners_by_intake_year');
  });

  test('everyday words that the description lacks still find the workflow (keywords)', async () => {
    const cases: [string, string][] = [
      ['show me the transcript of 102780123', 'get_student_units'],
      ['Did 102780123 change course at any point?', 'get_student_enrollment_history'],
      ['what does COS20007 unlock', 'get_units_requiring_unit'],
      ['Has 102780123 met all the requirements for the degree?', 'check_graduation_status'],
      ['is 102780123 keeping up with the plan', 'is_student_on_track'],
    ];
    for (const [text, id] of cases) {
      let shown: string[] = [];
      mockModel((ids) => { shown = ids; return ids[0]; });
      await ask(text);
      expect({ text, shown: shown.includes(id) }).toEqual({ text, shown: true });
    }
  });
});
