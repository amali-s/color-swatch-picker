import { useCallback, useRef, useState } from 'react';
import { Analytics } from '@vercel/analytics/react';
import ListScreen from './screens/ListScreen';
import CameraScreen from './screens/CameraScreen';
import BottomNav from './components/BottomNav';
import Header from './components/Header';
import { useSavedSwatches } from './hooks/useSavedSwatches';
import './App.css';

export type View = 'list' | 'camera';

function App() {
  const [view, setView] = useState<View>('list');
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
        <Header className="app-header" />
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
        <BottomNav view={view} onChange={setView} />
      </div>
      <Analytics />
    </div>
  );
}

export default App;
