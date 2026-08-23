import type {
  ConnectionStatus,
  DeviceClient,
  DeviceInfo,
  Reading,
  SensorHealth,
  SensorState,
  Setup,
  Target,
} from '../contract/types';

const RECONNECT_MIN_MS = 500;
const RECONNECT_MAX_MS = 8000;

/**
 * How long `getInfo()` waits before giving up.
 *
 * It has a deadline and the other calls do not, because it is the one call
 * made against an address nobody has verified yet — a typed IP, or the
 * same-origin guess on a phone that has silently wandered off the device's
 * access point. A TCP connection to an address with nothing listening is not
 * refused, it is dropped, and the browser will sit on it for a minute or more.
 * A photographer waiting to find out whether they typed the address right does
 * not get to wait a minute.
 *
 * Four seconds is chosen against the transport, not the network: this device
 * serves over its own SoftAP, where a first request behind Wi-Fi association
 * and ARP is comfortably inside a second.
 */
const INFO_TIMEOUT_MS = 4000;

function isFiniteOrNull(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

/**
 * Guards against a frame that parses as valid JSON but isn't a well-formed
 * `Reading` — e.g. `{"foo":1}`, or a numeric field sent as a string. Without
 * this, such a frame would be cast straight to `Reading` and its missing/
 * wrong-typed fields would surface downstream as `undefined`, rendering as
 * things like "Move NaN cm closer".
 */
function isValidReading(value: unknown): value is Reading {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    isFiniteOrNull(r.distance_cm) &&
    isFiniteOrNull(r.brightness) &&
    isFiniteOrNull(r.ambient) &&
    typeof r.seq === 'number' && Number.isFinite(r.seq) &&
    typeof r.ts === 'number' && Number.isFinite(r.ts)
  );
}

/**
 * Guards `GET /api/active`. A malformed target must not be quietly read as
 * "not guiding": that reads as a fact about the device ("nothing is active")
 * when the truth is "the device said something we could not understand".
 */
function isValidTarget(value: unknown): value is Target {
  if (typeof value !== 'object' || value === null) return false;
  const t = value as Record<string, unknown>;
  return (
    typeof t.distance_cm === 'number' && Number.isFinite(t.distance_cm) &&
    typeof t.distance_tol_cm === 'number' && Number.isFinite(t.distance_tol_cm) &&
    typeof t.brightness_tol === 'number' && Number.isFinite(t.brightness_tol) &&
    isFiniteOrNull(t.brightness_above_ambient)
  );
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/** A finite number, or null for anything else — used for the display-only extras. */
function optionalNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function optionalString(value: unknown): string | null {
  return nonEmptyString(value) ? value : null;
}

/**
 * Shape strict, vocabulary tolerant.
 *
 * `state` must be present and a string — a sensor object without one is a
 * device that has not implemented this part of the contract, and pretending
 * otherwise would report a board with no health reporting as a healthy board.
 * But an unrecognised *value* becomes `unknown` rather than failing the whole
 * payload: a future firmware that adds a state (`degraded`, say) within the
 * same protocol version should degrade to "cannot tell" on an older app, not
 * take the device screen down with it.
 */
function parseSensorHealth(value: unknown): SensorHealth | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = (value as Record<string, unknown>).state;
  if (typeof raw !== 'string') return null;
  const state: SensorState = raw === 'ok' || raw === 'fault' ? raw : 'unknown';
  return { state };
}

/**
 * Guards `GET /api/info`. Rejects rather than filling gaps: this payload is
 * how the app decides whether it is talking to a LightGuide at all, so a
 * partial answer coerced into a whole one would let any JSON-serving box on
 * the network present itself as a device with a blank name.
 *
 * The three display-only extras (`model`, `uptime_s`, `free_storage_bytes`)
 * are the exception. They are absent on purpose in some firmwares, and a
 * wrong-typed one is a cosmetic fault; it becomes `null` and the screen says
 * the device did not report it, rather than refusing the whole device.
 */
export function parseDeviceInfo(value: unknown): DeviceInfo | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;

  const protocol = raw.protocol;
  if (typeof protocol !== 'number' || !Number.isInteger(protocol) || protocol < 1) return null;
  if (!nonEmptyString(raw.device_id)) return null;
  if (!nonEmptyString(raw.name)) return null;
  if (!nonEmptyString(raw.firmware)) return null;

  const sensors = raw.sensors;
  if (typeof sensors !== 'object' || sensors === null) return null;
  const distance = parseSensorHealth((sensors as Record<string, unknown>).distance);
  const light = parseSensorHealth((sensors as Record<string, unknown>).light);
  if (distance === null || light === null) return null;

  return {
    protocol,
    device_id: raw.device_id,
    name: raw.name,
    model: optionalString(raw.model),
    firmware: raw.firmware,
    uptime_s: optionalNumber(raw.uptime_s),
    free_storage_bytes: optionalNumber(raw.free_storage_bytes),
    sensors: { distance, light },
  };
}

/** Talks to the ESP32 — and to the mock server, which implements the same surface. */
export class HttpDeviceClient implements DeviceClient {
  private listeners = new Set<(r: Reading) => void>();
  private socket: WebSocket | null = null;
  private state: ConnectionStatus = 'disconnected';
  private backoff = RECONNECT_MIN_MS;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  constructor(private baseUrl: string = '') {}

  private async json<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    });
    if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${path} failed: ${res.status}`);
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  /**
   * Identity, firmware, protocol and sensor health.
   *
   * Its own fetch rather than `json()` because it is the only call that needs
   * a deadline (see INFO_TIMEOUT_MS) — and because the timeout has to surface
   * as something a caller can tell apart from a refusal. A device that never
   * answers and a device that answers "no" are different situations for the
   * person holding the phone.
   */
  async getInfo(): Promise<DeviceInfo> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), INFO_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/api/info`, { signal: controller.signal });
    } catch (error) {
      // An aborted fetch rejects with an AbortError, which is neither a
      // TypeError nor an HTTP status — so it would classify as 'unknown' and
      // be reported to the user as "something went wrong" when what actually
      // happened is the plainest failure there is: nothing was there.
      if (controller.signal.aborted) {
        throw new Error(`GET /api/info timed out after ${INFO_TIMEOUT_MS}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new Error(`GET /api/info failed: ${res.status}`);
    const info = parseDeviceInfo(await res.json().catch(() => null));
    if (info === null) throw new Error('GET /api/info returned a malformed device description');
    return info;
  }

  listSetups(): Promise<Setup[]> {
    return this.json<Setup[]>('/api/setups');
  }

  listSetupsIncludingDeleted(): Promise<Setup[]> {
    return this.json<Setup[]>('/api/setups?include_deleted=1');
  }

  saveSetup(setup: Setup): Promise<Setup> {
    return this.json<Setup>(`/api/setups/${setup.id}`, {
      method: 'PUT',
      body: JSON.stringify(setup),
    });
  }

  async deleteSetup(id: string): Promise<void> {
    await this.json<void>(`/api/setups/${id}`, { method: 'DELETE' });
  }

  /**
   * Clearing is its own verb. It used to be `POST /api/active` with `{}`, and
   * the mock inferred "empty object means clear" — nothing in the contract
   * said so, and the same inference makes a *truncated* body (a real outcome
   * on a flaky access point) mean "stop guiding". `DELETE` carries no body at
   * all, so there is nothing left to misread.
   */
  async setActiveTarget(target: Target | null): Promise<void> {
    if (target === null) {
      await this.json<void>('/api/active', { method: 'DELETE' });
      return;
    }
    await this.json<void>('/api/active', { method: 'POST', body: JSON.stringify(target) });
  }

  async getActiveTarget(): Promise<Target | null> {
    const body = await this.json<unknown>('/api/active');
    const target = (body as { target?: unknown } | null)?.target;
    if (target === undefined || target === null) return null;
    if (!isValidTarget(target)) throw new Error('GET /api/active returned a malformed target');
    return target;
  }

  subscribeLive(cb: (reading: Reading) => void): () => void {
    this.listeners.add(cb);
    if (!this.socket) this.connect();
    return () => {
      this.listeners.delete(cb);
      // We deliberately do NOT close an already-open socket just because the
      // last listener left — transport lifecycle belongs to close(). Tying it
      // to subscriber count would cause resubscribe churn (open/close/open on
      // every unsubscribe-then-resubscribe). We do still cancel a pending
      // reconnect timer below, so a cancelled subscription can't cause a
      // fresh socket to open later and serve zero listeners.
      if (this.listeners.size === 0 && this.retryTimer) {
        clearTimeout(this.retryTimer);
        this.retryTimer = null;
      }
    };
  }

  private connect(): void {
    if (this.closed) return;
    this.state = 'connecting';
    const origin = this.baseUrl || window.location.origin;
    const url = origin.replace(/^http/, 'ws') + '/live';
    const socket = new WebSocket(url);
    this.socket = socket;

    socket.onopen = () => {
      this.state = 'connected';
      this.backoff = RECONNECT_MIN_MS;
    };
    socket.onmessage = (event) => {
      try {
        const parsed: unknown = JSON.parse(event.data as string);
        if (!isValidReading(parsed)) return;
        for (const listener of this.listeners) listener(parsed);
      } catch {
        // A malformed frame is dropped, not rendered. Never show a bad reading.
      }
    };
    socket.onclose = () => {
      this.state = 'disconnected';
      this.socket = null;
      this.scheduleReconnect();
    };
    socket.onerror = () => socket.close();
  }

  private scheduleReconnect(): void {
    if (this.closed || this.listeners.size === 0) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      // Re-check on fire, not just on arm: a listener that unsubscribed
      // between arming and firing (without clearing the timer some other
      // way) must not cause a fresh socket to open for zero listeners.
      if (this.closed || this.listeners.size === 0) return;
      this.connect();
    }, this.backoff);
    this.backoff = Math.min(this.backoff * 2, RECONNECT_MAX_MS);
  }

  status(): ConnectionStatus {
    return this.state;
  }

  close(): void {
    this.closed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.listeners.clear();
    this.socket?.close();
    this.socket = null;
    this.state = 'disconnected';
  }
}
