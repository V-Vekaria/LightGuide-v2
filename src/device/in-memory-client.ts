import type { ConnectionStatus, DeviceClient, Reading, Setup, Target } from '../contract/types';

/** Backs tests and offline UI work. No network. */
export class InMemoryDeviceClient implements DeviceClient {
  private setups: Setup[];
  private target: Target | null = null;
  private listeners = new Set<(r: Reading) => void>();

  constructor(seed: Setup[] = []) {
    this.setups = [...seed];
  }

  async listSetups(): Promise<Setup[]> {
    return this.setups.filter((s) => !s.deleted);
  }

  async saveSetup(setup: Setup): Promise<Setup> {
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

  /** Test-only: the target last set. */
  activeTarget(): Target | null {
    return this.target;
  }
}
