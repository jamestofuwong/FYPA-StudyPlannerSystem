import {
  LoginSchema, UnitSchema, PlannerSchema, FaqListSchema, ItHelpDeskSchema, HodSchema, GeneratePlanSchema,
} from '@/lib/cms/schemas';

const uuid = '123e4567-e89b-42d3-a456-426614174000';
const messages = (r: { success: boolean; error?: { issues: { message: string }[] } }) => (r.success ? [] : r.error!.issues.map((i) => i.message));

describe('LoginSchema', () => {
  test('trims the email and keeps the password as typed', () => {
    const r = LoginSchema.parse({ email: '  editor@example.com ', password: ' pass word ' });
    expect(r).toEqual({ email: 'editor@example.com', password: ' pass word ' });
  });
  test.each([
    [{ email: 'not-an-email', password: 'x' }, 'Invalid email address'],
    [{ email: 'a@b.co', password: '' }, 'Password is required'],
    [{ email: 'a@b.co', password: 'x'.repeat(129) }, 'Password too long'],
  ])('rejects %j', (input, message) => expect(messages(LoginSchema.safeParse(input))).toContain(message));
  test('rejects a body with no fields, and non-string values', () => {
    expect(LoginSchema.safeParse({}).success).toBe(false);
    expect(LoginSchema.safeParse({ email: { $ne: null }, password: { $ne: null } }).success).toBe(false);
  });
});

const unit = (over: Record<string, unknown> = {}) => ({
  code: 'ICT30120', name: 'Project', credit_points: 12.5, year_level: 3, availability: [1, 2], learning_outcomes: [], content_topics: [], assessments: [], requisites: [], ...over,
});

describe('UnitSchema', () => {
  test('accepts a complete unit, with a four-digit or a five-digit code', () => {
    for (const code of ['ICT30120', 'MPU3142']) expect(UnitSchema.safeParse(unit({ code })).success).toBe(true);
  });
  test.each(['ict30120', 'ICT3', 'ICT3012000', 'I30120', 'ICTXX30120', '30120ICT', 'ICT 30120', 'ICT30120; DROP TABLE units'])('refuses the unit code %j', (code) => {
    expect(UnitSchema.safeParse(unit({ code })).success).toBe(false);
  });
  test('year level is 1 to 4 and credit points are at least 0.5', () => {
    expect(UnitSchema.safeParse(unit({ year_level: 0 })).success).toBe(false);
    expect(UnitSchema.safeParse(unit({ year_level: 5 })).success).toBe(false);
    expect(UnitSchema.safeParse(unit({ credit_points: 0 })).success).toBe(false);
  });
  test('assessment weights must add up to 100, but unknown weights are allowed', () => {
    const a = (weight: number | null, position: number) => ({ type: 'Exam', weight, ulos: [1], position });
    expect(UnitSchema.safeParse(unit({ assessments: [a(60, 1), a(40, 2)] })).success).toBe(true);
    expect(messages(UnitSchema.safeParse(unit({ assessments: [a(60, 1), a(30, 2)] })))).toContain('Assessment weights must sum to 100%');
    expect(UnitSchema.safeParse(unit({ assessments: [a(60, 1), a(null, 2)] })).success).toBe(true);
  });
  test('a requisite points at a unit by id and has one of three kinds', () => {
    expect(UnitSchema.safeParse(unit({ requisites: [{ requisite_type: 'prerequisite', requisite_unit_id: uuid }] })).success).toBe(true);
    expect(UnitSchema.safeParse(unit({ requisites: [{ requisite_type: 'friend', requisite_unit_id: uuid }] })).success).toBe(false);
    expect(UnitSchema.safeParse(unit({ requisites: [{ requisite_type: 'prerequisite', requisite_unit_id: 'COS10009' }] })).success).toBe(false);
  });
  test('an overview longer than 20,000 characters is refused', () => {
    expect(UnitSchema.safeParse(unit({ overview: 'x'.repeat(20001) })).success).toBe(false);
  });
});

const planner = (over: Record<string, unknown> = {}) => ({
  course_name: 'Bachelor of Computer Science', intake_month: 3, intake_year: 2026, duration_years: 3, semesters: [], elective_pool: [], ...over,
});

describe('PlannerSchema', () => {
  test('accepts a planner', () => expect(PlannerSchema.safeParse(planner()).success).toBe(true));
  test.each([[{ intake_month: 0 }], [{ intake_month: 13 }], [{ intake_year: 1999 }], [{ intake_year: 2101 }], [{ duration_years: 0 }], [{ duration_years: 7 }], [{ course_name: '   ' }], [{ intake_month: 2.5 }]])(
    'refuses %j', (over) => expect(PlannerSchema.safeParse(planner(over)).success).toBe(false));
  test('a placed unit must have one of the six categories', () => {
    const sem = (category: string) => [{ year_number: 1, sem_number: 1, label: 'Y1S1', units: [{ unit_id: uuid, category, is_elective_slot: false, position: 0 }] }];
    expect(PlannerSchema.safeParse(planner({ semesters: sem('core') })).success).toBe(true);
    expect(PlannerSchema.safeParse(planner({ semesters: sem('bonus') })).success).toBe(false);
  });
  test('an empty elective slot may have no unit, a placed unit must have a valid id', () => {
    const sem = (unit_id: string | null) => [{ year_number: 1, sem_number: 1, label: 'Y1S1', units: [{ unit_id, category: 'elective', is_elective_slot: true, position: 0 }] }];
    expect(PlannerSchema.safeParse(planner({ semesters: sem(null) })).success).toBe(true);
    expect(PlannerSchema.safeParse(planner({ semesters: sem('not-a-uuid') })).success).toBe(false);
  });
});

describe('help content', () => {
  test('the FAQ needs at least one item, each with a question and an answer', () => {
    expect(FaqListSchema.safeParse([]).success).toBe(false);
    expect(FaqListSchema.safeParse([{ question: 'Q?', answer: 'A.', position: 1 }]).success).toBe(true);
    expect(FaqListSchema.safeParse([{ question: ' ', answer: 'A.', position: 1 }]).success).toBe(false);
  });
  test('contact e-mail addresses must be valid', () => {
    const desk = { telephone: '1', email: 'it@example.com', location: 'L', hours_mon_thu: 'x', hours_fri: 'y' };
    expect(ItHelpDeskSchema.safeParse(desk).success).toBe(true);
    expect(ItHelpDeskSchema.safeParse({ ...desk, email: 'it@' }).success).toBe(false);
    expect(HodSchema.safeParse({ faculty: 'F', department: 'D', name: 'N', email: 'bad', position: 1 }).success).toBe(false);
  });
});

describe('GeneratePlanSchema', () => {
  test('accepts a planner id and a list of completed units', () => {
    expect(GeneratePlanSchema.safeParse({ config: { plannerId: uuid }, completedUnitCodes: ['COS10009'] }).success).toBe(true);
  });
  test('refuses an empty body, a planner id that is not a UUID, and a blank unit code', () => {
    expect(GeneratePlanSchema.safeParse({}).success).toBe(false);
    expect(GeneratePlanSchema.safeParse({ config: { plannerId: '1; drop' }, completedUnitCodes: [] }).success).toBe(false);
    expect(GeneratePlanSchema.safeParse({ config: { plannerId: uuid }, completedUnitCodes: ['  '] }).success).toBe(false);
  });
});
