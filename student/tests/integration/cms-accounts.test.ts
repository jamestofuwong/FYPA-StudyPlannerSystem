/**
 * Accounts and permissions against a real PostgreSQL: the profile and password forms, the superadmin's account
 * management, and the rule that every content Server Action refuses an account that has no "edit" access.
 */
let currentUserId: string | null = null;
const cookieStore = new Map<string, string>();

jest.mock('@/lib/cms/session', () => ({
  getSession: async () => (currentUserId ? { sub: currentUserId, email: 'x', name: 'x' } : null),
  requireSession: async () => {
    if (!currentUserId) throw new Error('Unauthorized');
    return { sub: currentUserId, email: 'x', name: 'x' };
  },
}));
jest.mock('next/headers', () => ({
  cookies: async () => ({ set: (k: string, v: string) => cookieStore.set(k, v), get: (k: string) => (cookieStore.has(k) ? { value: cookieStore.get(k) } : undefined) }),
}));
jest.mock('next/cache', () => ({ revalidatePath: jest.fn(), revalidateTag: jest.fn(), unstable_cache: (fn: unknown) => fn }));
jest.mock('next/navigation', () => ({
  redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); },
  notFound: () => { throw new Error('NOT_FOUND'); },
}));
jest.mock('@/lib/catalog', () => ({ revalidateStudentCache: jest.fn(), STUDENT_CACHE: { units: 'u', planners: 'p', help: 'h' } }));

import { prisma } from '@/lib/prisma';
import { hashPassword, verifyAccessToken, verifyPassword } from '@/lib/cms/auth';
import { requirePageAccess, requireSuperadminPage } from '@/lib/cms/access';
import { changePassword, updateProfile } from '@/app/cms/(app)/account/actions';
import { createAccount, deleteAccount, updateAccount } from '@/app/cms/(app)/users/actions';
import { saveFaqItems } from '@/app/cms/(app)/help/faq/faq-actions';
import { saveHods } from '@/app/cms/(app)/help/hod/hod-actions';
import { saveGeneralEnquiries } from '@/app/cms/(app)/help/contacts/contacts-actions';
import { deleteUnit } from '@/app/cms/(app)/units/actions';
import { deletePlanner } from '@/app/cms/(app)/planners/actions';
import { resetRateLimit } from '@/lib/cms/rateLimit';

const PW = 'correct-horse-1';
let superId: string;
let editorId: string;
let viewerId: string;
let noneId: string;

async function mk(email: string, role: 'superadmin' | 'admin', permissions: object = {}, active = true) {
  return prisma.cmsUser.create({ data: { email, name: email.split('@')[0], password_hash: await hashPassword(PW), role, permissions, active } });
}

beforeEach(async () => {
  await prisma.cmsRefreshToken.deleteMany();
  await prisma.cmsUser.deleteMany();
  superId = (await mk('boss@example.com', 'superadmin')).id;
  editorId = (await mk('editor@example.com', 'admin', { units: 'edit', faq: 'edit', planners: 'view' })).id;
  viewerId = (await mk('viewer@example.com', 'admin', { units: 'view', faq: 'view', hod: 'view', contacts: 'view' })).id;
  noneId = (await mk('none@example.com', 'admin', {})).id;
  currentUserId = superId;
  cookieStore.clear();
  for (const k of [superId, editorId, viewerId, noneId]) resetRateLimit(`account:${k}`);
  jest.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => prisma.$disconnect());

const fd = (o: Record<string, string>) => Object.entries(o).reduce((f, [k, v]) => (f.set(k, v), f), new FormData());

describe('the migration', () => {
  test('the role, permissions and active columns exist with safe defaults', async () => {
    const u = await prisma.cmsUser.create({ data: { email: 'plain@example.com', name: 'Plain', password_hash: 'x' } });
    expect(u).toMatchObject({ role: 'admin', permissions: {}, active: true });
  });
});

describe('my account: profile', () => {
  test('changes name and email after the current password is confirmed, and issues a new session with the new details', async () => {
    currentUserId = editorId;
    const r = await updateProfile({ name: 'New Name', email: 'NEW@example.com', currentPassword: PW });
    expect(r.ok).toBe(true);
    expect(await prisma.cmsUser.findUnique({ where: { id: editorId } })).toMatchObject({ name: 'New Name', email: 'new@example.com' });
    expect(await verifyAccessToken(cookieStore.get('cms_access')!)).toMatchObject({ sub: editorId, email: 'new@example.com', name: 'New Name' });
  });
  test('refuses a wrong current password, and changes nothing', async () => {
    currentUserId = editorId;
    const r = await updateProfile({ name: 'X', email: 'x@example.com', currentPassword: 'wrong-password' });
    expect(r).toEqual({ ok: false, error: 'The current password is not correct.' });
    expect((await prisma.cmsUser.findUnique({ where: { id: editorId } }))!.email).toBe('editor@example.com');
  });
  test('refuses an email that another account uses, ignoring letter case', async () => {
    currentUserId = editorId;
    const r = await updateProfile({ name: 'E', email: 'BOSS@example.com', currentPassword: PW });
    expect(r).toMatchObject({ ok: false, error: 'Another account already uses this email.' });
  });
  test('keeping the same email is fine', async () => {
    currentUserId = editorId;
    expect((await updateProfile({ name: 'Renamed', email: 'editor@example.com', currentPassword: PW })).ok).toBe(true);
  });
  test('after five wrong passwords the form is locked', async () => {
    currentUserId = editorId;
    for (let i = 0; i < 5; i++) await updateProfile({ name: 'E', email: 'e@example.com', currentPassword: 'wrong-password' });
    const r = await updateProfile({ name: 'E', email: 'e@example.com', currentPassword: PW });
    expect(r).toMatchObject({ ok: false });
    expect((r as { error: string }).error).toMatch(/Too many attempts/);
  });
  test('a signed-out request is refused', async () => {
    currentUserId = null;
    expect(await updateProfile({ name: 'E', email: 'e@example.com', currentPassword: PW })).toMatchObject({ ok: false });
  });
});

describe('my account: password', () => {
  test('changes the password, ends the old sessions and keeps this one', async () => {
    currentUserId = editorId;
    await prisma.cmsRefreshToken.create({ data: { user_id: editorId, token_hash: 'old-device', expires_at: new Date(Date.now() + 1e9) } });
    const r = await changePassword({ currentPassword: PW, newPassword: 'brand-new-pass-9', confirmPassword: 'brand-new-pass-9' });
    expect(r.ok).toBe(true);
    const row = (await prisma.cmsUser.findUnique({ where: { id: editorId } }))!;
    expect(await verifyPassword('brand-new-pass-9', row.password_hash)).toBe(true);
    expect(await verifyPassword(PW, row.password_hash)).toBe(false);
    const tokens = await prisma.cmsRefreshToken.findMany({ where: { user_id: editorId } });
    expect(tokens).toHaveLength(1);
    expect(tokens[0].token_hash).not.toBe('old-device');
    expect(cookieStore.has('cms_refresh')).toBe(true);
  });
  test('refuses a wrong current password, a mismatch and a short password', async () => {
    currentUserId = editorId;
    expect((await changePassword({ currentPassword: 'nope-nope-nope', newPassword: 'brand-new-pass-9', confirmPassword: 'brand-new-pass-9' })).ok).toBe(false);
    expect((await changePassword({ currentPassword: PW, newPassword: 'brand-new-pass-9', confirmPassword: 'other-new-pass-9' })).ok).toBe(false);
    expect((await changePassword({ currentPassword: PW, newPassword: 'short', confirmPassword: 'short' })).ok).toBe(false);
    expect(await verifyPassword(PW, (await prisma.cmsUser.findUnique({ where: { id: editorId } }))!.password_hash)).toBe(true);
  });
});

describe('account management (superadmin only)', () => {
  test('a superadmin creates an admin with a permission per module, and the password is stored hashed', async () => {
    const r = await createAccount({ name: 'New Admin', email: 'New.Admin@example.com', password: 'a-long-password', role: 'admin', permissions: { units: 'edit', planners: 'view' } });
    expect(r.ok).toBe(true);
    const u = (await prisma.cmsUser.findUnique({ where: { email: 'new.admin@example.com' } }))!;
    expect(u).toMatchObject({ role: 'admin', active: true });
    expect(u.permissions).toMatchObject({ units: 'edit', planners: 'view', faq: 'none', hod: 'none', contacts: 'none' });
    expect(u.password_hash).not.toBe('a-long-password');
    expect(await verifyPassword('a-long-password', u.password_hash)).toBe(true);
  });
  test('a superadmin creates another superadmin, with no per-module settings stored', async () => {
    await createAccount({ name: 'Second', email: 'second@example.com', password: 'a-long-password', role: 'superadmin', permissions: { units: 'none' } });
    expect(await prisma.cmsUser.findUnique({ where: { email: 'second@example.com' } })).toMatchObject({ role: 'superadmin', permissions: {} });
  });
  test('refuses a duplicate email in any letter case', async () => {
    const r = await createAccount({ name: 'Dup', email: 'EDITOR@example.com', password: 'a-long-password', role: 'admin', permissions: {} });
    expect(r).toEqual({ ok: false, error: 'An account with this email already exists.' });
  });
  test.each(['editor', 'viewer', 'none'])('an admin (%s) cannot create, update or delete any account', async (who) => {
    currentUserId = { editor: editorId, viewer: viewerId, none: noneId }[who as 'editor']!;
    await expect(createAccount({ name: 'X', email: 'x@example.com', password: 'a-long-password', role: 'superadmin', permissions: {} })).rejects.toThrow(/Forbidden/);
    await expect(updateAccount(viewerId, { name: 'X', email: 'x@example.com', role: 'superadmin', permissions: {}, active: true })).rejects.toThrow(/Forbidden/);
    await expect(deleteAccount(superId)).rejects.toThrow(/Forbidden/);
    expect(await prisma.cmsUser.count()).toBe(4);
    expect((await prisma.cmsUser.findUnique({ where: { id: viewerId } }))!.role).toBe('admin');
  });
  test('a signed-out request cannot manage accounts', async () => {
    currentUserId = null;
    await expect(deleteAccount(noneId)).rejects.toThrow(/Unauthorized/);
  });
  test('changes the permissions of an admin, and the change is visible at once', async () => {
    await updateAccount(noneId, { name: 'none', email: 'none@example.com', role: 'admin', permissions: { hod: 'edit' }, active: true });
    currentUserId = noneId;
    const { canEdit } = await requirePageAccess('hod', 'edit');
    expect(canEdit).toBe(true);
    await expect(requirePageAccess('units')).rejects.toThrow('REDIRECT:/cms/no-access?module=units');
  });
  test('a new password and a deactivation end that person\'s sessions', async () => {
    await prisma.cmsRefreshToken.create({ data: { user_id: editorId, token_hash: 'h1', expires_at: new Date(Date.now() + 1e9) } });
    await updateAccount(editorId, { name: 'e', email: 'editor@example.com', role: 'admin', permissions: {}, active: true, newPassword: 'reset-by-boss-1' });
    expect(await prisma.cmsRefreshToken.count({ where: { user_id: editorId } })).toBe(0);
    expect(await verifyPassword('reset-by-boss-1', (await prisma.cmsUser.findUnique({ where: { id: editorId } }))!.password_hash)).toBe(true);
    await prisma.cmsRefreshToken.create({ data: { user_id: editorId, token_hash: 'h2', expires_at: new Date(Date.now() + 1e9) } });
    await updateAccount(editorId, { name: 'e', email: 'editor@example.com', role: 'admin', permissions: {}, active: false });
    expect(await prisma.cmsRefreshToken.count({ where: { user_id: editorId } })).toBe(0);
  });
  test('a deactivated account is signed out on its next request', async () => {
    await updateAccount(editorId, { name: 'e', email: 'editor@example.com', role: 'admin', permissions: { units: 'edit' }, active: false });
    currentUserId = editorId;
    await expect(requirePageAccess('units')).rejects.toThrow('REDIRECT:/cms/login');
  });
  test('a superadmin cannot remove their own role, deactivate or delete themselves', async () => {
    await mk('second@example.com', 'superadmin');
    expect(await updateAccount(superId, { name: 'b', email: 'boss@example.com', role: 'admin', permissions: {}, active: true })).toMatchObject({ ok: false });
    expect(await updateAccount(superId, { name: 'b', email: 'boss@example.com', role: 'superadmin', permissions: {}, active: false })).toMatchObject({ ok: false });
    expect(await deleteAccount(superId)).toMatchObject({ ok: false });
    expect(await prisma.cmsUser.findUnique({ where: { id: superId } })).toMatchObject({ role: 'superadmin', active: true });
  });
  test('the last active superadmin cannot be demoted, deactivated or deleted by another superadmin', async () => {
    const second = await mk('second@example.com', 'superadmin');
    await prisma.cmsUser.update({ where: { id: superId }, data: { active: false } });
    currentUserId = second.id;
    // boss is inactive, so second is the only active superadmin; second is "me", so the self rules apply as well
    expect(await deleteAccount(second.id)).toMatchObject({ ok: false });
    // an inactive superadmin may be edited and deleted freely
    expect((await deleteAccount(superId)).ok).toBe(true);
  });
  test('a superadmin may demote another superadmin when one more active superadmin remains', async () => {
    const second = await mk('second@example.com', 'superadmin');
    const r = await updateAccount(second.id, { name: 's', email: 'second@example.com', role: 'admin', permissions: { faq: 'view' }, active: true });
    expect(r.ok).toBe(true);
    expect(await prisma.cmsUser.findUnique({ where: { id: second.id } })).toMatchObject({ role: 'admin' });
  });
  test('deleting an account removes its sessions', async () => {
    await prisma.cmsRefreshToken.create({ data: { user_id: noneId, token_hash: 'h', expires_at: new Date(Date.now() + 1e9) } });
    expect((await deleteAccount(noneId)).ok).toBe(true);
    expect(await prisma.cmsRefreshToken.count({ where: { user_id: noneId } })).toBe(0);
  });
  test('the accounts pages are for superadmins only', async () => {
    await expect(requireSuperadminPage()).resolves.toMatchObject({ id: superId });
    currentUserId = editorId;
    await expect(requireSuperadminPage()).rejects.toThrow('REDIRECT:/cms/no-access?module=users');
  });
});

describe('content actions enforce the access level on the server', () => {
  const faq = [{ question: 'Q?', answer: 'A.', position: 1 }];
  const hod = [{ faculty: 'F', department: 'D', name: 'N', email: 'n@example.com', position: 1 }];

  test('"edit" may save, "view" and "none" may not, and nothing is written when refused', async () => {
    currentUserId = editorId;
    await saveFaqItems(faq);
    expect(await prisma.faqItem.count()).toBe(1);

    for (const id of [viewerId, noneId]) {
      currentUserId = id;
      await expect(saveFaqItems([{ question: 'Changed', answer: 'X', position: 1 }])).rejects.toThrow(/Forbidden/);
    }
    expect((await prisma.faqItem.findFirst())!.question).toBe('Q?');
  });
  test('a module is checked on its own: edit on FAQ does not give edit on heads of department', async () => {
    currentUserId = editorId;
    await expect(saveHods(hod)).rejects.toThrow(/Forbidden/);
    expect(await prisma.headOfDepartment.count()).toBe(0);
  });
  test('view-only accounts cannot save contacts, delete a unit or delete a planner', async () => {
    currentUserId = viewerId;
    await expect(saveGeneralEnquiries(fd({ venue_name: 'V', location: 'L', hours: 'H' }))).rejects.toThrow(/Forbidden/);
    await expect(deleteUnit('123e4567-e89b-42d3-a456-426614174000')).rejects.toThrow(/Forbidden/);
    currentUserId = editorId; // planners: view only
    await expect(deletePlanner('123e4567-e89b-42d3-a456-426614174000')).rejects.toThrow(/Forbidden/);
  });
  test('a superadmin may save any module', async () => {
    currentUserId = superId;
    await saveHods(hod);
    expect(await prisma.headOfDepartment.count()).toBe(1);
  });
  test('an inactive account is refused, and a signed-out request is unauthorised', async () => {
    await prisma.cmsUser.update({ where: { id: editorId }, data: { active: false } });
    currentUserId = editorId;
    await expect(saveFaqItems(faq)).rejects.toThrow(/Unauthorized/);
    currentUserId = null;
    await expect(saveFaqItems(faq)).rejects.toThrow(/Unauthorized/);
  });
  test('pages: "view" opens the page without edit rights, and "none" redirects to the no-access page', async () => {
    currentUserId = viewerId;
    expect(await requirePageAccess('units')).toMatchObject({ canEdit: false });
    await expect(requirePageAccess('units', 'edit')).rejects.toThrow('REDIRECT:/cms/no-access?module=units');
    await expect(requirePageAccess('planners')).rejects.toThrow('REDIRECT:/cms/no-access?module=planners');
  });
});
