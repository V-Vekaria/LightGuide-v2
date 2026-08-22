import { useEffect } from 'preact/hooks';
import { HttpDeviceClient } from './device/http-client';
import {
  applyHistoryScreen,
  editingSetupId,
  clearDeviceTarget,
  connect,
  disconnect,
  navigate,
  screen,
  type Screen,
} from './store/store';
import { AppBar } from './ui/Chrome';
import { Library } from './ui/Library';
import { GuidanceSession, LiveGuidance } from './ui/LiveGuidance';
import { NewSetup } from './ui/NewSetup';
import { QuickGuide } from './ui/QuickGuide';

function Screen() {
  switch (screen.value) {
    case 'new':
      return <NewSetup key={editingSetupId.value ?? 'new'} />;
    case 'live':
      return <LiveGuidance />;
    case 'quick':
      return <QuickGuide />;
    default:
      return <Library />;
  }
}

export function App() {
  useEffect(() => {
    // Same origin: the ESP32 serves this bundle, and Vite proxies /api and /live in dev.
    const client = new HttpDeviceClient('');
    connect(client);

    // Seed a history entry for the opening screen so the first Back press has
    // somewhere to go instead of leaving the app.
    navigate(screen.value, { replace: true });

    const onPop = (event: PopStateEvent) => {
      const next = (event.state as { lgScreen?: Screen } | null)?.lgScreen;
      applyHistoryScreen(next ?? 'library');
    };
    window.addEventListener('popstate', onPop);

    // If the tab closes mid-guide, the device would otherwise keep guiding to a
    // target no app is showing. Best-effort — a teardown handler cannot await.
    const onTeardown = () => void clearDeviceTarget().catch(() => {});
    window.addEventListener('pagehide', onTeardown);

    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('pagehide', onTeardown);
      // disconnect() first: it clears the store's heartbeat interval and
      // unsubscribes the live listener. Calling only client.close() would
      // leave that interval running forever after unmount.
      disconnect();
      client.close();
    };
  }, []);

  return (
    <>
      {/* Renders nothing. It holds the wake lock and the arrival cue for as
          long as there is an active target, which is longer than the live
          screen is mounted — leaving that screen does not stop guidance, and
          the app bar chip says so. Sits outside <Screen /> precisely so a
          screen change cannot tear it down. */}
      <GuidanceSession />
      <AppBar />
      <Screen />
    </>
  );
}
