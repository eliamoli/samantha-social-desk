import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {generateKeyPairSync,sign} from 'node:crypto';
import {makeOfflineDraftGate,approvalBytes} from '../draft/approval-gate.mjs';
import {makeZernio} from '../draft/zernio.mjs';
import {auditDraftRetention} from '../draft/retention.mjs';
const id='SJ-W03-R1',pid='c'.repeat(24),aid='a'.repeat(24),fid='b'.repeat(24),did='d'.repeat(24);
const hostname='e'.repeat(32)+'.r2.cloudflarestorage.com',deploy='synthetic-deployment-24char';
async function setup(t,scenario={}){
 const root=await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()),'samantha-offline-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const folder=path.join(root,'approved'), dir=path.join(root,'ledger');
 await fs.cp('chat-pilot/server/fixtures',folder,{recursive:true});
 const c={profileId:pid,approvedFolder:folder,targets:{instagram:{accountId:aid,username:'synthetic-ig'},facebook:{accountId:fid,username:'synthetic-fb'}}};
 const {privateKey,publicKey}=generateKeyPairSync('ed25519');
 let now=1e9; const calls=[]; let post;
 async function send(u,o){
  calls.push(o.method+' '+u.pathname);
  assert.equal(o.redirect,'error');
  if(u.hostname===hostname){assert.equal(o.headers.authorization,undefined);return new Response(null,{status:204});}
  assert.equal(u.hostname,'zernio.com');
  if(u.pathname.endsWith('/accounts')){
   assert.equal(u.searchParams.get('profileId'),pid);
   return Response.json({accounts:Object.entries(c.targets).map(([platform,x])=>({...x,_id:x.accountId,platform,profileId:scenario.wrongProfile?did:pid}))});
  }
  if(u.pathname.endsWith('/presign')){
   const p=JSON.parse(o.body);assert(p.size>0);
   return Response.json({uploadUrl:'https://'+hostname+'/'+p.filename+'?X-Amz-Signature=mock',publicUrl:'https://media.zernio.com/temp/'+p.filename});
  }
  if(u.pathname.endsWith('/posts')&&o.method==='POST'){
   const b=JSON.parse(o.body);assert.equal(b.isDraft,true);assert.deepEqual(Object.keys(b).sort(),['content','isDraft','mediaItems','platforms']);
   assert.match(o.headers['idempotency-key'],/^[a-f0-9-]{36}$/);post={_id:did,status:'draft',...b};
   if(scenario.timeout)throw Error('Simulated response lost');
   return Response.json({post});
  }
  if(u.pathname.endsWith('/'+did))return Response.json({post});
  throw Error('No offline fixture for route');
 }
 const provider=makeZernio({key:'mock-offline-never-real',send,storageHost:hostname});
 const gate=()=>makeOfflineDraftGate({provider,publicKey,deploymentId:deploy,dir,c,clock:()=>now});
 const permit=async p=>{const {challenge}=await gate().review(id,p);return {...challenge,signature:sign(null,approvalBytes(challenge),privateKey).toString('base64url')};};
 return {gate,permit,c,calls,advance:()=>now+=300000,post:()=>post,getDraft:provider.getDraft,now:()=>now};
}
for(const p of ['instagram','facebook']) test('signed review through HTTP adapter and '+p+' cover readback',async t=>{
 const x=await setup(t),a=await x.permit(p);
 const other=await x.permit(p==='facebook'?'instagram':'facebook');
 await assert.rejects(x.gate().draft(id,p,other),/changed/);
 await assert.rejects(x.gate().draft(id,p,{...a,signature:'A'.repeat(86)}),/approval/);
 assert.equal(x.calls.length,0);
 const settled=await Promise.allSettled([x.gate().draft(id,p,a),x.gate().draft(id,p,a)]);
 assert.equal(settled.filter(o=>o.status==='fulfilled').length,1);
 const saved=x.post(),media=saved.mediaItems[0],data=saved.platforms[0].platformSpecificData;
 assert.match(p==='instagram'?data.instagramThumbnail:media.thumbnail,/\.png$/);
 assert.equal(x.calls.filter(a=>a==='POST /api/v1/posts').length,1);
 await assert.rejects(x.gate().draft(id,p,a),/never resubmit/);
});
test('stale permit and wrong-account response stop before media transfer',async t=>{
 const x=await setup(t,{wrongProfile:true}),a=await x.permit('instagram');
 await assert.rejects(x.gate().draft(id,'instagram',a),/exact active/);
 x.advance();await assert.rejects(x.gate().draft(id,'instagram',a),/expired/);
 assert.deepEqual(x.calls,['GET /api/v1/accounts']);
});
test('timeout after POST holds ledger, reconciles ID, and expired cover cannot promote',async t=>{
 const x=await setup(t,{timeout:true}),a=await x.permit('instagram');
 await assert.rejects(x.gate().draft(id,'instagram',a),/Simulated response lost/);
 await assert.rejects(x.gate().draft(id,'instagram',a),/never resubmit/);
 const readback=await x.gate().recover(id,'instagram',did);assert.equal(readback.draftId,did);
 const now=x.now(),old=now-604800000,post=x.post();
 const params={draftId:did,readDraft:x.getDraft,expected:post,now,videoUploadedAt:now-1,coverUploadedAt:old,probe:async()=>'available'};
 const held=await auditDraftRetention(params);
 assert.deepEqual(held,{draftId:did,status:'held',issues:['cover temporary upload age expired or unknown'],canPromote:false});
 const permanent=await auditDraftRetention({...params,probe:async()=> 'verified-permanent'});
 assert.equal(permanent.status,'draft-assets-verified');assert.equal(permanent.canPromote,false);
 const wrong={...post,scheduledFor:'2026-11-30T00:00:00Z'};
 assert.equal((await auditDraftRetention({...params,readDraft:async()=>wrong})).status,'held');
 const repaired=structuredClone(post);
 repaired.platforms[0].platformSpecificData.instagramThumbnail='https://media.zernio.com/temp/repaired.png';
 const verified=await auditDraftRetention({...params,expected:repaired,readDraft:async()=>repaired,coverUploadedAt:now-1});
 assert.equal(verified.draftId,did);assert.equal(verified.status,'draft-assets-verified');assert.equal(verified.canPromote,false);
 assert.equal(x.calls.filter(a=>a==='POST /api/v1/posts').length,1);
});
