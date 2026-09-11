import { useEffect, useState } from 'react';

/** Laptop and up — matches the `min-width: 64rem` layout in App.css. */
export const WIDE_QUERY = '(min-width: 64rem)';

/**
 * True when the viewport is wide enough for the laptop/desktop canvas
 * (no phone chrome, top nav, split swatch panel).
 */
export function useWideLayout(): boolean {
  const [wide, setWide] = useState(() =>
    typeof matchMedia === 'function' ? matchMedia(WIDE_QUERY).matches : false,
  );

  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mql = matchMedia(WIDE_QUERY);
    const onChange = () => setWide(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return wide;
}
