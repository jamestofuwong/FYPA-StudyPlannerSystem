import {
  CMS_MODULES, accessFor, fullAccess, hasAccess, parsePermissions, permissionsToStore, isCmsModule,
} from '@/lib/cms/permissions';
import { CreateAccountSchema, ChangePasswordSchema, ProfileSchema, UpdateAccountSchema } from '@/lib/cms/schemas';

const admin = (permissions: unknown, active = true) => ({ role: 'admin' as const, active, permissions });

describe('parsePermissions', () => {
  test('a missing module is "none"', () => {
    expect(parsePermissions({})).toEqual({ units: 'none', planners: 'none', faq: 'none', contacts: 'none', hod: 'none' });
  });
  test('keeps valid levels and drops unknown modules', () => {
    expect(parsePermissions({ units: 'edit', faq: 'view', secret: 'edit' })).toMatchObject({ units: 'edit', faq: 'view', planners: 'none' });
    expect(Object.keys(parsePermissions({ secret: 'edit' }))).toEqual(CMS_MODULES.map((m) => m.key));
  });
  test.each([null, undefined, 'edit', 5, [], [['units', 'edit']], { units: 'EDIT' }, { units: true }, { units: 2 }])(
    'a damaged value (%j) never grants access', (raw) => {
      expect(Object.values(parsePermissions(raw)).every((v) => v === 'none')).toBe(true);
    });
});

describe('accessFor and hasAccess', () => {
  test('a superadmin may edit every module, whatever is stored', () => {
    for (const m of CMS_MODULES) expect(accessFor({ role: 'superadmin', active: true, permissions: {} }, m.key)).toBe('edit');
  });
  test('an inactive account has no access, even a superadmin', () => {
    expect(accessFor({ role: 'superadmin', active: false, permissions: {} }, 'units')).toBe('none');
    expect(accessFor(admin({ units: 'edit' }, false), 'units')).toBe('none');
  });
  test('an admin gets exactly the level that is set for each module', () => {
    const u = admin({ units: 'edit', planners: 'view', faq: 'none' });
    expect(accessFor(u, 'units')).toBe('edit');
    expect(accessFor(u, 'planners')).toBe('view');
    expect(accessFor(u, 'faq')).toBe('none');
    expect(accessFor(u, 'hod')).toBe('none');
  });
  test('"view" allows viewing and not editing; "edit" allows both; "none" allows neither', () => {
    const u = admin({ units: 'edit', planners: 'view' });
    expect([hasAccess(u, 'units', 'view'), hasAccess(u, 'units', 'edit')]).toEqual([true, true]);
    expect([hasAccess(u, 'planners', 'view'), hasAccess(u, 'planners', 'edit')]).toEqual([true, false]);
    expect([hasAccess(u, 'faq', 'view'), hasAccess(u, 'faq', 'edit')]).toEqual([false, false]);
  });
});

describe('what is stored', () => {
  test('a superadmin stores no per-module settings, an admin stores a complete set', () => {
    expect(permissionsToStore('superadmin', { units: 'view' })).toEqual({});
    expect(permissionsToStore('admin', { units: 'view' })).toEqual({ ...parsePermissions({}), units: 'view' });
  });
  test('fullAccess lists every module as edit', () => {
    expect(Object.values(fullAccess())).toEqual(CMS_MODULES.map(() => 'edit'));
  });
  test('isCmsModule only accepts the known modules', () => {
    expect(isCmsModule('units')).toBe(true);
    expect(isCmsModule('users')).toBe(false);
  });
});

describe('account schemas', () => {
  test('a new account needs a name, a valid email, a long password and a role; the email is lower-cased', () => {
    const ok = CreateAccountSchema.parse({ name: ' Ann ', email: ' ANN@Example.com ', password: 'long-enough-1', role: 'admin', permissions: { units: 'view' } });
    expect(ok).toMatchObject({ name: 'Ann', email: 'ann@example.com' });
    for (const bad of [
      { name: '', email: 'a@b.co', password: 'long-enough-1', role: 'admin' },
      { name: 'A', email: 'nope', password: 'long-enough-1', role: 'admin' },
      { name: 'A', email: 'a@b.co', password: 'short', role: 'admin' },
      { name: 'A', email: 'a@b.co', password: 'long-enough-1', role: 'owner' },
      { name: 'A', email: 'a@b.co', password: 'long-enough-1', role: 'admin', permissions: { units: 'write' } },
    ]) expect(CreateAccountSchema.safeParse(bad).success).toBe(false);
  });
  test('an update may leave the password empty, and may not set a short one', () => {
    const base = { name: 'A', email: 'a@b.co', role: 'admin', permissions: {}, active: true };
    expect(UpdateAccountSchema.safeParse({ ...base, newPassword: '' }).success).toBe(true);
    expect(UpdateAccountSchema.safeParse({ ...base }).success).toBe(true);
    expect(UpdateAccountSchema.safeParse({ ...base, newPassword: 'short' }).success).toBe(false);
  });
  test('the profile form needs the current password', () => {
    expect(ProfileSchema.safeParse({ name: 'A', email: 'a@b.co', currentPassword: '' }).success).toBe(false);
  });
  test('a new password must be long, confirmed, and different from the old one', () => {
    const base = { currentPassword: 'old-password-1', newPassword: 'new-password-1', confirmPassword: 'new-password-1' };
    expect(ChangePasswordSchema.safeParse(base).success).toBe(true);
    expect(ChangePasswordSchema.safeParse({ ...base, newPassword: 'short', confirmPassword: 'short' }).success).toBe(false);
    expect(ChangePasswordSchema.safeParse({ ...base, confirmPassword: 'different-1' }).success).toBe(false);
    expect(ChangePasswordSchema.safeParse({ ...base, newPassword: 'old-password-1', confirmPassword: 'old-password-1' }).success).toBe(false);
  });
});
