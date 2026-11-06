/* eslint-disable @typescript-eslint/no-require-imports */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

// Both UAT plans are built from a data file. These checks keep a plan consistent when somebody edits it: every case points at a
// real requirement, every requirement is tested, the ids are unique, and the built plan and form are up to date.

type Case = { id: string; title: string; req: string[]; priority: string; steps: string[]; expected: string };
type Plan = {
  requirements: { id: string; priority: string }[];
  modules: { id: string; session: string; name: string; cases: Case[] }[];
  dataPack: { item: string; use: string }[];
  sessionNames: Record<string, string>;
};

const root = path.resolve(__dirname, '../..');
const plans: { name: string; data: Plan; prefix: string; md: string; html: string }[] = [
  { name: 'advisor (desktop app)', data: require('../../docs/uat/uat-data.js'), prefix: 'TC-', md: 'UAT.md', html: 'UAT-form.html' },
  { name: 'student (website and CMS)', data: require('../../docs/uat/uat-student-data.js'), prefix: 'SC-', md: 'UAT-student.md', html: 'UAT-student-form.html' },
];

describe.each(plans)('UAT plan: $name', ({ data, prefix, md, html }) => {
  const cases = data.modules.flatMap((m) => m.cases);

  test('case ids are unique, in order, and use the prefix of the plan', () => {
    const ids = cases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => expect(id.startsWith(prefix)).toBe(true));
    expect(ids).toEqual(ids.map((_, i) => `${prefix}${String(i + 1).padStart(2, '0')}`));
  });

  test('every case has steps, an expected result, a known priority and at least one requirement that exists', () => {
    const requirementIds = new Set(data.requirements.map((r) => r.id));
    for (const c of cases) {
      expect(c.title.trim()).not.toBe('');
      expect(c.steps.length).toBeGreaterThan(0);
      expect(c.expected.trim()).not.toBe('');
      expect(['Must', 'Agreed', 'Supporting']).toContain(c.priority);
      expect(c.req.length).toBeGreaterThan(0);
      c.req.forEach((r) => expect(requirementIds.has(r)).toBe(true));
    }
  });

  test('every requirement is tested by at least one case', () => {
    const tested = new Set(cases.flatMap((c) => c.req));
    data.requirements.forEach((r) => expect(tested.has(r.id)).toBe(true));
  });

  test('every module belongs to a named session and the data pack is not empty', () => {
    data.modules.forEach((m) => expect(Object.keys(data.sessionNames)).toContain(m.session));
    expect(data.dataPack.length).toBeGreaterThan(0);
  });

  test('the built plan and form exist and list every case (run npm run docs:uat if this fails)', () => {
    expect(existsSync(path.join(root, 'docs', md))).toBe(true);
    expect(existsSync(path.join(root, 'docs', html))).toBe(true);
    const plan = readFileSync(path.join(root, 'docs', md), 'utf8');
    const form = readFileSync(path.join(root, 'docs', html), 'utf8');
    for (const c of cases) {
      expect(plan).toContain(`### ${c.id}:`);
      expect(form).toContain(`name="${c.id.toLowerCase()}"`);
    }
  });
});
