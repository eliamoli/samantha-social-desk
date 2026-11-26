import * as fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {check,exact,digest,sha,readFile,privateDirectory,save,load,syncDirectory,parseJson,TransferError} from '../transfer/files.mjs';
import {id,compileDraft,verifyDraft} from '../draft/core.mjs';
import {assemblePairedMedia} from '../transfer/draft-preview.mjs';
import {makeDraftTransport} from './transport.mjs';
export function makePairedDraftBody(view,receipts,requestId) {
 const media=assemblePairedMedia(view.parts,receipts,'facebook');
 const video=receipts.find(p=>p.kind==='video'),cover=receipts.find(p=>p.kind==='cover');
 const bodies=['instagram','facebook'].map(platform=>compileDraft({...view,platform,...view.targets[platform]},video.publicUrl,cover.publicUrl));
 return {isDraft:true,content:view.caption,mediaItems:media.mediaItems,platforms:bodies.map(b=>b.platforms[0]),externalId:'samantha-draft-'+requestId};
}
export function makeDraftEngine({enabled,configFile,key,state,transfer,send=globalThis.fetch,now=Date.now}) {
 async function config(){
  check(enabled,'DRAFT_DISABLED');check(path.isAbsolute(configFile||''),'DRAFT_SETUP_REQUIRED');
  const raw=await readFile(path.dirname(configFile),path.basename(configFile),16384,true),c=parseJson(raw);
  check(exact(c,['version','destinationId','destinationLabel','expectedOwnerId','credentialSha256','profileId','targets'])&&c.version===1&&/^[A-Z0-9][A-Z0-9_-]{0,47}$/.test(c.destinationId)&&/^[A-Za-z0-9 ._-]{1,80}$/.test(c.destinationLabel)&&id(c.expectedOwnerId)&&id(c.profileId)&&digest(c.credentialSha256),'DRAFT_CONFIG_INVALID');
  check(typeof key==='string'&&/^(sk|zrk)_[A-Za-z0-9_-]{32,256}$/.test(key)&&sha(key)===c.credentialSha256,'DRAFT_CREDENTIAL_PIN_MISMATCH');
  check(exact(c.targets,['instagram','facebook'])&&Object.values(c.targets).every(t=>exact(t,['accountId','username'])&&id(t.accountId)&&/^[A-Za-z0-9._-]{2,100}$/.test(t.username))&&c.targets.instagram.accountId!==c.targets.facebook.accountId,'DRAFT_TARGETS_INVALID');
  return {...c,configBinding:sha(raw)};
 }
 async function proof(c,snapshot,contentId){
  const {c:source,inv,receipts}=snapshot;
  check(source.destinationId===c.destinationId&&source.expectedOwnerId===c.expectedOwnerId,'DRAFT_DESTINATION_MISMATCH');
  const parts=inv.parts.filter(p=>p.contentId===contentId),rs=receipts.filter(p=>p.contentId===contentId);
  check(parts.length===2,'DRAFT_PAIR_MISSING');
  assemblePairedMedia(parts,rs,'instagram',now());
  const raw=await readFile(source.folder,contentId+'.draft.json',16384),m=parseJson(raw);
  check(exact(m,['contentId','revision','status','caption'])&&m.contentId===contentId&&m.revision===parts[0].revision&&m.status==='Approved'&&typeof m.caption==='string'&&m.caption.trim()===m.caption&&m.caption.length>0&&m.caption.length<=2200&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(m.caption),'DRAFT_CAPTION_NOT_APPROVED');
  const view={contentId,revision:m.revision,caption:m.caption,profileId:c.profileId,targets:c.targets,parts};
  const binding=sha(JSON.stringify({view,captionSha:sha(raw),transferBinding:inv.binding,receipts:rs,configBinding:c.configBinding}));
  return {view,receipts:rs,binding,batchId:inv.batchId};
 }
 async function locked(fn){
  await privateDirectory(state);let lock;
  try{lock=await fs.open(path.join(state,'draft.lock'),'wx',0o600);}catch{throw new TransferError('DRAFT_LOCKED');}
  try{await lock.writeFile(String(process.pid));await lock.sync();await syncDirectory(state);return await fn();}
  finally{await lock.close();await fs.unlink(path.join(state,'draft.lock'));await syncDirectory(state);}
 }
 const name=(c,contentId,revision)=>sha(JSON.stringify([c.profileId,c.targets,contentId,revision]))+'.json';
 function publicView(c,p){return {...p.view,batchId:p.batchId,destination:c.destinationLabel,reviewBinding:p.binding,action:'Create ONE unscheduled Zernio draft for this reel, targeting the exact Instagram and Facebook accounts, with the same PNG attached as cover. No publish, schedule or upload.'};}
 function report(row){return {contentId:row.view.contentId,revision:row.view.revision,outcome:row.status,draftId:row.postId,platforms:row.coverStates,nativePreviewVerified:false,next:row.status==='verified-draft'?'Draft cover fields and their bytes verified for both platforms. Inspect actual native previews before any separately authorized publication.':'Do not create again. Use reconcile_samantha_paired_draft; missing or mismatched readback remains held.'};}
 async function read(c,contentId,revision){
  const row=await load(state,name(c,contentId,revision));if(!row)return null;
  check(exact(row,['version','configBinding','binding','view','receipts','requestId','body','bodySha','postId','status','coverStates'])&&row.version===1&&row.configBinding===c.configBinding&&digest(row.binding)&&['uncertain','held','verified-draft'].includes(row.status)&&/^[a-f0-9-]{36}$/.test(row.requestId)&&(row.postId===null||id(row.postId)),'DRAFT_RECEIPT_INVALID');
  check(row.view.contentId===contentId&&row.view.revision===revision&&row.view.profileId===c.profileId&&JSON.stringify(row.view.targets)===JSON.stringify(c.targets)&&sha(JSON.stringify(row.body))===row.bodySha,'DRAFT_RECEIPT_INVALID');
  // Reconstruct with the original completion time only to validate the saved immutable payload.
  const at=Math.max(...row.receipts.map(p=>p.completedAt));
  const media=assemblePairedMedia(row.view.parts,row.receipts,'facebook',at);
  const bodies=['instagram','facebook'].map(platform=>compileDraft({...row.view,platform,...c.targets[platform]},row.receipts.find(p=>p.kind==='video').publicUrl,row.receipts.find(p=>p.kind==='cover').publicUrl));
  const expected={isDraft:true,content:row.view.caption,mediaItems:media.mediaItems,platforms:bodies.map(b=>b.platforms[0]),externalId:'samantha-draft-'+row.requestId};
  check(JSON.stringify(expected)===JSON.stringify(row.body),'DRAFT_RECEIPT_INVALID');return row;
 }
 async function reconcile(c,row){
  const provider=makeDraftTransport(c,key,send),filename=name(c,row.view.contentId,row.view.revision);
  try {
   await provider.verifyTargets();
   if(!row.postId){row.postId=await provider.find(row.body.externalId);await save(state,filename,row);}
   const post=await provider.get(row.postId);
   check(post&&post._id===row.postId&&post.externalId===row.body.externalId&&post.status==='draft'&&post.isDraft!==false&&post.content===row.view.caption&&post.scheduledFor==null&&post.publishedAt==null&&post.publishNow!==true&&post.queueId==null&&post.queuedFromProfile==null&&post.recycling==null&&post.platforms?.length===2&&post.mediaItems?.length===1,'DRAFT_READBACK_MISMATCH');
   for(const platform of ['instagram','facebook']){const ts=post.platforms.filter(p=>p.platform===platform);check(ts.length===1&&[undefined,'draft','pending'].includes(ts[0].status)&&ts[0].publishNow!==true&&ts[0].queueId==null&&(typeof ts[0].accountId==='string'?ts[0].accountId:ts[0].accountId?._id)===c.targets[platform].accountId,'DRAFT_READBACK_MISMATCH');}
   const media=post.mediaItems[0];check(media.type==='video','DRAFT_READBACK_MISMATCH');
   const video=row.receipts.find(p=>p.kind==='video'),cover=row.receipts.find(p=>p.kind==='cover');
   await provider.verifyMedia(media.url,video);
   for(const platform of ['instagram','facebook']){
    try {
     const targets=post.platforms.filter(p=>p.platform===platform);check(targets.length===1,'DRAFT_READBACK_MISMATCH');const target=targets[0];
     const actualCover=platform==='instagram'?target.platformSpecificData?.instagramThumbnail:media.thumbnail;
     await provider.verifyMedia(actualCover,cover);
     if(platform==='instagram'&&media.instagramThumbnail!==undefined)await provider.verifyMedia(media.instagramThumbnail,cover);
     const expected=compileDraft({...row.view,platform,...c.targets[platform]},video.publicUrl,cover.publicUrl);
     const normalized=structuredClone({...post,platforms:[target]});
     normalized.mediaItems[0].url=video.publicUrl;
     if(platform==='instagram')normalized.platforms[0].platformSpecificData.instagramThumbnail=cover.publicUrl;
     else normalized.mediaItems[0].thumbnail=cover.publicUrl;
     verifyDraft(normalized,expected,row.postId);
     row.coverStates[platform]='cover-field-and-bytes-verified';
    }catch{row.coverStates[platform]='unverified-or-mismatched';}
   }
   row.status=Object.values(row.coverStates).every(s=>s==='cover-field-and-bytes-verified')?'verified-draft':'held';
  }catch{row.status='held';row.coverStates={instagram:'unverified',facebook:'unverified'};}
  await save(state,filename,row);return report(row);
 }
 return {
  async preflight(formCapable){
   if(!enabled)return {enabled:false,ready:false};
   try{await config();const source=await transfer.preflight(formCapable);return {enabled:true,ready:formCapable&&source.ready,transferReady:source.ready,nativeConfirmation:formCapable,liveVerified:false};}
   catch(e){return {enabled:true,ready:false,status:e instanceof TransferError?e.code:'DRAFT_SETUP_UNAVAILABLE'};}
  },
  async review(batchId,contentId){
   const c=await config();
   return transfer.withDraftBatch(batchId,async snapshot=>publicView(c,await proof(c,snapshot,contentId)));
  },
  async create(batchId,contentId,binding,approve){
   const c=await config();
   return transfer.withDraftBatch(batchId,async(snapshot,refresh)=>locked(async()=>{
    let p=await proof(c,snapshot,contentId);check(p.binding===binding,'DRAFT_REVIEW_CHANGED');
    const old=await read(c,contentId,p.view.revision);
    if(old){check(old.binding===p.binding,'DRAFT_EXISTING_BINDING_CHANGED');return reconcile(c,old);}
    const started=now();check(await approve(publicView(c,p))===true&&now()-started<300000,'DRAFT_OPERATOR_DECLINED');
    const current=await config();check(current.configBinding===c.configBinding,'DRAFT_REVIEW_CHANGED');
    p=await proof(c,await refresh(),contentId);check(p.binding===binding,'DRAFT_REVIEW_CHANGED');
    const provider=makeDraftTransport(c,key,send);await provider.verifyTargets();
    for(const r of p.receipts)await provider.verifyMedia(r.publicUrl,r);
    const lastConfig=await config(),lastProof=await proof(lastConfig,await refresh(),contentId);
    check(lastConfig.configBinding===c.configBinding&&lastProof.binding===binding&&now()-started<300000,'DRAFT_REVIEW_CHANGED');
    const requestId=randomUUID(),body=makePairedDraftBody(p.view,p.receipts,requestId);
    const row={version:1,configBinding:c.configBinding,binding:p.binding,view:p.view,receipts:p.receipts,requestId,body,bodySha:sha(JSON.stringify(body)),postId:null,status:'uncertain',coverStates:{instagram:'unverified',facebook:'unverified'}};
    const filename=name(c,contentId,p.view.revision);await save(state,filename,row);
    try{row.postId=await provider.create(body,requestId);await save(state,filename,row);}
    catch{return report(row);}
    return reconcile(c,row);
   }));
  },
  async reconcile(contentId,revision){
   const c=await config();
   return locked(async()=>{const row=await read(c,contentId,revision);check(row,'DRAFT_NO_ATTEMPT');return reconcile(c,row);});
  }
 };
}
export function draftError(e){return (e instanceof TransferError?e.code:'DRAFT_LOCAL_OR_PROVIDER_ERROR')+': stopped safely. No automatic duplicate create or media upload. Keep private receipts and use the draft reconciliation tool for an attempted create.';}
