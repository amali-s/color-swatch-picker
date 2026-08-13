import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Tracks the user's `prefers-reduced-motion` setting reactively.
 *
 * Phase 4 requires the capture moment to respect reduced motion: the pulse and
 * flash are vestibular triggers, so when this returns `true` the capture screen
 * swaps them for a static determinate ring and an instant reveal (see
 * CameraScreen). SSR-safe: defaults to `false` when `matchMedia` is absent.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof matchMedia === 'function' ? matchMedia(QUERY).matches : false,
  );

  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mql = matchMedia(QUERY);
    const onChange = () => setReduced(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return reduced;
}
