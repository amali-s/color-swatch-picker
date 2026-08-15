import SwatchesIcon from './SwatchesIcon';
import CameraIcon from './CameraIcon';
import type { View } from '../App';

interface Props {
  view: View;
  onChange: (view: View) => void;
}

/**
 * Persistent bottom tab bar — cream (`--foreground`) surface, present on every
 * screen (both Swatches states and the Camera tab). The active target sits on a
 * rounded `--background` pill; the glyphs themselves don't recolour between
 * states (matches the exported mocks). Both buttons are ≥44px and expose
 * `aria-current`.
 */
export default function BottomNav({ view, onChange }: Props) {
  return (
    <nav className="bottom-nav" aria-label="Views">
      <button
        type="button"
        aria-label="Saved swatches"
        aria-current={view === 'list' ? 'page' : undefined}
        onClick={() => onChange('list')}
        className={`bottom-nav__button${view === 'list' ? ' is-active' : ''}`}
      >
        <SwatchesIcon size={32} />
      </button>
      <button
        type="button"
        aria-label="Camera"
        aria-current={view === 'camera' ? 'page' : undefined}
        onClick={() => onChange('camera')}
        className={`bottom-nav__button${view === 'camera' ? ' is-active' : ''}`}
      >
        <CameraIcon size={28} />
      </button>
    </nav>
  );
}
