// Synthetic HTTP and media persistence for the actual stdio entry; never packaged.
import * as fs from 'node:fs/promises';
import path from 'node:path';
import {draftHTTP} from './paired-draft-fixture.mjs';
const root=process.env.SJ_TEST_ROOT;
const config=JSON.parse(await fs.readFile(path.join(root,'transfer-config.json'))),draftConfig=JSON.parse(await fs.readFile(path.join(root,'draft-config.json')));
let seed={};try{seed=JSON.parse(await fs.readFile(path.join(root,'fake-provider.json')));}catch{}
const http=draftHTTP({config,draftConfig,key:process.env.SAMANTHA_TRANSFER_KEY},JSON.parse(process.env.SJ_TEST_HTTP_OPTIONS||'{}'),seed);
globalThis.fetch=async(...args)=>{
 try{return await http.send(...args);}
 finally{
  await fs.writeFile(path.join(root,'fake-provider.json'),JSON.stringify(http.dump()));
  await fs.writeFile(path.join(root,'http-calls.json'),JSON.stringify(http.calls.map(c=>({method:c.method,path:c.path,authPresent:!!c.auth}))));
 }
};
