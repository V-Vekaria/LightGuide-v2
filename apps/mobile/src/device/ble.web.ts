import type { DeviceEvent, DeviceInfo, DeviceStatus, Measurement } from "./protocol";
export type DiscoveredNode={id:string;name:string;rssi:number|null};
export type BleCallbacks={onMeasurement(value:Measurement):void;onStatus(value:DeviceStatus):void;onEvent(value:DeviceEvent):void;onDisconnected(message?:string):void};
export class LightGuideBleTransport {
 async requestPermissions(){return false;}
 scan(_onNode:(node:DiscoveredNode)=>void,onError:(error:string)=>void){onError("Bluetooth connection is available in the Android app.");}
 stopScan(){}
 async connect(_id:string,_callbacks:BleCallbacks):Promise<{info:DeviceInfo;status:DeviceStatus}>{throw new Error("Bluetooth connection is available in the Android app.");}
 async requestStatus(){throw new Error("Bluetooth connection is available in the Android app.");}
 async disconnect(){}
 destroy(){}
}
export function bluetoothError(e:unknown){return e instanceof Error?e.message:"Bluetooth operation failed.";}
