// Who may do what in the CMS. Pure functions, no database, so that the rules are easy to test.
//
// A superadmin has full access to every module and manages the accounts. An admin has one access level per module.

export const CMS_MODULES = [
  { key: 'units', label: 'Units', href: '/cms/units' },
  { key: 'planners', label: 'Planners', href: '/cms/planners' },
  { key: 'faq', label: 'FAQ', href: '/cms/help/faq' },
  { key: 'contacts', label: 'Contacts', href: '/cms/help/contacts' },
  { key: 'hod', label: 'Heads of Department', href: '/cms/help/hod' },
] as const

export type CmsModule = (typeof CMS_MODULES)[number]['key']
export type AccessLevel = 'none' | 'view' | 'edit'
export type CmsRoleName = 'superadmin' | 'admin'
export type Permissions = Record<CmsModule, AccessLevel>

export const ACCESS_LEVELS: readonly AccessLevel[] = ['none', 'view', 'edit']
export const ACCESS_LABELS: Record<AccessLevel, string> = { none: 'No access', view: 'View only', edit: 'View and edit' }

const MODULE_KEYS = CMS_MODULES.map(m => m.key) as CmsModule[]
const RANK: Record<AccessLevel, number> = { none: 0, view: 1, edit: 2 }

export function isAccessLevel(v: unknown): v is AccessLevel {
  return v === 'none' || v === 'view' || v === 'edit'
}

/** Reads the stored JSON. Anything missing or invalid becomes "none", so a damaged value never grants access. */
export function parsePermissions(raw: unknown): Permissions {
  const obj = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const out = {} as Permissions
  for (const key of MODULE_KEYS) out[key] = isAccessLevel(obj[key]) ? obj[key] : 'none'
  return out
}

export function fullAccess(): Permissions {
  return Object.fromEntries(MODULE_KEYS.map(k => [k, 'edit'])) as Permissions
}

export interface AccessSubject {
  role: CmsRoleName
  active: boolean
  permissions: unknown
}

/** The access level of an account for one module. An inactive account has none. */
export function accessFor(user: AccessSubject, module: CmsModule): AccessLevel {
  if (!user.active) return 'none'
  if (user.role === 'superadmin') return 'edit'
  return parsePermissions(user.permissions)[module]
}

export function hasAccess(user: AccessSubject, module: CmsModule, needed: Exclude<AccessLevel, 'none'>): boolean {
  return RANK[accessFor(user, module)] >= RANK[needed]
}

/** The permissions to store for an account: a superadmin keeps the empty object, because the role already grants all. */
export function permissionsToStore(role: CmsRoleName, permissions: unknown): Permissions | Record<string, never> {
  return role === 'superadmin' ? {} : parsePermissions(permissions)
}

export function isCmsModule(v: string): v is CmsModule {
  return (MODULE_KEYS as string[]).includes(v)
}
