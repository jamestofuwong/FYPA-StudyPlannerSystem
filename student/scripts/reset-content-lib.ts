// Pure helpers of scripts/reset-content.ts, kept apart so tests can load them without a database.

/** Tables the reset empties, child tables first so that no foreign key blocks a delete. */
export const CLEAR_ORDER = [
  { model: 'ElectiveGroupUnit', delegate: 'electiveGroupUnit' },
  { model: 'MinorUnit', delegate: 'minorUnit' },
  { model: 'TemplateUnit', delegate: 'templateUnit' },
  { model: 'ElectiveGroup', delegate: 'electiveGroup' },
  { model: 'Minor', delegate: 'minor' },
  { model: 'PlannerTemplate', delegate: 'plannerTemplate' },
  { model: 'UnitRequisiteCondition', delegate: 'unitRequisiteCondition' },
  { model: 'UnitRequisiteGroup', delegate: 'unitRequisiteGroup' },
  { model: 'UnitOffering', delegate: 'unitOffering' },
  { model: 'UnitLearningOutcome', delegate: 'unitLearningOutcome' },
  { model: 'UnitContentTopic', delegate: 'unitContentTopic' },
  { model: 'UnitAssessment', delegate: 'unitAssessment' },
  { model: 'UnitDetailSectionState', delegate: 'unitDetailSectionState' },
  { model: 'Unit', delegate: 'unit' },
  { model: 'Major', delegate: 'major' },
  { model: 'Course', delegate: 'course' },
  { model: 'FaqItem', delegate: 'faqItem' },
  { model: 'GeneralEnquiries', delegate: 'generalEnquiries' },
  { model: 'ItHelpDesk', delegate: 'itHelpDesk' },
  { model: 'HeadOfDepartment', delegate: 'headOfDepartment' },
] as const;

/** Tables the reset never touches: the CMS accounts and their sessions. */
export const KEEP = [
  { model: 'CmsUser', delegate: 'cmsUser' },
  { model: 'CmsRefreshToken', delegate: 'cmsRefreshToken' },
] as const;

export type ResetOptions = {
  envFile: string;
  /** The host name that the person read in the dry run. The reset runs only when this matches the real host. */
  confirmHost: string | null;
  backupDone: boolean;
  seed: boolean;
};

export function parseArgs(argv: string[]): ResetOptions {
  const options: ResetOptions = { envFile: '.env', confirmHost: null, backupDone: false, seed: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const [flag, inline] = arg.split('=', 2);
    const value = () => inline ?? argv[++i];
    if (flag === '--env-file') options.envFile = value() ?? '';
    else if (flag === '--confirm-host') options.confirmHost = value() ?? '';
    else if (arg === '--i-have-a-backup') options.backupDone = true;
    else if (arg === '--seed') options.seed = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (!options.envFile) throw new Error('--env-file needs a file name');
  if (options.confirmHost === '') throw new Error('--confirm-host needs the host name that the dry run printed');
  return options;
}

export type Target = { host: string; port: string; database: string; isLocal: boolean; label: string };

/** Where a connection string points, without the user name or the password, so it can be printed safely. */
export function describeTarget(connectionString: string): Target {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error('The database connection string is not a valid URL (it is not printed here, to keep it secret)');
  }
  const host = url.hostname.toLowerCase();
  const port = url.port || '5432';
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
  return { host, port, database, isLocal, label: `${host}:${port}/${database}` };
}

export type Decision =
  | { run: false; reason: string }
  | { run: true };

/** Decides whether the delete may run. Everything except an exact, explicit confirmation is a dry run. */
export function decide(options: ResetOptions, target: Target): Decision {
  if (options.confirmHost === null) return { run: false, reason: 'Dry run. Nothing was changed. To run the reset, repeat the command with --confirm-host ' + target.host };
  if (options.confirmHost.toLowerCase() !== target.host) return { run: false, reason: `--confirm-host (${options.confirmHost}) is not the host of this database (${target.host}). Nothing was changed.` };
  if (!target.isLocal && !options.backupDone) return { run: false, reason: `${target.host} is not on this computer. Take a backup, then add --i-have-a-backup. Nothing was changed.` };
  return { run: true };
}

/** The seed makes a default superadmin (admin@example.com) when CMS_SEED_EMAIL is not set and that account is missing. */
export function seedIsSafe(env: Record<string, string | undefined>, target: Target): { ok: true } | { ok: false; reason: string } {
  if (target.isLocal || env.CMS_SEED_EMAIL) return { ok: true };
  return { ok: false, reason: 'CMS_SEED_EMAIL is not set. The seed would then create the default superadmin admin@example.com with a published password on a database that is not on this computer. Set CMS_SEED_EMAIL (to an account that already exists) and run again.' };
}

/** Model names found in a Prisma schema, so a test can check that every table is either cleared or kept. */
export function modelNames(schemaText: string): string[] {
  return [...schemaText.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]);
}

const DATABASE_VARIABLES = ['DATABASE_URL', 'DATABASE_URL_UNPOOLED'] as const;

/**
 * Applies the chosen env file to an environment object. The database variables are removed first, so a value that an
 * earlier file left behind (Node loads every --env-file it is given, and the first one wins) can never be used with
 * this file's name on screen. Every other variable in the file replaces the old one.
 */
export function applyEnvFile(env: Record<string, string | undefined>, parsed: Record<string, string | undefined>): void {
  for (const name of DATABASE_VARIABLES) delete env[name];
  for (const [key, value] of Object.entries(parsed)) if (value !== undefined) env[key] = value;
}
