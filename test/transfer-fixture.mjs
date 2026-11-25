import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {sha} from '../transfer/files.mjs';
export async function fixture(t) {
 const root=await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()),'sj-transfer-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const folder=path.join(root,'approved'),state=path.join(root,'state'),configFile=path.join(root,'transfer-config.json');
 await fs.mkdir(folder);
 const key='zrk_'+'synthetic'.repeat(8),config={version:1,destinationId:'SYNTHETIC',destinationLabel:'Synthetic workspace',expectedOwnerId:'f'.repeat(24),credentialSha256:sha(key),storageOrigin:'https://'+'a'.repeat(32)+'.r2.cloudflarestorage.com',storagePathPrefix:'/synthetic/'};
 const batch={version:1,batchId:'SYNTHETIC_BATCH',status:'Approved',destinationId:'SYNTHETIC',pairs:[]};
 const contentId='SJ-W99-R1',revision=1;
 const pair={contentId,revision,status:'Approved'};
 for(const [kind,ext,mime] of [['video','mp4','video/mp4'],['cover','png','image/png']]){
  const bytes=await fs.readFile('chat-pilot/server/fixtures/SJ-W03-R1-v1.'+ext),name=contentId+'-v1.'+ext;
  await fs.writeFile(path.join(folder,name),bytes);
  pair[kind]={name,mime,size:bytes.length,sha256:sha(bytes)};
 }
 batch.pairs.push(pair);
 const write=()=>fs.writeFile(path.join(folder,'transfer-batch-'+batch.batchId+'.json'),JSON.stringify(batch));
 await write();await fs.writeFile(configFile,JSON.stringify(config),{mode:0o600});
 return {root,folder,state,configFile,key,config,batch,write};
}
export function fakeHTTP(f,options={}) {
 const calls=[],stored=new Map();let counter=0;
 const send=async (raw,o)=>{
  const u=new URL(raw);calls.push({method:o.method,path:u.pathname,auth:o.headers.authorization,body:o.body});
  assert.equal(o.redirect,'error');
  if(u.hostname==='zernio.com'){
   assert.equal(o.headers.authorization,'Bearer '+f.key);
   if(o.method==='GET'&&u.pathname==='/api/v1/auth/verify')return Response.json({valid:true,authType:'api_key',userId:options.wrongOwner?'e'.repeat(24):f.config.expectedOwnerId});
   assert.equal(o.method,'POST');assert.equal(u.pathname,'/api/v1/media/presign');
   const p=JSON.parse(o.body);assert.deepEqual(Object.keys(p).sort(),['contentType','filename','size']);
   const key='temp/'+(++counter)+'_'+p.filename;
   const query=new URLSearchParams({'X-Amz-Algorithm':'AWS4-HMAC-SHA256','X-Amz-Credential':'synthetic/20261125/auto/s3/aws4_request','X-Amz-Date':'20261125T000000Z','X-Amz-Expires':'3600','X-Amz-SignedHeaders':'host','X-Amz-Signature':'b'.repeat(64)});
   const result={uploadUrl:f.config.storageOrigin+f.config.storagePathPrefix+key+'?'+query,publicUrl:'https://media.zernio.com/'+key,key,expiresIn:3600};
   options.mutatePresign?.(result,p);
   return Response.json(result);
  }
  assert.equal(o.headers.authorization,undefined);
  if(u.origin===f.config.storageOrigin && o.method==='PUT'){
   if(options.rejectCover&&u.pathname.endsWith('.png'))return new Response(null,{status:403});
   stored.set(u.pathname.slice(f.config.storagePathPrefix.length),{bytes:Buffer.from(o.body),mime:o.headers['content-type']});
   if(options.timeout)throw Error('synthetic network error with secret URL');
   if(options.redirect)return new Response(null,{status:307,headers:{location:'https://example.invalid'}});
   return new Response(null,{status:200});
  }
  assert.equal(u.hostname,'media.zernio.com');assert.equal(o.method,'GET');
  const r=stored.get(u.pathname.slice(1));
  return r?new Response(r.bytes,{status:200,headers:{'content-type':r.mime}}):new Response(null,{status:404});
 };
 return {send,calls,stored,options};
}
