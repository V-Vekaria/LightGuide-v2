export const LIGHTGUIDE_PROTOCOL_VERSION = 2;
export const LIGHTGUIDE_LOCAL_NAME = "LightGuide-Node";
export const LIGHTGUIDE_UUIDS = {
  service: "7d6f0001-5a6b-4c47-9a41-4c6967687447",
  deviceInfo: "7d6f0002-5a6b-4c47-9a41-4c6967687447",
  measurement: "7d6f0003-5a6b-4c47-9a41-4c6967687447",
  event: "7d6f0004-5a6b-4c47-9a41-4c6967687447",
  command: "7d6f0005-5a6b-4c47-9a41-4c6967687447",
  status: "7d6f0006-5a6b-4c47-9a41-4c6967687447",
} as const;

export type DeviceInfo = {
  v: 2; type: "device_info"; device_id: string; fw: string; hw: string; cap: string[];
};
export type Measurement = {
  v: 2; type: "measurement"; seq: number; uptime_ms: number;
  distance_mm: number; roll_deg: number; pitch_deg: number; yaw_deg: number;
  tof_valid: boolean; imu_valid: boolean; spectral_valid: boolean;
  spectral_gain: number; spectral: number[];
};
export type DeviceEvent = {
  v: 2; type: "event"; seq: number; uptime_ms: number; event: "save_pressed";
};
export type DeviceStatus = {
  v: 2; type: "status"; seq: number; uptime_ms: number;
  state: "booting" | "ready" | "degraded" | "error";
  tof: boolean; imu: boolean; spectral: boolean; error: string | null;
};
export type DeviceCommand =
  | { v: 2; type: "command"; command: "request_status" }
  | { v: 2; type: "command"; command: "identify" };

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Device payload must be a JSON object.");
  return value as Record<string, unknown>;
}
function text(o: Record<string, unknown>, k: string) {
  if (typeof o[k] !== "string") throw new Error(`Missing or invalid ${k}.`); return o[k] as string;
}
function number(o: Record<string, unknown>, k: string) {
  if (typeof o[k] !== "number" || !Number.isFinite(o[k])) throw new Error(`Missing or invalid ${k}.`); return o[k] as number;
}
function positiveNumber(o: Record<string, unknown>, k: string) {
  const n=number(o,k); if (n <= 0) throw new Error(`Missing or invalid ${k}.`); return n;
}
function integer(o: Record<string, unknown>, k: string) {
  const n=number(o,k); if (!Number.isInteger(n) || n < 0) throw new Error(`Missing or invalid ${k}.`); return n;
}
function bool(o: Record<string, unknown>, k: string) {
  if (typeof o[k] !== "boolean") throw new Error(`Missing or invalid ${k}.`); return o[k] as boolean;
}
function base(o: Record<string, unknown>, expected: string) {
  if (o.v !== LIGHTGUIDE_PROTOCOL_VERSION) throw new Error("Unsupported LightGuide protocol version.");
  if (o.type !== expected) throw new Error(`Expected ${expected} payload.`);
}
export function parseDeviceInfo(raw: string): DeviceInfo {
  const o=object(JSON.parse(raw)); base(o,"device_info");
  if (!Array.isArray(o.cap) || !o.cap.every(x=>typeof x==="string")) throw new Error("Missing or invalid cap.");
  return {v:2,type:"device_info",device_id:text(o,"device_id"),fw:text(o,"fw"),hw:text(o,"hw"),cap:o.cap as string[]};
}
export function parseMeasurement(raw: string): Measurement {
  const o=object(JSON.parse(raw)); base(o,"measurement");
  if (!Array.isArray(o.spectral) || o.spectral.length!==13 || !o.spectral.every(x=>typeof x==="number"&&Number.isFinite(x))) throw new Error("spectral must contain exactly 13 numeric gain-normalised channels.");
  return {v:2,type:"measurement",seq:integer(o,"seq"),uptime_ms:integer(o,"uptime_ms"),distance_mm:integer(o,"distance_mm"),roll_deg:number(o,"roll_deg"),pitch_deg:number(o,"pitch_deg"),yaw_deg:number(o,"yaw_deg"),tof_valid:bool(o,"tof_valid"),imu_valid:bool(o,"imu_valid"),spectral_valid:bool(o,"spectral_valid"),spectral_gain:positiveNumber(o,"spectral_gain"),spectral:o.spectral as number[]};
}
export function parseEvent(raw: string): DeviceEvent {
  const o=object(JSON.parse(raw)); base(o,"event"); if(o.event!=="save_pressed") throw new Error("Unsupported device event.");
  return {v:2,type:"event",seq:integer(o,"seq"),uptime_ms:integer(o,"uptime_ms"),event:"save_pressed"};
}
export function parseStatus(raw: string): DeviceStatus {
  const o=object(JSON.parse(raw)); base(o,"status");
  if (!["booting","ready","degraded","error"].includes(String(o.state))) throw new Error("Invalid device state.");
  if (!(o.error===null || typeof o.error==="string")) throw new Error("Invalid status error.");
  return {v:2,type:"status",seq:integer(o,"seq"),uptime_ms:integer(o,"uptime_ms"),state:o.state as DeviceStatus["state"],tof:bool(o,"tof"),imu:bool(o,"imu"),spectral:bool(o,"spectral"),error:o.error as string|null};
}
export function encodeCommand(command: DeviceCommand["command"]) {
  return JSON.stringify({v:2,type:"command",command} satisfies DeviceCommand);
}
export function eventKey(session: string, event: DeviceEvent) { return `${session}:${event.seq}`; }
