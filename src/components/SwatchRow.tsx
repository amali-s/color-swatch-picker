import type { Swatch } from '../types';

export default function SwatchRow({ hex }: Swatch) {
  return (
    <div className="swatch-row">
      <div className="swatch-row__chip" style={{ background: `#${hex}` }} />
      <p className="text-body-2" style={{ color: 'var(--text-primary)' }}>
        {hex}
      </p>
    </div>
  );
}
