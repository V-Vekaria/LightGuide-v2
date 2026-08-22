/**
 * Types for the mock device's test harness API. The mock is plain .mjs — it is
 * the stand-in for firmware, not part of the app bundle — but the conformance
 * suite drives it from TypeScript, so the seam it is driven through is typed.
 */

export interface TraceRow {
  /** Null on a `missed=1` row — a dropout is null, never 0. */
  distance_cm: number | null;
  /** 0..1 fraction of the 12-bit ADC range. */
  brightness: number;
}

export interface ParsedTrace {
  rows: TraceRow[];
  /** Rows dropped as malformed — counted rather than silently ignored. */
  skipped: number;
}

export function parseTraceText(text: string, label?: string): ParsedTrace;

export function loadTraces(dir?: string): ParsedTrace;

export interface MockDeviceOptions {
  /** 0 picks a free port. Use it in tests: it cannot collide with a hand-started instance. */
  port?: number;
  /** null keeps setups in memory only — a genuinely clean device per instance. */
  storePath?: string | null;
  tracesDir?: string;
  dropoutPct?: number;
  /** false stops the 10 Hz replay timer. */
  live?: boolean;
}

export interface MockDevice {
  port: number;
  /** Base URL to hand to HttpDeviceClient. */
  url: string;
  traceRows: number;
  skippedRows: number;
  close(): Promise<void>;
}

export function createMockDevice(options?: MockDeviceOptions): Promise<MockDevice>;
