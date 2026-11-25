// Test-only injected HTTP fixtures; excluded from every install bundle.
import * as fs from 'node:fs/promises';
import path from 'node:path';
import {fakeHTTP} from './transfer-fixture.mjs';
const root=process.env.SJ_TEST_ROOT;
if(!root)throw Error('Test root required');
const config=JSON.parse(await fs.readFile(path.join(root,'transfer-config.json')));
const f={config,key:process.env.SAMANTHA_TRANSFER_KEY};
const options=JSON.parse(process.env.SJ_TEST_HTTP_OPTIONS||'{}'),http=fakeHTTP(f,options);
globalThis.fetch=async(...args)=>{
 try{return await http.send(...args);}
 finally{await fs.writeFile(path.join(root,'http-calls.json'),JSON.stringify(http.calls.map(c=>({method:c.method,path:c.path,authPresent:!!c.auth}))));}
};
