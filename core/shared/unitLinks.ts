// ============================================================
// Links to the official unit pages of the university: https://www.swinburne.edu.au/course/unit/<first letter>/<code>/
// Pure, so the pages that show a unit and the desktop shell that opens the link share one definition.
// MPU (general studies) units have no unit page of their own on that site, so they get no link.
// ============================================================

export const OFFICIAL_UNIT_HOST = 'www.swinburne.edu.au';

// Three or four letters, then four or five digits: COS10009, MPU3212, ICT20016
const UNIT_CODE = /^[A-Z]{3,4}\d{4,5}$/;

function normalise(code: string): string {
  return code.trim().replace(/\*Optional$/i, '').replace(/\s+/g, '').toUpperCase();
}

/** The official page of a unit, or null when the code is not a unit code or the unit has no page of its own (MPU). */
export function officialUnitUrl(code: string | null | undefined): string | null {
  if (!code) return null;
  const unit = normalise(code);
  if (!UNIT_CODE.test(unit) || unit.startsWith('MPU')) return null;
  return `https://${OFFICIAL_UNIT_HOST}/course/unit/${unit[0].toLowerCase()}/${unit.toLowerCase()}/`;
}

/**
 * True only for an official unit page link. The desktop window opens a link outside the app only when this says yes,
 * so a page cannot send the user anywhere else through it.
 */
export function isOfficialUnitUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== OFFICIAL_UNIT_HOST || parsed.port !== '' || parsed.username || parsed.password) return false;
  const match = /^\/course\/unit\/([a-z])\/([a-z]{3,4}\d{4,5})\/$/.exec(parsed.pathname);
  return !!match && match[2].startsWith(match[1]) && !match[2].startsWith('mpu');
}
