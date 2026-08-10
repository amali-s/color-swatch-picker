import { Bookmark } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { Swatch } from '../types';

interface Props {
  swatch: Swatch;
  style?: CSSProperties;
  saved: boolean;
  onSave: () => void;
}

export default function FloatingChip({ swatch, style, saved, onSave }: Props) {
  return (
    <div className="floating-chip" style={style}>
      <div className="floating-chip__color" style={{ background: `#${swatch.hex}` }} />
      <p className="text-label-2" style={{ color: 'var(--text-tertiary)' }}>
        {swatch.hex}
      </p>
      <button
        aria-label={saved ? `${swatch.hex} saved` : `Save ${swatch.hex}`}
        aria-pressed={saved}
        onClick={onSave}
        className="floating-chip__save"
      >
        <Bookmark
          size={15}
          color="var(--text-tertiary)"
          fill={saved ? 'var(--text-tertiary)' : 'none'}
          strokeWidth={1.75}
        />
      </button>
    </div>
  );
}
