import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { AppState } from "react-native";
import { LightGuideBleTransport } from "./ble";
import { DeviceController } from "./controller";
import { devicePresentation } from "./session";

const DeviceContext = createContext<ReturnType<typeof useDeviceValue> | null>(
  null,
);
function useDeviceValue() {
  const [controller] = useState(
    () => new DeviceController(() => new LightGuideBleTransport()),
  );
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const [now, setNow] = useState(Date.now);
  const [active, setActive] = useState(AppState.currentState === "active");
  useEffect(() => {
    const sub = AppState.addEventListener("change", (value) => {
      setActive(value === "active");
      setNow(Date.now());
    });
    return () => {
      sub.remove();
      controller.destroy();
    };
  }, [controller]);
  useEffect(() => {
    if (snapshot.session.phase !== "connected" || !active) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [snapshot.session.phase, active]);
  return {
    ...snapshot,
    controller,
    presentation: devicePresentation(
      snapshot.session,
      Math.max(now, Date.now()),
      active,
    ),
    canCapture:
      snapshot.captureAt !== null && Date.now() - snapshot.captureAt <= 5000,
  };
}
export function DeviceProvider({ children }: { children: React.ReactNode }) {
  const value = useDeviceValue();
  return (
    <DeviceContext.Provider value={value}>{children}</DeviceContext.Provider>
  );
}
export function useDevice() {
  const value = useContext(DeviceContext);
  if (!value) throw new Error("DeviceProvider is missing");
  return value;
}
