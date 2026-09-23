import React,{useEffect,useReducer,useRef,useState} from "react";
import {View} from "react-native";
import {router} from "expo-router";
import {Badge,Body,Button,Card,ErrorMessage,Heading,Label,Screen,s} from "../src/ui/components";
import {LightGuideBleTransport,bluetoothError,type DiscoveredNode} from "../src/device/ble";
import {initialDeviceSession,reduceDeviceSession,shouldHandleSaveEvent} from "../src/device/session";
import {setPendingDeviceSnapshot} from "../src/device/pending-snapshot";
import type {DeviceEvent} from "../src/device/protocol";

export default function DeviceScreen(){
 const transport=useRef<LightGuideBleTransport|null>(null);
 const [state,dispatch]=useReducer(reduceDeviceSession,undefined,initialDeviceSession);
 const stateRef=useRef(state); stateRef.current=state;
 const [nodes,setNodes]=useState<DiscoveredNode[]>([]);
 const [notice,setNotice]=useState<string|null>(null);
 useEffect(()=>{transport.current=new LightGuideBleTransport();return()=>transport.current?.destroy();},[]);
 const scan=async()=>{
  setNotice(null);setNodes([]);
  try{
   if(!await transport.current!.requestPermissions()){dispatch({type:"failed",message:"Bluetooth permission is required to find your LightGuide node."});return;}
   dispatch({type:"scan_started"});
   transport.current!.scan(node=>setNodes(old=>old.some(x=>x.id===node.id)?old:[...old,node]),message=>dispatch({type:"failed",message}));
  }catch(e){dispatch({type:"failed",message:bluetoothError(e)});}
 };
 const event=(value:DeviceEvent)=>{
  const before=stateRef.current;
  const shouldSave=shouldHandleSaveEvent(before,value,Date.now());
  dispatch({type:"event",value});
  if(shouldSave&&before.measurement&&before.deviceInfo){
   setPendingDeviceSnapshot({measurement:before.measurement,info:before.deviceInfo,receivedAt:before.measurementReceivedAt!});
   setNotice("Save button received. A fresh sensor snapshot is ready in setup capture.");
  }
 };
 const connect=async(node:DiscoveredNode)=>{
  const sessionId=Date.now().toString(36)+"-"+node.id;dispatch({type:"connecting",sessionId});
  try{
   dispatch({type:"subscribing"});
   const result=await transport.current!.connect(node.id,{
    onMeasurement:value=>dispatch({type:"measurement",value,receivedAt:Date.now()}),
    onStatus:value=>dispatch({type:"status",value}),
    onEvent:event,
    onDisconnected:message=>{dispatch({type:"disconnected"});if(message)setNotice(message);},
   });
   dispatch({type:"connected",info:result.info,status:result.status});
  }catch(e){dispatch({type:"failed",message:bluetoothError(e)});}
 };
 return <Screen back title="Connect LightGuide" subtitle="Find the ESP32-S3 node and view live Device Protocol v1 readings.">
  <ErrorMessage message={state.error}/>
  <View style={s.row}><Badge>{state.phase.toUpperCase()}</Badge>{state.deviceInfo&&<Body muted>{state.deviceInfo.device_id} · firmware {state.deviceInfo.fw}</Body>}</View>
  {state.phase!=="connected"&&<Button title={state.phase==="scanning"?"Scan again":"Find LightGuide node"} onPress={scan}/>}
  {nodes.map(node=><Card key={node.id}><Label>LIGHTGUIDE NODE</Label><Heading>{node.name}</Heading><Body muted>{node.rssi==null?"Signal unknown":`Signal ${node.rssi} dBm`}</Body><Button title="Connect" onPress={()=>connect(node)}/></Card>)}
  {state.phase==="scanning"&&nodes.length===0&&<Card><Heading>Looking for LightGuide…</Heading><Body muted>The app filters by the Device Protocol v1 service UUID, not the BLE address.</Body></Card>}
  {state.phase==="connected"&&<Card><Label>LIVE SENSOR SNAPSHOT</Label><Heading>{state.measurement?.tof_valid?`${state.measurement.distance_mm} mm`:"Distance unavailable"}</Heading><Body>Roll {state.measurement?.imu_valid?state.measurement.roll_deg.toFixed(1)+"°":"—"} · Pitch {state.measurement?.imu_valid?state.measurement.pitch_deg.toFixed(1)+"°":"—"} · Yaw {state.measurement?.imu_valid?state.measurement.yaw_deg.toFixed(1)+"°":"—"}</Body><Body muted>Spectral {state.measurement?.spectral_valid?"18 raw channels received":"unavailable"}</Body><Body muted>Status: {state.status?.state??"unknown"}</Body><View style={s.row}><Button kind="secondary" title="Refresh status" onPress={()=>transport.current?.requestStatus().catch(e=>dispatch({type:"failed",message:bluetoothError(e)}))}/><Button kind="secondary" title="Disconnect" onPress={()=>transport.current?.disconnect().then(()=>dispatch({type:"disconnected"}))}/></View></Card>}
  {notice&&<Card><Heading>Device event</Heading><Body>{notice}</Body>{state.measurement&&<Button title="Open setup capture" onPress={()=>router.push("/capture?sensor=1")}/>}</Card>}
  <Card><Body muted>Physical BLE, calibration and ±3 cm accuracy remain unverified until tested with the actual phone and ESP32.</Body></Card>
 </Screen>;
}
