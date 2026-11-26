import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {once} from 'node:events';
import {pathToFileURL} from 'node:url';
import {draftFixture} from './paired-draft-fixture.mjs';
async function driver(t,f,{enabled=true,form=true,options={}}={}){
 const child=spawn(process.execPath,['--import',pathToFileURL(path.resolve('test/paired-draft-preload.mjs')).href,process.env.SJ_BUNDLE_ENTRY||path.resolve('chat-pilot/server/index.mjs'),'off',f.folder,'off'],{env:{...process.env,HOME:f.root,USERPROFILE:f.root,SJ_TEST_ROOT:f.root,SJ_TEST_HTTP_OPTIONS:JSON.stringify(options),SAMANTHA_TRANSFER_ENABLED:'true',SAMANTHA_TRANSFER_CONFIG:f.configFile,SAMANTHA_TRANSFER_KEY:f.key,SAMANTHA_DRAFT_ENABLED:String(enabled),SAMANTHA_DRAFT_CONFIG:f.draftConfigFile,SAMANTHA_DRAFT_KEY:f.key},stdio:['pipe','pipe','pipe']});
 const ended=once(child,'close'),lines=createInterface({input:child.stdout})[Symbol.asyncIterator]();let error='',closed=false,id=0;
 child.stderr.on('data',x=>error+=x);
 const close=async()=>{if(closed)return;closed=true;child.stdin.end();await ended;assert.equal(error,'');};t.after(close);
 const send=q=>child.stdin.write(JSON.stringify({jsonrpc:'2.0',...q})+'\n');
 const get=async()=>{const n=await lines.next();assert(!n.done,error);return JSON.parse(n.value);};
 const call=async(name,args={})=>{send({id:++id,method:'tools/call',params:{name,arguments:args}});return get();};
 send({id:++id,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:form?{elicitation:{form:{}}}:{}}});assert.equal((await get()).result.serverInfo.version,'0.6.0');
 return {send,get,call,close};
}
const data=r=>JSON.parse(r.result.content[0].text);
const args=f=>({batchId:f.batch.batchId,contentId:f.caption.contentId});
const accept=(d,req,field)=>d.send({id:req.id,result:{action:'accept',content:{[field]:true}}});
async function upload(d,f){
 const v=data(await d.call('review_samantha_transfer_batch',{batchId:f.batch.batchId}));
 const req=await d.call('transfer_samantha_approved_batch',{batchId:f.batch.batchId,reviewBinding:v.reviewBinding});
 assert.equal(req.method,'elicitation/create');accept(d,req,'approveExactTransfer');
 assert.equal(data(await d.get()).outcome,'TRANSFERRED_TO_TEMPORARY_MEDIA_STORAGE');
}
test('packaged stdio: approved transfer to native-confirmed paired draft, both covers verified and repeat creates nothing',async t=>{
 const f=await draftFixture(t),d=await driver(t,f,{options:{rewrittenUrls:true}});await upload(d,f);
 assert.equal(data(await d.call('preflight_samantha_drafts')).ready,true);
 const v=data(await d.call('review_samantha_draft_pair',args(f)));
 const req=await d.call('save_samantha_paired_draft',{...args(f),reviewBinding:v.reviewBinding});
 assert.equal(req.method,'elicitation/create');assert(req.params.message.includes(f.caption.caption));assert(req.params.message.includes('synthetic-ig'));assert(req.params.message.includes('synthetic-fb'));assert(!req.params.message.includes('https://'));
 accept(d,req,'approveExactPairedDraft');const result=data(await d.get());
 assert.equal(result.outcome,'verified-draft');assert(Object.values(result.platforms).every(s=>s==='cover-field-and-bytes-verified'));assert.equal(result.nativePreviewVerified,false);assert(!JSON.stringify(result).includes('https://'));
 await d.close();const d2=await driver(t,f);
 assert.equal(data(await d2.call('save_samantha_paired_draft',{...args(f),reviewBinding:v.reviewBinding})).outcome,'verified-draft');
 const calls=JSON.parse(await fs.readFile(path.join(f.root,'http-calls.json')));assert(calls.every(c=>c.method==='GET'));
});
test('packaged stdio: partial cover readback reports each platform and read-only restart recovery',async t=>{
 const f=await draftFixture(t),d=await driver(t,f,{options:{missingCover:'facebook'}});await upload(d,f);
 const v=data(await d.call('review_samantha_draft_pair',args(f))),req=await d.call('save_samantha_paired_draft',{...args(f),reviewBinding:v.reviewBinding});accept(d,req,'approveExactPairedDraft');
 const result=data(await d.get());assert.equal(result.outcome,'held');assert.equal(result.platforms.facebook,'unverified-or-mismatched');assert.equal(result.platforms.instagram,'cover-field-and-bytes-verified');
 await d.close();const d2=await driver(t,f);
 assert.equal(data(await d2.call('reconcile_samantha_paired_draft',{contentId:f.caption.contentId,revision:1})).outcome,'verified-draft');
 const calls=JSON.parse(await fs.readFile(path.join(f.root,'http-calls.json')));assert(calls.every(c=>c.method==='GET'));
});
test('packaged stdio: uncertain create reconciles by exact saved external ID after restart, no second POST',async t=>{
 const f=await draftFixture(t),d=await driver(t,f,{options:{timeoutAfterCreate:true}});await upload(d,f);
 const v=data(await d.call('review_samantha_draft_pair',args(f))),req=await d.call('save_samantha_paired_draft',{...args(f),reviewBinding:v.reviewBinding});accept(d,req,'approveExactPairedDraft');
 assert.equal(data(await d.get()).outcome,'uncertain');await d.close();
 const d2=await driver(t,f);
 assert.equal(data(await d2.call('reconcile_samantha_paired_draft',{contentId:f.caption.contentId,revision:1})).outcome,'verified-draft');
 const calls=JSON.parse(await fs.readFile(path.join(f.root,'http-calls.json')));assert(calls.every(c=>c.method==='GET'));assert(calls.some(c=>c.path==='/api/v1/posts'));
});
test('packaged stdio: draft opt-in off and unsupported form cannot create',async t=>{
 const f=await draftFixture(t),d=await driver(t,f,{enabled:false});
 d.send({id:100,method:'tools/list'});assert(!(await d.get()).result.tools.some(t=>t.name==='save_samantha_paired_draft'));
 assert.equal(data(await d.call('preflight_samantha_drafts')).enabled,false);
 assert((await d.call('save_samantha_paired_draft',{...args(f),reviewBinding:'a'.repeat(64)})).result.isError);
 await d.close();const d2=await driver(t,f,{form:false});
 const result=await d2.call('save_samantha_paired_draft',{...args(f),reviewBinding:'a'.repeat(64)});assert(result.result.isError);assert.match(result.result.content[0].text,/Native form/);
 await assert.rejects(fs.readFile(path.join(f.root,'http-calls.json')));
});
test('packaged stdio: native decline, forged approval and scheduling arguments cannot create drafts',async t=>{
 const f=await draftFixture(t),d=await driver(t,f);await upload(d,f);
 const v=data(await d.call('review_samantha_draft_pair',args(f))),base={...args(f),reviewBinding:v.reviewBinding};
 for(const extra of [{publishNow:true},{scheduledFor:'2030-01-01'},{approveExactPairedDraft:true},{mediaItems:[]}]){
  assert((await d.call('save_samantha_paired_draft',{...base,...extra})).result.isError);
 }
 const req=await d.call('save_samantha_paired_draft',base);d.send({id:req.id,result:{action:'decline'}});
 assert((await d.get()).result.isError);
 const calls=JSON.parse(await fs.readFile(path.join(f.root,'http-calls.json')));assert(!calls.some(c=>c.path==='/api/v1/posts'));
});
test('packaged stdio: caption change after native form refuses create',async t=>{
 const f=await draftFixture(t),d=await driver(t,f);await upload(d,f);
 const v=data(await d.call('review_samantha_draft_pair',args(f))),req=await d.call('save_samantha_paired_draft',{...args(f),reviewBinding:v.reviewBinding});
 f.caption.caption+=' changed';await f.writeCaption();accept(d,req,'approveExactPairedDraft');
 const result=await d.get();assert(result.result.isError);assert.match(result.result.content[0].text,/DRAFT_REVIEW_CHANGED/);
 const calls=JSON.parse(await fs.readFile(path.join(f.root,'http-calls.json')));assert(!calls.some(c=>c.path==='/api/v1/posts'));
});
