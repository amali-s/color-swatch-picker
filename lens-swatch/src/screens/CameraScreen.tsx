import BottomNav from '../components/BottomNav';
import FloatingChip from '../components/FloatingChip';
import type { Swatch } from '../types';
import type { View } from '../App';

interface Props {
  detected: Swatch[];
  savedIds: Set<string>;
  onSave: (swatch: Swatch) => void;
  onNavChange: (view: View) => void;
}

const CHIP_POSITIONS = [
  { left: '50%', top: '9%' },
  { left: '13%', top: '43%' },
  { left: '50%', top: '78%' },
];

/**
 * Node 2:260 "Camera". Real getUserMedia wiring is later roadmap phases
 * (Phase 1/3) — this reproduces the design's placeholder viewfinder
 * (the same blurred gradient used in Figma) with the three detected-color
 * chips, each saveable to the swatches list via the bookmark button.
 */
export default function CameraScreen({ detected, savedIds, onSave, onNavChange }: Props) {
  return (
    <div className="screen" style={{ background: 'var(--layer-1)' }}>
      <div className="camera-viewport">
        {detected.map((swatch, i) => (
          <FloatingChip
            key={swatch.id}
            swatch={swatch}
            style={CHIP_POSITIONS[i % CHIP_POSITIONS.length]}
            saved={savedIds.has(swatch.id)}
            onSave={() => onSave(swatch)}
          />
        ))}
      </div>

      <BottomNav view="camera" onChange={onNavChange} />
    </div>
  );
}
