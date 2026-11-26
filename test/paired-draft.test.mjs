import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import {draftFixture} from './paired-draft-fixture.mjs';
const yes=async()=>true;
const review=f=>f.drafts.review(f.batch.batchId,f.caption.contentId);
const create=(f,v,approve=yes)=>f.drafts.create(f.batch.batchId,f.caption.contentId,v.reviewBinding,approve);
const postCalls=f=>f.http.calls.filter(c=>c.method==='POST'&&c.path==='/api/v1/posts');
test('one draft attaches exact PNG for both accounts; verifies readback and copied media bytes; no duplicate',async t=>{
 const f=await draftFixture(t,{rewrittenUrls:true});await f.upload();const v=await review(f);
 assert(!JSON.stringify(v).includes('https://'));
 let approved=0;const r=await create(f,v,async view=>{approved++;assert.equal(view.caption,f.caption.caption);assert.equal(Object.keys(view.targets).length,2);return true;});
 assert.equal(approved,1);assert.equal(r.outcome,'verified-draft');assert.equal(r.nativePreviewVerified,false);
 assert(Object.values(r.platforms).every(s=>s==='cover-field-and-bytes-verified'));assert(!JSON.stringify(r).includes('https://'));
 assert.equal(postCalls(f).length,1);
 const body=JSON.parse(postCalls(f)[0].body);
 assert.equal(body.mediaItems.length,1);assert.equal(body.mediaItems[0].thumbnail,body.platforms[0].platformSpecificData.instagramThumbnail);
 await create(f,v,()=>assert.fail('Must not ask or create again'));assert.equal(postCalls(f).length,1);
 assert.equal(f.http.calls.filter(c=>c.method==='PUT').length,2);
});
test('native denial and changed approved caption stop before create',async t=>{
 const f=await draftFixture(t);await f.upload();const v=await review(f);
 await assert.rejects(create(f,v,async()=>false),/DRAFT_OPERATOR_DECLINED/);
 await assert.rejects(create(f,v,async()=>{f.caption.caption+=' Changed';await f.writeCaption();return true;}),/DRAFT_REVIEW_CHANGED/);
 assert.equal(postCalls(f).length,0);
});
for(const [name,setup] of [
 ['pending cover',async f=>{f.http.options.rejectCover=true;await assert.rejects(f.upload());}],
 ['For Review caption',async f=>{await f.upload();f.caption.status='For Review';await f.writeCaption();}],
 ['mismatched revision',async f=>{await f.upload();f.caption.revision=2;await f.writeCaption();}],
 ['missing caption manifest',async f=>{await f.upload();await fs.unlink(f.captionPath);}]
])test('rejects '+name+' before draft readiness',async t=>{
 const f=await draftFixture(t);await setup(f);await assert.rejects(review(f));assert.equal(postCalls(f).length,0);
});
test('wrong connected account scope and missing remote cover stop before POST',async t=>{
 const f=await draftFixture(t);await f.upload();const v=await review(f);
 f.http.options.wrongTargets=true;await assert.rejects(create(f,v));assert.equal(postCalls(f).length,0);
 f.http.options.wrongTargets=false;f.http.options.corruptCover=true;await assert.rejects(create(f,v),/DRAFT_MEDIA_UNCONFIRMED/);
 assert.equal(postCalls(f).length,0);
});
for(const platform of ['instagram','facebook'])test('missing '+platform+' cover is held; partial state reported; read-only reconcile fixes it',async t=>{
 const f=await draftFixture(t,{missingCover:platform});await f.upload();const v=await review(f),r=await create(f,v);
 assert.equal(r.outcome,'held');assert.equal(r.platforms[platform],'unverified-or-mismatched');
 const other=platform==='instagram'?'facebook':'instagram';assert.equal(r.platforms[other],'cover-field-and-bytes-verified');
 f.http.options.missingCover=null;
 const reconciled=await f.drafts.reconcile(f.caption.contentId,1);assert.equal(reconciled.outcome,'verified-draft');assert.equal(postCalls(f).length,1);
});
test('lost create response cannot resend; unique external ID lookup reconciles',async t=>{
 const f=await draftFixture(t,{timeoutAfterCreate:true});await f.upload();const v=await review(f),r=await create(f,v);
 assert.equal(r.outcome,'uncertain');assert.equal(r.draftId,null);
 f.http.options.timeoutAfterCreate=false;
 const second=await create(f,v,()=>assert.fail('No repeated approval'));assert.equal(second.outcome,'verified-draft');assert.equal(postCalls(f).length,1);
});
for(const option of ['noMatch','queryMany'])test('uncertain lookup '+option+' stays held without second POST',async t=>{
 const f=await draftFixture(t,{timeoutAfterCreate:true});await f.upload();const v=await review(f);await create(f,v);
 f.http.options[option]=true;
 const r=await f.drafts.reconcile(f.caption.contentId,1);assert.equal(r.outcome,'held');assert.equal(postCalls(f).length,1);
});
for(const option of ['scheduled','wrongPostAccount'])test('unexpected '+option+' readback is held',async t=>{
 const f=await draftFixture(t,{[option]:true});await f.upload();const v=await review(f),r=await create(f,v);
 assert.equal(r.outcome,'held');assert.equal(postCalls(f).length,1);assert(Object.values(r.platforms).every(s=>s==='unverified'));
});
test('corrupt private draft body cannot enable schedule or new POST',async t=>{
 const f=await draftFixture(t);await f.upload();const v=await review(f);await create(f,v);
 const filename=(await fs.readdir(f.draftState)).find(n=>n.endsWith('.json')),p=path.join(f.draftState,filename),row=JSON.parse(await fs.readFile(p));
 row.body.publishNow=true;await fs.writeFile(p,JSON.stringify(row));
 await assert.rejects(f.drafts.reconcile(f.caption.contentId,1),/DRAFT_RECEIPT_INVALID/);assert.equal(postCalls(f).length,1);
});


test('expired upload receipts block new draft readiness',async t=>{
 const f=await draftFixture(t);await f.upload();
 const p=path.join(f.state,'receipts.json'),ledger=JSON.parse(await fs.readFile(p));
 Object.values(ledger.parts).forEach(r=>r.completedAt=Date.now()-24*3600000);await fs.writeFile(p,JSON.stringify(ledger));
 await assert.rejects(review(f),/DRAFT_REQUIRES_COMPLETE_UNEXPIRED_BATCH/);assert.equal(postCalls(f).length,0);
});
test('change during final remote byte check stops immediately before draft reservation',async t=>{
 const f=await draftFixture(t);await f.upload();
 const {makeDraftEngine}=await import('../draft-only/core.mjs');
 let changed=false;
 f.drafts=makeDraftEngine({enabled:true,configFile:f.draftConfigFile,key:f.key,state:f.draftState,transfer:f.transfer,send:async(raw,o)=>{
  const r=await f.http.send(raw,o);
  if(!changed&&o.method==='GET'&&new URL(raw).hostname==='media.zernio.com'&&new URL(raw).pathname.endsWith('.png')){
   changed=true;f.caption.caption+=' late mutation';await f.writeCaption();
  }
  return r;
 }});
 const v=await review(f);await assert.rejects(create(f,v),/DRAFT_REVIEW_CHANGED/);assert.equal(postCalls(f).length,0);
});
test('concurrent draft requests cannot reserve or POST twice',async t=>{
 const f=await draftFixture(t);await f.upload();const v=await review(f);
 const r=await Promise.allSettled([create(f,v),create(f,v)]);
 assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal(postCalls(f).length,1);
});
test('transport refuses external/file media URLs and publish fields before HTTP',async t=>{
 const f=await draftFixture(t);await f.upload();const v=await review(f);await create(f,v);
 const {makeDraftTransport}=await import('../draft-only/transport.mjs'),provider=makeDraftTransport(f.draftConfig,f.key,f.http.send);
 const body=JSON.parse(postCalls(f)[0].body),requestId=body.externalId.slice('samantha-draft-'.length),count=f.http.calls.length;
 for(const value of ['file:///private/file.mp4','https://example.invalid/movie.mp4','https://media.zernio.com/temp/asset.mp4?secret=x']){
  const b=structuredClone(body);b.mediaItems[0].url=value;await assert.rejects(provider.create(b,requestId));
 }
 await assert.rejects(provider.create({...body,publishNow:true},requestId));assert.equal(f.http.calls.length,count);
});
