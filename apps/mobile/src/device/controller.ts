import type { LightGuideBleTransport, DiscoveredNode } from "./ble";
import {
  initialDeviceSession,
  reduceDeviceSession,
  shouldHandleSaveEvent,
  isMeasurementFresh,
  type SessionAction,
} from "./session";
import { setPendingDeviceSnapshot } from "./pending-snapshot";

// One owner for the foreground app. Navigation only subscribes to this state.
export class DeviceController {
  snapshot = {
    session: initialDeviceSession(),
    nodes: [] as DiscoveredNode[],
    notice: null as string | null,
    captureAt: null as number | null,
  };
  private listeners = new Set<() => void>();
  private transport: LightGuideBleTransport | null = null;
  private generation = 0;
  private connecting = false;
  private scanTimer: ReturnType<typeof setTimeout> | undefined;
  constructor(
    private createTransport: () => LightGuideBleTransport,
    private now = Date.now,
  ) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.snapshot;
  private publish(patch: Partial<typeof this.snapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  private dispatch(action: SessionAction) {
    this.publish({
      session: reduceDeviceSession(this.snapshot.session, action),
    });
  }
  private stopScan() {
    clearTimeout(this.scanTimer);
    this.transport?.stopScan();
  }
  private fail(error: unknown) {
    this.dispatch({
      type: "failed",
      message: error instanceof Error ? error.message : String(error),
    });
  }
  async scan() {
    if (
      this.connecting ||
      ["connected", "connecting", "subscribing"].includes(
        this.snapshot.session.phase,
      )
    )
      return;
    const generation = ++this.generation;
    this.stopScan();
    this.publish({ nodes: [], notice: null, captureAt: null });
    this.dispatch({ type: "scan_started" });
    try {
      const transport = (this.transport ??= this.createTransport());
      if (!(await transport.requestPermissions()))
        throw new Error(
          "Allow Nearby devices permission to find LightGuide. Bluetooth is available in the Android app.",
        );
      if (generation !== this.generation) return;
      transport.scan(
        (node) => {
          if (
            generation === this.generation &&
            this.snapshot.session.phase === "scanning" &&
            !this.snapshot.nodes.some((n) => n.id === node.id)
          )
            this.publish({ nodes: [...this.snapshot.nodes, node] });
        },
        (message) => {
          if (generation === this.generation) {
            this.stopScan();
            this.fail(message);
          }
        },
      );
      this.scanTimer = setTimeout(() => {
        if (
          generation !== this.generation ||
          this.snapshot.session.phase !== "scanning"
        )
          return;
        this.stopScan();
        this.dispatch({ type: "scan_finished" });
        this.publish({
          notice: this.snapshot.nodes.length
            ? "Choose your LightGuide below."
            : "No LightGuide found. Power on your node, keep it nearby, then scan again.",
        });
      }, 10000);
    } catch (error) {
      if (generation === this.generation) {
        this.stopScan();
        this.fail(error);
      }
    }
  }
  async connect(node: DiscoveredNode) {
    if (
      this.connecting ||
      ["connected", "connecting", "subscribing"].includes(
        this.snapshot.session.phase,
      )
    )
      return;
    this.stopScan();
    this.connecting = true;
    const generation = ++this.generation;
    this.publish({ notice: null, captureAt: null });
    this.dispatch({
      type: "connecting",
      sessionId: `${this.now()}-${generation}-${node.id}`,
    });
    try {
      const transport = (this.transport ??= this.createTransport());
      this.dispatch({ type: "subscribing" });
      const result = await transport.connect(node.id, {
        onMeasurement: (value) => {
          if (generation === this.generation)
            this.dispatch({
              type: "measurement",
              value,
              receivedAt: this.now(),
            });
        },
        onStatus: (value) => {
          if (generation === this.generation)
            this.dispatch({ type: "status", value });
        },
        onEvent: (value) => {
          if (generation !== this.generation) return;
          const before = this.snapshot.session;
          const save = shouldHandleSaveEvent(before, value, this.now());
          this.dispatch({ type: "event", value });
          if (save) this.captureSnapshot();
        },
        onDisconnected: (message) => {
          if (generation !== this.generation) return;
          ++this.generation;
          this.dispatch({ type: "disconnected" });
          this.publish({
            notice:
              message || "Connection lost. Check your node and reconnect.",
            captureAt: null,
          });
          void transport.disconnect();
        },
      });
      if (generation !== this.generation) return;
      this.dispatch({
        type: "connected",
        info: result.info,
        status: result.status,
      });
    } catch (error) {
      if (generation === this.generation) {
        ++this.generation;
        await this.transport?.disconnect();
        this.fail(error);
      }
    } finally {
      this.connecting = false;
    }
  }
  captureSnapshot() {
    const state = this.snapshot.session;
    if (
      !isMeasurementFresh(state, this.now()) ||
      !state.measurement ||
      !state.deviceInfo
    )
      return false;
    setPendingDeviceSnapshot({
      measurement: state.measurement,
      info: state.deviceInfo,
      receivedAt: state.measurementReceivedAt!,
    });
    this.publish({
      notice: "Snapshot ready. Open setup capture to save it.",
      captureAt: state.measurementReceivedAt,
    });
    return true;
  }
  async disconnect() {
    ++this.generation;
    this.stopScan();
    this.dispatch({ type: "disconnected" });
    this.publish({
      notice: "Device disconnected. Your saved setups are unchanged.",
      captureAt: null,
    });
    await this.transport?.disconnect();
  }
  async refreshStatus() {
    try {
      await this.transport?.requestStatus();
    } catch (error) {
      this.publish({
        notice:
          error instanceof Error ? error.message : "Could not refresh status.",
      });
    }
  }
  destroy() {
    ++this.generation;
    this.stopScan();
    this.transport?.destroy();
    this.transport = null;
  }
}
