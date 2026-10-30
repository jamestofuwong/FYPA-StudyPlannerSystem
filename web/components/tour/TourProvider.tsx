'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { TOURS_BY_ID } from '../../lib/tour/tours';
import type { Tour, TourStep } from '../../lib/tour/types';

/**
 * The state of the interactive walkthrough. It lives in the layout of the pages, so it stays while the person moves
 * between pages, and it is kept in sessionStorage so that a reload does not lose the place. The cards are drawn by
 * TourOverlay. The user guide starts a walkthrough with `start(id)`.
 */

const ACTIVE_KEY = 'walkthroughActive';
const DONE_KEY = 'walkthroughsDone';

interface Active { tourId: string; index: number }

export interface TourApi {
  tour: Tour | null;
  step: TourStep | null;
  index: number;
  total: number;
  /** The path of the page that the person is on now. */
  pathname: string;
  start: (tourId: string) => void;
  stop: () => void;
  next: () => void;
  back: () => void;
  /** Opens the page of the current step. */
  openStepPage: () => void;
  /** Ids of the walkthroughs that the person finished before. */
  done: string[];
}

const TourContext = createContext<TourApi | null>(null);

function readJson<T>(storage: Storage | undefined, key: string): T | null {
  try {
    const raw = storage?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;   // the storage can be off (private window, blocked data)
  }
}
function writeJson(storage: Storage | undefined, key: string, value: unknown) {
  try {
    if (value === null) storage?.removeItem(key);
    else storage?.setItem(key, JSON.stringify(value));
  } catch { /* ignore */ }
}

export function TourProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const [active, setActive] = useState<Active | null>(null);
  const [done, setDone] = useState<string[]>([]);
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  // Restore after a reload.
  useEffect(() => {
    const saved = readJson<Active>(typeof window === 'undefined' ? undefined : window.sessionStorage, ACTIVE_KEY);
    const tour = saved ? TOURS_BY_ID.get(saved.tourId) : undefined;
    if (saved && tour && saved.index >= 0 && saved.index < tour.steps.length) setActive(saved);
    setDone(readJson<string[]>(typeof window === 'undefined' ? undefined : window.localStorage, DONE_KEY) ?? []);
  }, []);

  const save = useCallback((next: Active | null) => {
    setActive(next);
    writeJson(typeof window === 'undefined' ? undefined : window.sessionStorage, ACTIVE_KEY, next);
  }, []);

  const go = useCallback((tour: Tour, index: number) => {
    save({ tourId: tour.id, index });
    const path = tour.steps[index].path;
    if (path !== pathnameRef.current) router.push(path);
  }, [router, save]);

  const tour = active ? TOURS_BY_ID.get(active.tourId) ?? null : null;
  const index = active?.index ?? 0;

  const start = useCallback((tourId: string) => {
    const t = TOURS_BY_ID.get(tourId);
    if (t) go(t, 0);
  }, [go]);

  const stop = useCallback(() => save(null), [save]);

  const next = useCallback(() => {
    if (!tour) return;
    if (index + 1 >= tour.steps.length) {
      // Finished: remember it, so that the guide can say so.
      const all = Array.from(new Set([...(readJson<string[]>(window.localStorage, DONE_KEY) ?? []), tour.id]));
      writeJson(window.localStorage, DONE_KEY, all);
      setDone(all);
      save(null);
      return;
    }
    go(tour, index + 1);
  }, [tour, index, go, save]);

  const back = useCallback(() => {
    if (tour && index > 0) go(tour, index - 1);
  }, [tour, index, go]);

  const openStepPage = useCallback(() => {
    if (tour) router.push(tour.steps[index].path);
  }, [tour, index, router]);

  const api = useMemo<TourApi>(() => ({
    tour, step: tour ? tour.steps[index] : null, index, total: tour?.steps.length ?? 0, pathname,
    start, stop, next, back, openStepPage, done,
  }), [tour, index, pathname, start, stop, next, back, openStepPage, done]);

  return <TourContext.Provider value={api}>{children}</TourContext.Provider>;
}

export function useTour(): TourApi {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error('useTour must be used inside TourProvider');
  return ctx;
}
