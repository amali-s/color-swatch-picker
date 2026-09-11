export type SwatchViewMode = 'wheel' | 'list';

interface Props {
  value: SwatchViewMode;
  onChange: (mode: SwatchViewMode) => void;
}

/**
 * Segmented list/wheel control from Figma 88:21 / 88:93. The cream pill is
 * the selected state; both glyphs stay `--secondary-action` (the cream
 * “unselected” SVGs are for a dark surface and would vanish on this track).
 */
export default function ViewSwitcher({ value, onChange }: Props) {
  return (
    <div className="view-switcher" role="tablist" aria-label="Saved swatches layout">
      <span
        className={`view-switcher__pill${value === 'list' ? ' is-list' : ''}`}
        aria-hidden="true"
      />
      <button
        type="button"
        role="tab"
        className="view-switcher__tab"
        aria-selected={value === 'wheel'}
        aria-label="Color wheel view"
        onClick={() => onChange('wheel')}
      >
        <WheelGlyph />
      </button>
      <button
        type="button"
        role="tab"
        className="view-switcher__tab"
        aria-selected={value === 'list'}
        aria-label="List view"
        onClick={() => onChange('list')}
      >
        <ListGlyph />
      </button>
    </div>
  );
}

function WheelGlyph() {
  return (
    <svg width="20" height="22" viewBox="0 0 20 22" fill="none" aria-hidden="true">
      <circle
        cx="10"
        cy="12"
        r="7"
        stroke="currentColor"
        strokeWidth="6"
        strokeMiterlimit="3.747"
        strokeDasharray="4 1"
      />
      <path
        d="M9 7.5L7 0.44543C9 -0.361287 11.8333 0.109298 13 0.44543L11 7.5H9Z"
        fill="currentColor"
      />
    </svg>
  );
}

function ListGlyph() {
  return (
    <svg width="21" height="16" viewBox="0 0 21 16" fill="none" aria-hidden="true">
      <circle cx="2" cy="2" r="2" fill="currentColor" />
      <circle cx="2" cy="8" r="2" fill="currentColor" />
      <circle cx="2" cy="14" r="2" fill="currentColor" />
      <rect x="6" y="1" width="15" height="2" rx="1" fill="currentColor" />
      <rect x="6" y="7" width="15" height="2" rx="1" fill="currentColor" />
      <rect x="6" y="13" width="15" height="2" rx="1" fill="currentColor" />
    </svg>
  );
}
