import type {
  ConnectionStatus,
  DeviceClient,
  DeviceInfo,
  Reading,
  Setup,
  Target,
} from '../contract/types';
import { PROTOCOL_MIN_SUPPORTED } from '../contract/types';

/**
 * What this client answers `getInfo()` with.
 *
 * It says `in-memory` in both the id and the name on purpose. This client
 * backs tests and offline UI work, and the device screen exists precisely so
 * that a sceptic can tell a real board from a simulation — a fake that
 * introduced itself as "LightGuide 9D40" would defeat the screen it is used to
 * develop.
 *
 * `protocol` tracks the app's own minimum rather than being a literal, so this
 * client cannot silently become the thing that fails a compatibility check
 * when the supported range moves.
 */
const DEFAULT_INFO: DeviceInfo = {
  protocol: PROTOCOL_MIN_SUPPORTED,
  device_id: 'in-memory',
  name: 'In-memory device',
  model: 'Simulated',
  firmware: '0.0.0-in-memory',
  uptime_s: 0,
  free_storage_bytes: null,
  sensors: { distance: { state: 'ok' }, light: { state: 'ok' } },
};

/** Backs tests and offline UI work. No network. */
export class InMemoryDeviceClient implements DeviceClient {
  private setups: Setup[];
  private target: Target | null = null;
  private listeners = new Set<(r: Reading) => void>();
  private info: DeviceInfo;

  constructor(seed: Setup[] = [], info: Partial<DeviceInfo> = {}) {
    this.setups = [...seed];
    this.info = { ...DEFAULT_INFO, ...info };
  }

  async getInfo(): Promise<DeviceInfo> {
    return this.info;
  }

  async listSetups(): Promise<Setup[]> {
    return this.setups.filter((s) => !s.deleted);
  }

  async listSetupsIncludingDeleted(): Promise<Setup[]> {
    return [...this.setups];
  }

  async saveSetup(setup: Setup): Promise<Setup> {
    // Stored verbatim — `updated_at` and `deleted` are the writer's to decide,
    // which is what lets an import write a tombstone and keep its ordering.
    this.setups = this.setups.filter((s) => s.id !== setup.id).concat(setup);
    return setup;
  }

  async deleteSetup(id: string): Promise<void> {
    const found = this.setups.find((s) => s.id === id);
    if (found) {
      found.deleted = true;
      found.updated_at = new Date().toISOString();
    }
  }

  async setActiveTarget(target: Target | null): Promise<void> {
    this.target = target;
  }

  async getActiveTarget(): Promise<Target | null> {
    return this.target;
  }

  subscribeLive(cb: (reading: Reading) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  status(): ConnectionStatus {
    return 'connected';
  }

  close(): void {
    this.listeners.clear();
  }

  /** Test-only: push a reading to subscribers. */
  emit(reading: Reading): void {
    for (const listener of this.listeners) listener(reading);
  }
}
