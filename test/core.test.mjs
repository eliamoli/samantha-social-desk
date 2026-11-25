const macPersistenceOnly={skip:process.platform==='win32'?'Inherited POSIX persistence test requires macOS/Unix; no Windows permission emulation':false};
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {inspect,execute,reconcile,compileDraft,verifyDraft} from '../draft/core.mjs';
import {makeZernio} from '../draft/zernio.mjs';
const aid='a'.repeat(24), fid='b'.repeat(24), pid='c'.repeat(24), draftId='d'.repeat(24);
const contentId='SJ-W03-R1', platform='instagram';
const videoUrl='https://media.zernio.com/temp/demo.mp4',coverUrl='https://media.zernio.com/temp/demo.png';
async function fixture(t,p=platform){
  const root=await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()),'sj-test-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const dir=path.join(root,'ledger'), approvedFolder=path.join(root,'approved');
  await fs.mkdir(approvedFolder);
  const c={profileId:pid,approvedFolder,targets:{instagram:{accountId:aid,username:'synthetic-ig'},facebook:{accountId:fid,username:'synthetic-fb'}}};
  const caption='Synthetic test only.';
  const mp4=Buffer.alloc(28);mp4.write('ftyp',4,'ascii');
  const png=Buffer.alloc(33);Buffer.from('89504e470d0a1a0a','hex').copy(png);png.writeUInt32BE(13,8);png.write('IHDR',12);png.writeUInt32BE(1080,16);png.writeUInt32BE(1920,20);
  const put=async (revision,text=caption)=>{
    await fs.writeFile(path.join(approvedFolder,contentId+'.json'),JSON.stringify({contentId,revision,caption:text}));
    await fs.writeFile(path.join(approvedFolder,contentId+'-v'+revision+'.mp4'),mp4);
    await fs.writeFile(path.join(approvedFolder,contentId+'-v'+revision+'.png'),png);
  };
  await put(1);
  const review=await inspect(c,contentId,p);
  return {args:{dir,c,contentId,platform:p,approvedBinding:review.binding},view:review.view,put};
}
const post=body=>({_id:draftId,status:'draft',...structuredClone(body)});
function fake({view,...mod}){
  const calls=[]; let body;
  return {calls,
    accounts:async profile=>{calls.push('accounts');assert.equal(profile,pid);return [{_id:view.accountId,profileId:{_id:pid},platform:view.platform,username:view.username,enabled:true}];},
    upload:async x=>{calls.push('upload');assert(x.bytes.length>0);return x.mime==='video/mp4'?videoUrl:coverUrl;},
    createDraft:async (b,key)=>{calls.push('create');assert.match(key,/^[a-f0-9-]{36}$/);body=b;return {_id:draftId};},
    getDraft:async d=>{calls.push('get');assert.equal(d,draftId);return post(body);},...mod};
}
for(const p of ['instagram','facebook'])test(p+' exact approved payload & receipt; same ID never creates again',macPersistenceOnly,async t=>{
  const {args,view,put}=await fixture(t,p);
  const provider=fake({view});
  assert.deepEqual(await execute({...args,provider}),{draftId,state:'verified-draft',contentId,revision:1,platform:p});
  assert.deepEqual(provider.calls,['accounts','upload','upload','create','get']);
  const body=compileDraft(view,videoUrl,coverUrl);
  assert.deepEqual(Object.keys(body).sort(),['content','isDraft','mediaItems','platforms']);
  assert.equal(body.isDraft,true);
  if(p==='instagram')assert.equal(body.platforms[0].platformSpecificData.instagramThumbnail,coverUrl);
  else assert.equal(body.mediaItems[0].thumbnail,coverUrl);
  await put(2); const {binding}=await inspect(args.c,contentId,p);
  await assert.rejects(execute({...args,approvedBinding:binding,provider}),/never resubmit/);
  assert.equal(provider.calls.filter(x=>x==='create').length,1);
});
test('changed caption or outside account cannot upload',macPersistenceOnly,async t=>{
  const {args,view,put}=await fixture(t);
  const provider=fake({view});
  await put(1,'Changed.');await assert.rejects(execute({...args,provider}),/changed/);
  assert.deepEqual(provider.calls,[]);
  await put(1);
  await assert.rejects(execute({...args,provider:{...provider,accounts:async()=>[{_id:aid,profileId:fid,platform,username:view.username,isActive:true}]}}),/exact active/);
  assert.deepEqual(provider.calls,[]);
});
test('timed-out write is durably held; exact draft can be reconciled without another POST',macPersistenceOnly,async t=>{
  const {args,view}=await fixture(t);
  let sends=0;
  const provider=fake({view,createDraft:async()=>{sends++;throw Error('network lost');},getDraft:async()=>post(compileDraft(view,videoUrl,coverUrl))});
  await assert.rejects(execute({...args,provider}),/network lost/);
  await assert.rejects(execute({...args,provider}),/never resubmit/);
  assert.equal(sends,1);
  const r=await reconcile({...args,draftId,provider});
  assert.equal(r.draftId,draftId);
  assert.equal(sends,1);
});
test('wrong thumbnail, scheduled readback or populated mismatched account blocks verification',async t=>{
  const {view}=await fixture(t);
  const body=compileDraft(view,videoUrl,coverUrl);
  assert.throws(()=>verifyDraft({...post(body),scheduledFor:'2026-11-30T19:30:00Z'},body,draftId),/unscheduled/);
  const wrong=post(body);delete wrong.platforms[0].platformSpecificData.instagramThumbnail;
  assert.throws(()=>verifyDraft(wrong,body,draftId),/cover/);
  wrong.platforms[0].accountId={_id:fid};
  assert.throws(()=>verifyDraft(wrong,body,draftId),/destination/);
});
test('concurrency cannot produce two posts and symlink media is rejected',macPersistenceOnly,async t=>{
  const {args,view}=await fixture(t);
  const f=path.join(args.c.approvedFolder,contentId+'-v1.mp4');
  await fs.rename(f,f+'.saved');await fs.symlink(f+'.saved',f);
  await assert.rejects(inspect(args.c,contentId,platform),/ELOOP/);
  await fs.unlink(f);await fs.rename(f+'.saved',f);
  const provider=fake({view});
  const r=await Promise.allSettled([execute({...args,provider}),execute({...args,provider})]);
  assert.equal(r.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(provider.calls.filter(x=>x==='create').length,1);
});
test('real transport shape with fake fetch never follows redirects, leaks bearer to storage or accepts scheduling fields',async t=>{
  const {view}=await fixture(t), calls=[],storageHost='e'.repeat(32)+'.r2.cloudflarestorage.com';
  const send=async(u,o)=>{calls.push({u,o});
    if(u.pathname==='/api/v1/media/presign')return Response.json({uploadUrl:'https://'+storageHost+'/a?X-Amz-Signature=synthetic',publicUrl:coverUrl});
    if(o.method==='PUT')return new Response(null,{status:200});
    return Response.json({post:{_id:draftId}});
  };
  const z=makeZernio({key:'mock-never-real-key',storageHost,send});
  await z.upload({name:'x.png',mime:'image/png',bytes:Buffer.from('fixture')});
  assert.equal(calls[0].u.hostname,'zernio.com');assert.equal(calls[1].u.hostname,storageHost);
  assert.equal(calls[1].o.headers.authorization,undefined);
  const body=compileDraft(view,videoUrl,coverUrl);
  await assert.rejects(z.createDraft({...body,scheduledFor:'never'},'id'),/Only/);
  const edited=structuredClone(body);edited.platforms[0].scheduledFor='never';
  await assert.rejects(z.createDraft(edited,'id'),/Invalid target/);
  const result=await z.createDraft(body,'id');assert.equal(result._id,draftId);
  assert(calls.every(x=>x.o.redirect==='error'));
  assert.equal(calls.filter(x=>x.u.pathname==='/api/v1/posts').length,1);
  const poisoned=makeZernio({key:'mock-never-real-key',storageHost,send:async()=>Response.json({uploadUrl:'https://example.test/?X-Amz-Signature=fake',publicUrl:coverUrl})});
  await assert.rejects(poisoned.upload({name:'x.png',mime:'image/png',bytes:Buffer.from('fixture')}),/Unexpected presign host/);
});
