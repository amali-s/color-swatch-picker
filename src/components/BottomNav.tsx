import { Camera } from 'lucide-react';
import SwatchesFanIcon from './SwatchesFanIcon';
import type { View } from '../App';

interface Props {
  view: View;
  onChange: (view: View) => void;
  /** Camera screen sits on a photo/gradient background, so its inactive icon needs a lighter tint. */
  inverted?: boolean;
}

export default function BottomNav({ view, onChange, inverted = false }: Props) {
  const inactiveColor = inverted ? 'var(--layer-1)' : 'var(--secondary-action)';

  return (
    <nav className="bottom-nav">
      <button
        aria-label="Saved swatches"
        aria-pressed={view === 'list'}
        onClick={() => onChange('list')}
        className="bottom-nav__button"
        style={view === 'list' ? undefined : { background: 'transparent' }}
      >
        <SwatchesFanIcon size={28} color={view === 'list' ? 'var(--secondary-action)' : inactiveColor} />
      </button>
      <button
        aria-label="Camera"
        aria-pressed={view === 'camera'}
        onClick={() => onChange('camera')}
        className="bottom-nav__button"
        style={view === 'camera' ? undefined : { background: 'transparent' }}
      >
        <Camera size={26} color={view === 'camera' ? 'var(--secondary-action)' : inactiveColor} strokeWidth={1.75} />
      </button>
    </nav>
  );
}
