import { useCallback, useEffect, useRef, useState } from 'react';
import type { Swatch } from '../types';

const STORAGE_KEY = 'lens-swatch:saved';

interface UseSavedSwatchesResult {
  /** Newest-first list of saved swatches. */
  saved: Swatch[];
  /** Ids currently in the list, for O(1) "is this saved?" lookups. */
  savedIds: Set<string>;
  /** Add a swatch if its color isn't already saved (dedupe by id). */
  add: (swatch: Swatch) => void;
  /** Remove a swatch by id. */
  remove: (id: string) => void;
  /** Add if absent, remove if present — the camera chip bookmark toggle. */
  toggle: (swatch: Swatch) => void;
}

/**
 * Owns the saved-swatch collection for the whole app (both tabs read/write it)
 * and mirrors it to localStorage so saves survive a reload.
 *
 * Dedupe is by `Swatch.id` (the `detected-RRGGBB` convention), so the same
 * color captured twice collapses to one entry. Every storage touch is wrapped
 * in try/catch: if localStorage is unavailable (private mode, disabled, quota),
 * the hook silently degrades to in-memory state rather than crashing.
 */
export function useSavedSwatches(): UseSavedSwatchesResult {
  const [saved, setSaved] = useState<Swatch[]>(loadInitial);

  // Skip writing back the value we just hydrated from storage on first render.
  const hydrated = useRef(false);
  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true;
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch {
      /* Storage unavailable — keep going in memory only. */
    }
  }, [saved]);

  const add = useCallback((swatch: Swatch) => {
    setSaved((prev) =>
      prev.some((s) => s.id === swatch.id) ? prev : [swatch, ...prev],
    );
  }, []);

  const remove = useCallback((id: string) => {
    setSaved((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const toggle = useCallback((swatch: Swatch) => {
    setSaved((prev) =>
      prev.some((s) => s.id === swatch.id)
        ? prev.filter((s) => s.id !== swatch.id)
        : [swatch, ...prev],
    );
  }, []);

  const savedIds = new Set(saved.map((s) => s.id));

  return { saved, savedIds, add, remove, toggle };
}

/** Read + validate the persisted list once, on first render. */
function loadInitial(): Swatch[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s): s is Swatch =>
        typeof s === 'object' &&
        s !== null &&
        typeof (s as Swatch).id === 'string' &&
        typeof (s as Swatch).hex === 'string',
    );
  } catch {
    return [];
  }
}
