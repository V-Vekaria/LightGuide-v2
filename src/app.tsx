import { useEffect } from 'preact/hooks';
import { HttpDeviceClient } from './device/http-client';
import { connect, disconnect, screen } from './store/store';
import { Library } from './ui/Library';
import { LiveGuidance } from './ui/LiveGuidance';
import { NewSetup } from './ui/NewSetup';
import { QuickGuide } from './ui/QuickGuide';

export function App() {
  useEffect(() => {
    // Same origin: the ESP32 serves this bundle, and Vite proxies /api and /live in dev.
    const client = new HttpDeviceClient('');
    connect(client);
    return () => {
      // disconnect() first: it clears the store's heartbeat interval and
      // unsubscribes the live listener. Calling only client.close() would
      // leave that interval running forever after unmount.
      disconnect();
      client.close();
    };
  }, []);

  switch (screen.value) {
    case 'new': return <NewSetup />;
    case 'live': return <LiveGuidance />;
    case 'quick': return <QuickGuide />;
    default: return <Library />;
  }
}
