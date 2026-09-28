import type {
  DeviceEvent,
  DeviceInfo,
  DeviceStatus,
  Measurement,
} from "./protocol";
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
  | { type: "scan_finished" }
  | { type: "connecting"; sessionId: string }
  | { type: "subscribing" }
  | { type: "connected"; info: DeviceInfo; status: DeviceStatus }
  | { type: "measurement"; value: Measurement; receivedAt: number }
  | { type: "status"; value: DeviceStatus }
  | { type: "event"; value: DeviceEvent }
  | { type: "unsupported"; message: string }
  | { type: "failed"; message: string }
  | { type: "disconnected" };

export function reduceDeviceSession(
  state: DeviceSessionState,
  action: SessionAction,
): DeviceSessionState {
  switch (action.type) {
    case "scan_started":
      return { ...initialDeviceSession(), phase: "scanning" };
    case "scan_finished":
      return { ...state, phase: "idle" };
    case "connecting":
      return {
        ...initialDeviceSession(),
        phase: "connecting",
        sessionId: action.sessionId,
      };
    case "subscribing":
      return { ...state, phase: "subscribing", error: null };
    case "connected":
      return {
        ...state,
        phase: "connected",
        deviceInfo: action.info,
        status: action.status,
        error: null,
      };
    case "measurement":
      if (state.phase !== "connected") return state;
      return {
        ...state,
        measurement: action.value,
        measurementReceivedAt: action.receivedAt,
      };
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
      return {
        ...state,
        phase: "unsupported",
        measurement: null,
        measurementReceivedAt: null,
        error: action.message,
      };
    case "failed":
      return {
        ...state,
        phase: "error",
        measurement: null,
        measurementReceivedAt: null,
        error: action.message,
      };
    case "disconnected":
      return {
        ...state,
        phase: "disconnected",
        measurement: null,
        measurementReceivedAt: null,
        status: null,
        error: null,
      };
  }
}

export function isMeasurementFresh(
  state: DeviceSessionState,
  now: number,
  maxAgeMs = 1000,
) {
  return (
    state.phase === "connected" &&
    state.measurement !== null &&
    state.measurementReceivedAt !== null &&
    now >= state.measurementReceivedAt &&
    now - state.measurementReceivedAt <= maxAgeMs
  );
}

export function shouldHandleSaveEvent(
  state: DeviceSessionState,
  event: DeviceEvent,
  now: number,
  maxAgeMs = 1000,
) {
  if (!state.sessionId || !isMeasurementFresh(state, now, maxAgeMs))
    return false;
  return !state.handledEvents.has(eventKey(state.sessionId, event));
}

/** Connection and fresh telemetry are separate promises to the photographer. */
export function devicePresentation(
  state: DeviceSessionState,
  now: number,
  active = true,
) {
  const fresh = active && isMeasurementFresh(state, now);
  if (state.phase === "connected") {
    const age =
      state.measurementReceivedAt === null
        ? null
        : Math.max(0, Math.floor((now - state.measurementReceivedAt) / 1000));
    return {
      fresh,
      warning: !fresh || state.status?.state !== "ready",
      label: !fresh
        ? state.measurement
          ? "Device connected · readings stopped"
          : "Device connected · waiting for readings"
        : state.status?.state === "ready"
          ? "Device connected · live readings"
          : "Device connected · check sensors",
      detail: !active
        ? "Return to the app to check fresh readings."
        : age === null
          ? "No sensor readings received yet."
          : fresh
            ? "Receiving sensor readings."
            : `Last reading ${age}s ago. Check the node before using sensor values.`,
    };
  }
  const labels = {
    idle: "Device not connected",
    scanning: "Finding device…",
    connecting: "Connecting device…",
    subscribing: "Connecting device…",
    disconnected: "Device disconnected",
    unsupported: "Device incompatible",
    error: "Device connection error",
  };
  return {
    fresh: false,
    warning: ["disconnected", "unsupported", "error"].includes(state.phase),
    label: labels[state.phase],
    detail:
      state.error ??
      (state.phase === "disconnected"
        ? "Live readings stopped. Tap to reconnect."
        : "Tap to manage your LightGuide device."),
  };
}
