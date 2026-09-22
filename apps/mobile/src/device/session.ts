import type { DeviceEvent, DeviceInfo, DeviceStatus, Measurement } from "./protocol";
import { eventKey } from "./protocol";

export type ConnectionPhase =
  | "idle"
  | "scanning"
  | "connecting"
  | "subscribing"
  | "connected"
  | "disconnected"
  | "unsupported"
  | "error";

export type DeviceSessionState = {
  phase: ConnectionPhase;
  sessionId: string | null;
  deviceInfo: DeviceInfo | null;
  status: DeviceStatus | null;
  measurement: Measurement | null;
  measurementReceivedAt: number | null;
  error: string | null;
  handledEvents: ReadonlySet<string>;
};

export const initialDeviceSession = (): DeviceSessionState => ({
  phase: "idle",
  sessionId: null,
  deviceInfo: null,
  status: null,
  measurement: null,
  measurementReceivedAt: null,
  error: null,
  handledEvents: new Set(),
});

export type SessionAction =
  | { type: "scan_started" }
  | { type: "connecting"; sessionId: string }
  | { type: "subscribing" }
  | { type: "connected"; info: DeviceInfo; status: DeviceStatus }
  | { type: "measurement"; value: Measurement; receivedAt: number }
  | { type: "status"; value: DeviceStatus }
  | { type: "event"; value: DeviceEvent }
  | { type: "unsupported"; message: string }
  | { type: "failed"; message: string }
  | { type: "disconnected" };

export function reduceDeviceSession(state: DeviceSessionState, action: SessionAction): DeviceSessionState {
  switch (action.type) {
    case "scan_started":
      return { ...initialDeviceSession(), phase: "scanning" };
    case "connecting":
      return { ...initialDeviceSession(), phase: "connecting", sessionId: action.sessionId };
    case "subscribing":
      return { ...state, phase: "subscribing", error: null };
    case "connected":
      return { ...state, phase: "connected", deviceInfo: action.info, status: action.status, error: null };
    case "measurement":
      if (state.phase !== "connected") return state;
      return { ...state, measurement: action.value, measurementReceivedAt: action.receivedAt };
    case "status":
      return { ...state, status: action.value };
    case "event": {
      if (!state.sessionId) return state;
      const key = eventKey(state.sessionId, action.value);
      if (state.handledEvents.has(key)) return state;
      const handledEvents = new Set(state.handledEvents);
      handledEvents.add(key);
      return { ...state, handledEvents };
    }
    case "unsupported":
      return { ...state, phase: "unsupported", measurement: null, measurementReceivedAt: null, error: action.message };
    case "failed":
      return { ...state, phase: "error", measurement: null, measurementReceivedAt: null, error: action.message };
    case "disconnected":
      return { ...state, phase: "disconnected", measurement: null, measurementReceivedAt: null, status: null, error: null };
  }
}

export function isMeasurementFresh(state: DeviceSessionState, now: number, maxAgeMs = 1000) {
  return state.phase === "connected" && state.measurement !== null && state.measurementReceivedAt !== null && now - state.measurementReceivedAt <= maxAgeMs;
}

export function shouldHandleSaveEvent(state: DeviceSessionState, event: DeviceEvent) {
  if (state.phase !== "connected" || !state.sessionId || !isMeasurementFresh(state, Date.now())) return false;
  return !state.handledEvents.has(eventKey(state.sessionId, event));
}
