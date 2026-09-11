import { useCallback, useRef, useState } from 'react';
import { Analytics } from '@vercel/analytics/react';
import ListScreen from './screens/ListScreen';
import CameraScreen from './screens/CameraScreen';
import BottomNav from './components/BottomNav';
import Header from './components/Header';
import CameraIcon from './components/CameraIcon';
import SwatchesIcon from './components/SwatchesIcon';
import { useSavedSwatches } from './hooks/useSavedSwatches';
import { useWideLayout } from './hooks/useWideLayout';
import './App.css';

export type View = 'list' | 'camera';

function App() {
  const [view, setView] = useState<View>('list');
  const wide = useWideLayout();
  const { saved, savedIds, remove, toggle } = useSavedSwatches();
  // Survives ListScreen unmounting on the camera tab. Hydrating a filled
  // list from localStorage starts false — that is not a first-save ceremony.
  const sawEmptyRef = useRef(saved.length === 0);
  if (saved.length === 0) sawEmptyRef.current = true;

  const onConsumedEmpty = useCallback(() => {
    sawEmptyRef.current = false;
  }, []);

  return (
    <div className="app-shell">
      <div className="app-screen">
        {wide && <Header className="app-header" />}
        {wide &&
          (view === 'list' ? (
          <button
            type="button"
            className="header-action"
            onClick={() => setView('camera')}
          >
            <span className="text-heading-1">Capture</span>
            <CameraIcon size={30} />
          </button>
        ) : (
          <button
            type="button"
            className="header-action header-action--back"
            onClick={() => setView('list')}
          >
            <SwatchesIcon size={18} />
            <span className="text-heading-1">Swatches</span>
          </button>
        ))}
        <div className="app-body">
          {view === 'list' ? (
            <ListScreen
              swatches={saved}
              onRemove={remove}
              onOpenCamera={() => setView('camera')}
              sawEmpty={sawEmptyRef.current}
              onConsumedEmpty={onConsumedEmpty}
            />
          ) : (
            <CameraScreen savedIds={savedIds} onToggleSave={toggle} />
          )}
        </div>
        {!wide && <BottomNav view={view} onChange={setView} />}
      </div>
      <Analytics />
    </div>
  );
}

export default App;
