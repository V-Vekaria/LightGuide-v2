import type { ConnectionStatus, DeviceClient, Reading, Setup, Target } from '../contract/types';

const RECONNECT_MIN_MS = 500;
const RECONNECT_MAX_MS = 8000;

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

  listSetups(): Promise<Setup[]> {
    return this.json<Setup[]>('/api/setups');
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

  async setActiveTarget(target: Target | null): Promise<void> {
    await this.json<void>('/api/active', {
      method: 'POST',
      body: JSON.stringify(target ?? {}),
    });
  }

  subscribeLive(cb: (reading: Reading) => void): () => void {
    this.listeners.add(cb);
    if (!this.socket) this.connect();
    return () => {
      this.listeners.delete(cb);
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
        const reading = JSON.parse(event.data as string) as Reading;
        for (const listener of this.listeners) listener(reading);
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
    this.retryTimer = setTimeout(() => this.connect(), this.backoff);
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
