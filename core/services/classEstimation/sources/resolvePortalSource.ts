// ============================================================
// Picks which transcript source a run uses.
//
// The default comes from CLASS_ESTIMATION_SOURCE so a development machine can start on mock data without
// touching code, and a request can override it per run so the two can be compared without a restart.
// Anything unrecognised falls back to the live portal rather than silently serving mock data, since
// mistaking generated students for real ones is the worst failure available here.
// ============================================================

import { realPortalSource } from './realPortalSource';
import { createMockPortalSource, type MockPortalOptions } from './mockPortalSource';
import type { PortalSource, PortalSourceId } from './portalSource';

export function isPortalSourceId(value: unknown): value is PortalSourceId {
  return value === 'portal' || value === 'mock';
}

/** The default for this environment. Production ignores the variable entirely and always uses the portal. */
export function defaultPortalSourceId(): PortalSourceId {
  if (process.env.NODE_ENV === 'production') return 'portal';
  const configured = process.env.CLASS_ESTIMATION_SOURCE;
  return isPortalSourceId(configured) ? configured : 'portal';
}

export function resolvePortalSource(
  requested?: string | null,
  mockOptions: MockPortalOptions = {},
): PortalSource {
  const id = isPortalSourceId(requested) ? requested : defaultPortalSourceId();

  // Generated students must never be servable from a production build, where they could be mistaken for a
  // real cohort in front of the HoD.
  if (id === 'mock' && process.env.NODE_ENV !== 'production') {
    return createMockPortalSource(mockOptions);
  }
  return realPortalSource;
}

/** What the source picker offers. Mock is hidden in production for the same reason. */
export function availablePortalSources(): Array<{ id: PortalSourceId; label: string; requiresLogin: boolean }> {
  const sources = [realPortalSource];
  if (process.env.NODE_ENV !== 'production') sources.push(createMockPortalSource());
  return sources.map((source) => ({
    id: source.id,
    label: source.label,
    requiresLogin: source.requiresLogin,
  }));
}
