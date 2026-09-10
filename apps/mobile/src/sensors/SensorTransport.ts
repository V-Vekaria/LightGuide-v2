/**
 * Platform-neutral local-node telemetry contract (BLE, per ADR-011/APP_MVP_PLAN.md
 * "Device workflow"). No BLE GATT protocol, firmware or hardware exists yet
 * (CLAUDE_BUILD_HANDOFF.md: "BLE behaviour is planned; its implementation-ready
 * GATT/security/message contract and firmware are not finished"). This
 * interface exists so the app's data model and UI do not assume a specific
 * protocol later, not because a working transport is implemented here.
 */
export type SensorTransportState = 'unavailable' | 'scanning' | 'connected' | 'disconnected';

export interface SensorReading {
  deviceId: string;
  distanceM: number | null;
  brightnessRaw: number | null;
  capturedAt: string;
  quality: 'valid' | 'stale' | 'unavailable';
}

export interface SensorTransport {
  readonly kind: 'native-ble' | 'simulated' | 'unavailable';
  getState(): SensorTransportState;
  latestReading(): SensorReading | null;
}

/** The only implementation shipped in this delivery. There is no node hardware/protocol to connect to yet. */
export class UnavailableSensorTransport implements SensorTransport {
  readonly kind = 'unavailable' as const;

  getState(): SensorTransportState {
    return 'unavailable';
  }

  latestReading(): SensorReading | null {
    return null;
  }
}
