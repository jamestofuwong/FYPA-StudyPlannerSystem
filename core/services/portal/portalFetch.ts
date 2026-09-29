// ---------------------------------------------------------------------------
// portalFetch — authenticated fetch wrapper for CampusNexus portal REST API
//
// Every portal API call requires:
//   - Cookie: <session cookies from Puppeteer>
//   - token:  <Angular anti-forgery token>
//   - Referer / Origin / X-Requested-With to mimic the Angular app
//
// All portal endpoints use POST with an empty string body, even for reads.
// ---------------------------------------------------------------------------

const PORTAL_API_BASE = 'https://custom-100380.campusnexus.cloud';
const PORTAL_REFERER  = 'https://custom-100380.campusnexus.cloud/PortalExtension/';
const PORTAL_ORIGIN   = 'https://custom-100380.campusnexus.cloud';

export interface PortalCredentials {
  cookies: string;
  portalToken: string;
}

export class PortalAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PortalAuthError';
  }
}

export async function portalFetch<T = unknown>(
  path: string,
  credentials: PortalCredentials,
): Promise<T> {
  const url = `${PORTAL_API_BASE}${path}`;

  const res = await fetch(url, {
    method: 'POST',
    body: '',
    headers: {
      'Cookie':           credentials.cookies,
      'token':            credentials.portalToken,
      'Content-Type':     'application/json',
      'Accept':           'application/json, text/plain, */*',
      'Referer':          PORTAL_REFERER,
      'Origin':           PORTAL_ORIGIN,
      'X-Requested-With': 'XMLHttpRequest',
    },
  });

  if (res.status === 401 || res.status === 403) {
    throw new PortalAuthError(`Portal returned ${res.status} — session has expired. Please log in again.`);
  }

  if (!res.ok) {
    throw new Error(`Portal API error: ${res.status} ${res.statusText} (${url})`);
  }

  return res.json() as Promise<T>;
}
