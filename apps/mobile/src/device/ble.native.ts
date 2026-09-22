import { PermissionsAndroid, Platform } from "react-native";
import { BleManager, type Device, type Subscription } from "react-native-ble-plx";
import { LIGHTGUIDE_UUIDS, parseDeviceInfo, parseEvent, parseMeasurement, parseStatus, encodeCommand, type DeviceEvent, type DeviceInfo, type DeviceStatus, type Measurement } from "./protocol";

export type DiscoveredNode = { id: string; name: string; rssi: number | null };
export type BleCallbacks = {
  onMeasurement(value: Measurement): void;
  onStatus(value: DeviceStatus): void;
  onEvent(value: DeviceEvent): void;
  onDisconnected(message?: string): void;
};

const decode = (value: string | null) => {
  if (!value) throw new Error("LightGuide characteristic returned no value.");
  const binary = globalThis.atob(value);
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};
const encode = (value: string) => {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach(b => { binary += String.fromCharCode(b); });
  return globalThis.btoa(binary);
};
const message = (e: unknown) => e instanceof Error ? e.message : "Bluetooth operation failed.";

export class LightGuideBleTransport {
  private manager = new BleManager();
  private device: Device | null = null;
  private monitors: Subscription[] = [];
  private disconnectMonitor: Subscription | null = null;

  async requestPermissions() {
    if (Platform.OS !== "android") return true;
    if (Number(Platform.Version) >= 31) {
      const result = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      ]);
      return result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED
        && result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED;
    }
    return (await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION)) === PermissionsAndroid.RESULTS.GRANTED;
  }

  scan(onNode: (node: DiscoveredNode) => void, onError: (error: string) => void) {
    const seen = new Set<string>();
    this.manager.startDeviceScan([LIGHTGUIDE_UUIDS.service], null, (error, device) => {
      if (error) { onError(error.message); return; }
      if (!device || seen.has(device.id)) return;
      seen.add(device.id);
      onNode({ id: device.id, name: device.localName ?? device.name ?? "LightGuide node", rssi: device.rssi ?? null });
    });
  }
  stopScan() { void this.manager.stopDeviceScan(); }

  async connect(id: string, callbacks: BleCallbacks): Promise<{ info: DeviceInfo; status: DeviceStatus }> {
    this.stopScan();
    await this.disconnect();
    let device = await this.manager.connectToDevice(id, { timeout: 10000 });
    device = await device.discoverAllServicesAndCharacteristics();
    this.device = device;
    this.disconnectMonitor = this.manager.onDeviceDisconnected(id, (error) => {
      this.clearMonitors();
      this.device = null;
      callbacks.onDisconnected(error?.message);
    });
    const infoValue = await device.readCharacteristicForService(LIGHTGUIDE_UUIDS.service, LIGHTGUIDE_UUIDS.deviceInfo);
    const statusValue = await device.readCharacteristicForService(LIGHTGUIDE_UUIDS.service, LIGHTGUIDE_UUIDS.status);
    const info = parseDeviceInfo(decode(infoValue.value));
    const status = parseStatus(decode(statusValue.value));

    const monitor = <T>(uuid: string, parse: (raw: string) => T, receive: (value: T) => void) =>
      device.monitorCharacteristicForService(LIGHTGUIDE_UUIDS.service, uuid, (error, characteristic) => {
        if (error) { callbacks.onDisconnected(error.message); return; }
        try { receive(parse(decode(characteristic?.value ?? null))); } catch { /* reject only the malformed notification */ }
      });
    this.monitors = [
      monitor(LIGHTGUIDE_UUIDS.measurement, parseMeasurement, callbacks.onMeasurement),
      monitor(LIGHTGUIDE_UUIDS.status, parseStatus, callbacks.onStatus),
      monitor(LIGHTGUIDE_UUIDS.event, parseEvent, callbacks.onEvent),
    ];
    return { info, status };
  }

  async requestStatus() {
    if (!this.device) throw new Error("No LightGuide node is connected.");
    await this.device.writeCharacteristicWithResponseForService(LIGHTGUIDE_UUIDS.service, LIGHTGUIDE_UUIDS.command, encode(encodeCommand("request_status")));
  }

  async disconnect() {
    this.clearMonitors();
    const id = this.device?.id;
    this.device = null;
    if (id) {
      try { await this.manager.cancelDeviceConnection(id); } catch { /* already disconnected */ }
    }
  }
  private clearMonitors() {
    this.monitors.forEach(s => s.remove()); this.monitors = [];
    this.disconnectMonitor?.remove(); this.disconnectMonitor = null;
  }
  destroy() { void this.disconnect().finally(() => { void this.manager.destroy(); }); }
}

export function bluetoothError(e: unknown) { return message(e); }
