// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import { createMockDevice, MAX_BODY_BYTES } from './server.mjs';
import { WebSocket } from 'ws';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
let device;
afterEach(async () => { await device?.close(); device = null; });
const start = async () => device = await createMockDevice({port:0,storePath:null,live:false});
it('rejects hostile origins and rebinding hosts without changing active state', async () => {
  await start();
  for (const headers of [{Origin:'https://attacker.example'}, {Origin:'null'}]) {
    expect((await fetch(device.url+'/api/active',{method:'DELETE',headers})).status).toBe(403);
  }
  const rebinding = await new Promise((resolve,reject) => {
    const req=request(device.url+'/api/active',{method:'DELETE',headers:{Host:'attacker.example'}},res=>{res.resume();resolve(res.statusCode)});
    req.on('error',reject);req.end();
  });
  expect(rebinding).toBe(403);
  const response = await fetch(device.url+'/api/info',{headers:{Origin:'http://localhost:5173'}});
  expect(response.status).toBe(200);
  expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
});
it('rejects oversized JSON, malformed JSON, unsupported content types and unknown routes', async () => {
  await start();
  expect((await fetch(device.url+'/api/setups/x',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({updated_at:'today',deleted:false,padding:'x'.repeat(MAX_BODY_BYTES)})})).status).toBe(413);
  expect(await (await fetch(device.url+'/api/setups')).json()).toEqual([]);
  expect((await fetch(device.url+'/api/active',{method:'POST',headers:{'Content-Type':'application/json'},body:'{bad'})).status).toBe(400);
  expect((await fetch(device.url+'/api/active',{method:'POST',body:'{}'})).status).toBe(415);
  expect((await fetch(device.url+'/api/setups/a/b',{method:'DELETE'})).status).toBe(404);
  expect((await fetch(device.url+'/api/active',{method:'PATCH'})).status).toBe(404);
});
it('refuses cross-origin WebSocket upgrades', async () => {
  await start();
  const status = await new Promise((resolve,reject) => {
    const ws = new WebSocket(device.url.replace('http:','ws:')+'/live',{origin:'https://attacker.example'});
    ws.on('unexpected-response',(_,response)=>{response.resume();ws.terminate();resolve(response.statusCode)});
    ws.on('open',()=>{ws.terminate();reject(new Error('Hostile origin connected'))});
    ws.on('error',()=>{});
  });
  expect(status).toBe(401);
});
it('preserves a damaged on-disk store instead of silently replacing it', async () => {
  const dir=mkdtempSync(join(tmpdir(),'lightguide-store-')),path=join(dir,'setups.json');
  try {writeFileSync(path,'{broken');await expect(createMockDevice({port:0,storePath:path})).rejects.toThrow();expect(readFileSync(path,'utf8')).toBe('{broken');}
  finally {rmSync(dir,{recursive:true,force:true});}
});
