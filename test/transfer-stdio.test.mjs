import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {once} from 'node:events';
import {pathToFileURL} from 'node:url';
import {fixture} from './transfer-fixture.mjs';
async function driver(t,f,{enabled=true,form=true,options={}}={}) {
 const entry=process.env.SJ_BUNDLE_ENTRY||path.resolve('chat-pilot/server/index.mjs');
 const child=spawn(process.execPath,['--import',pathToFileURL(path.resolve('test/transfer-preload.mjs')).href,entry,'off',f.folder,'off'],{env:{...process.env,HOME:f.root,USERPROFILE:f.root,SJ_TEST_ROOT:f.root,SJ_TEST_HTTP_OPTIONS:JSON.stringify(options),SAMANTHA_TRANSFER_ENABLED:String(enabled),SAMANTHA_TRANSFER_CONFIG:f.configFile,SAMANTHA_TRANSFER_KEY:f.key},stdio:['pipe','pipe','pipe']});
 const ended=once(child,'close');
 const lines=createInterface({input:child.stdout})[Symbol.asyncIterator]();let error='';
 child.stderr.on('data',x=>error+=x);
 let closed=false;
 async function close(){if(closed)return;closed=true;child.stdin.end();await ended;assert.equal(error,'');}
 t.after(close);
 let id=0;
 const send=q=>child.stdin.write(JSON.stringify({jsonrpc:'2.0',...q})+'\n');
 const get=async()=>{const next=await lines.next();assert(!next.done,error);return JSON.parse(next.value);};
 async function call(name,args={}){send({id:++id,method:'tools/call',params:{name,arguments:args}});return get();}
 send({id:++id,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:form?{elicitation:{form:{}}}:{}}});
 assert.equal((await get()).result.serverInfo.version,'0.5.0');
 return {send,get,call,close,child};
}
const parsed=r=>JSON.parse(r.result.content[0].text);
const text=r=>r.result.content[0].text;
const approve=(d,r,content={approveExactTransfer:true})=>d.send({id:r.id,result:{action:'accept',content}});
test('stdio full entry: preview, preflight, exact native approval, paired PUTs, restart receipt reuse',async t=>{
 const f=await fixture(t),d=await driver(t,f);
 const preview=await d.call('review_samantha_mock_reel');assert.equal(preview.result.content[1].mimeType,'image/png');
 assert.equal(parsed(await d.call('preflight_samantha_transfer')).ready,true);
 const v=parsed(await d.call('review_samantha_transfer_batch',{batchId:f.batch.batchId}));
 const req=await d.call('transfer_samantha_approved_batch',{batchId:f.batch.batchId,reviewBinding:v.reviewBinding});
 assert.equal(req.method,'elicitation/create');
 for(const p of v.parts){assert(req.params.message.includes(p.name));assert(req.params.message.includes(p.sha256));assert(req.params.message.includes(String(p.size)));}
 assert(req.params.message.includes('Synthetic workspace'));
 await assert.rejects(fs.readFile(path.join(f.root,'http-calls.json')));
 approve(d,req);
 const result=await d.get();assert.equal(parsed(result).outcome,'TRANSFERRED_TO_TEMPORARY_MEDIA_STORAGE');
 assert(!text(result).includes('https://'));assert(!text(result).includes(f.key));
 await d.close();
 const d2=await driver(t,f);const reused=await d2.call('transfer_samantha_approved_batch',{batchId:f.batch.batchId,reviewBinding:v.reviewBinding});
 assert.match(parsed(reused).outcome,/REUSED/);
 const calls=JSON.parse(await fs.readFile(path.join(f.root,'http-calls.json')));
 assert.equal(calls.filter(c=>c.method==='PUT').length,2);
 assert(calls.filter(c=>c.method==='PUT').every(c=>!c.authPresent));
 assert(calls.every(c=>!c.path.includes('/posts')));
});
test('stdio native decline and malformed response never send network bytes',async t=>{
 const f=await fixture(t),d=await driver(t,f);
 const v=parsed(await d.call('review_samantha_transfer_batch',{batchId:f.batch.batchId}));
 for(const answer of [{approveExactTransfer:false},{approveExactTransfer:true,publishNow:true}]){
  const req=await d.call('transfer_samantha_approved_batch',{batchId:f.batch.batchId,reviewBinding:v.reviewBinding});approve(d,req,answer);
  assert.match(text(await d.get()),/OPERATOR_DECLINED/);
 }
 await assert.rejects(fs.readFile(path.join(f.root,'http-calls.json')));
});
test('stdio rejects no native capability, forged approval tool args, and extra schedule fields',async t=>{
 const f=await fixture(t),d=await driver(t,f,{form:false});
 const v=parsed(await d.call('review_samantha_transfer_batch',{batchId:f.batch.batchId}));
 assert.equal(parsed(await d.call('preflight_samantha_transfer')).ready,false);
 const r=await d.call('transfer_samantha_approved_batch',{batchId:f.batch.batchId,reviewBinding:v.reviewBinding});
 assert.match(text(r),/Native form/);
 assert((await d.call('transfer_samantha_approved_batch',{batchId:f.batch.batchId,reviewBinding:v.reviewBinding,approveExactTransfer:true})).result.isError);
 await assert.rejects(fs.readFile(path.join(f.root,'http-calls.json')));
});
test('stdio disabled default lists benign preflight and preserves local preview; no transfer route',async t=>{
 const f=await fixture(t),d=await driver(t,f,{enabled:false});
 d.send({id:99,method:'tools/list'});const tools=(await d.get()).result.tools.map(t=>t.name);
 assert.deepEqual(tools,['review_samantha_mock_reel','preflight_samantha_transfer','review_samantha_local_reel']);
 assert.equal(parsed(await d.call('preflight_samantha_transfer')).enabled,false);
 assert((await d.call('review_samantha_transfer_batch',{batchId:f.batch.batchId})).result.isError);
});
test('stdio cover rejection restarts and resumes without re-uploading video or asking twice',async t=>{
 const f=await fixture(t),d=await driver(t,f,{options:{rejectCover:true}});
 const v=parsed(await d.call('review_samantha_transfer_batch',{batchId:f.batch.batchId}));
 const req=await d.call('transfer_samantha_approved_batch',{batchId:f.batch.batchId,reviewBinding:v.reviewBinding});approve(d,req);
 assert.match(text(await d.get()),/PUT_REJECTED/);await d.close();
 const d2=await driver(t,f);
 const result=await d2.call('transfer_samantha_approved_batch',{batchId:f.batch.batchId,reviewBinding:v.reviewBinding});
 assert.equal(parsed(result).outcome,'TRANSFERRED_TO_TEMPORARY_MEDIA_STORAGE');
 const calls=JSON.parse(await fs.readFile(path.join(f.root,'http-calls.json')));
 assert.equal(calls.filter(c=>c.method==='PUT').length,1);assert(calls.find(c=>c.method==='PUT').path.endsWith('.png'));
});
test('stdio changed manifest after form stops before any network request',async t=>{
 const f=await fixture(t),d=await driver(t,f);
 const v=parsed(await d.call('review_samantha_transfer_batch',{batchId:f.batch.batchId}));
 const req=await d.call('transfer_samantha_approved_batch',{batchId:f.batch.batchId,reviewBinding:v.reviewBinding});
 await fs.appendFile(path.join(f.folder,'transfer-batch-'+f.batch.batchId+'.json'),' ');
 approve(d,req);assert.match(text(await d.get()),/REVIEW_CHANGED/);
 await assert.rejects(fs.readFile(path.join(f.root,'http-calls.json')));
});
