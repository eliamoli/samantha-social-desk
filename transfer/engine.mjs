import * as fs from 'node:fs/promises';
import path from 'node:path';
import {check,sha,privateDirectory,save,load,syncDirectory,TransferError,exact,digest} from './files.mjs';
import {configAt,inventory} from './source.mjs';
import {makeTransport,deliveryUrl} from './transport.mjs';
const REUSE_MS=23*60*60*1000, APPROVAL_MS=24*60*60*1000;
const partId=(c,p)=>sha(JSON.stringify([c.destinationId,p.contentId,p.revision,p.kind]));
const identity=p=>({name:p.name,mime:p.mime,size:p.size,sha256:p.sha256,contentId:p.contentId,revision:p.revision,kind:p.kind});
const same=(a,b)=>JSON.stringify(identity(a))===JSON.stringify(identity(b));
export function makeEngine({enabled,configFile,folder,key,state,send=globalThis.fetch,now=Date.now}) {
  const settings=()=>configAt(configFile,folder,key);
  async function locked(fn) {
    await privateDirectory(state);
    let lock;
    try{lock=await fs.open(path.join(state,'transfer.lock'),'wx',0o600);}catch{throw new TransferError('TRANSFER_LOCKED');}
    try {await lock.writeFile(String(process.pid));await lock.sync();await syncDirectory(state);return await fn();}
    finally {await lock.close();await fs.unlink(path.join(state,'transfer.lock'));await syncDirectory(state);}
  }
  async function ledger(c) {
    const l=await load(state,'receipts.json');
    if(!l)return {version:1,destinationId:c.destinationId,configBinding:c.configBinding,parts:{},batches:{}};
    check(exact(l,['version','destinationId','configBinding','parts','batches']) && l.version===1 && l.destinationId===c.destinationId && l.configBinding===c.configBinding && l.parts && typeof l.parts==='object' && !Array.isArray(l.parts) && l.batches && typeof l.batches==='object' && !Array.isArray(l.batches),'RECEIPT_CONTEXT_CHANGED');
    for(const [id,p] of Object.entries(l.parts)) {
      check(digest(id) && exact(p,['name','mime','size','sha256','contentId','revision','kind','status','publicUrl','key','completedAt']) && digest(p.sha256) && Number.isSafeInteger(p.size) && p.size>0 && ['pending','uncertain','complete'].includes(p.status),'RECEIPT_DAMAGED');
      check((p.status==='pending' && p.publicUrl===null && p.key===null && p.completedAt===null) || (p.status==='uncertain' && p.completedAt===null) || (p.status==='complete' && Number.isSafeInteger(p.completedAt) && p.completedAt<=now()),'RECEIPT_DAMAGED');
      if(p.status!=='pending'){deliveryUrl(p.publicUrl,p.key);check(p.key.endsWith('_'+p.name),'RECEIPT_DAMAGED');}
      check(id===partId(c,p),'RECEIPT_DAMAGED');
    }
    for(const b of Object.values(l.batches)) check(exact(b,['binding','approvedAt','partIds']) && digest(b.binding) && Number.isSafeInteger(b.approvedAt) && b.approvedAt<=now() && Array.isArray(b.partIds) && b.partIds.every(id=>Object.hasOwn(l.parts,id)),'RECEIPT_DAMAGED');
    return l;
  }
  function states(c,inv,l) {
    const b=l.batches[inv.batchId];
    if(b)check(b.binding===inv.binding && JSON.stringify(b.partIds)===JSON.stringify(inv.parts.map(p=>partId(c,p))),'MANIFEST_CHANGED');
    return inv.parts.map(p=>{
      const old=l.parts[partId(c,p)];
      if(old)check(same(old,p),'RECEIPT_PART_CHANGED');
      return {...identity(p),status:!old?'new':old.status==='complete'&&now()-old.completedAt>=REUSE_MS?'expired':old.status};
    });
  }
  function view(c,inv,items) {
    return {batchId:inv.batchId,destination:c.destinationLabel,destinationId:c.destinationId,reviewBinding:inv.binding,manifestSha256:inv.manifestSha,totalBytes:inv.parts.reduce((n,p)=>n+p.size,0),parts:items,pairs:[...new Set(items.map(p=>p.contentId))].map(contentId=>({contentId,uploadedPair:items.filter(p=>p.contentId===contentId).every(p=>p.status==='complete'),remoteCoverAttached:false})),
      meaning:'Temporary Zernio media storage only. No draft, schedule, publication, cover assignment or browser upload-session completion. Delivery URLs stay in private local receipts.'};
  }
  async function prepare(batchId) {
    check(enabled,'TRANSFER_DISABLED');const c=await settings(),inv=await inventory(c,batchId);
    return locked(async()=>view(c,inv,states(c,inv,await ledger(c))));
  }
  return {
    async preflight(formCapable) {
      const result={enabled,nativeConfirmation:formCapable,source:'Drive for desktop: real, stable, readable approved folder required. No Claude Drive connector byte access.',setup:'Configure the private transfer config and sensitive installer credential once; no weekly picker.',ready:false};
      if(!enabled)return result;
      try {await settings();result.ready=!!formCapable;result.status=formCapable?'LOCAL_SETUP_READY_NOT_LIVE_VERIFIED':'NATIVE_CONFIRMATION_UNSUPPORTED';}
      catch(e){result.status=e instanceof TransferError?e.code:'LOCAL_SETUP_UNAVAILABLE';}
      return result;
    },
    review:prepare,
    async transfer(batchId,reviewBinding,approve) {
      check(enabled,'TRANSFER_DISABLED');
      return locked(async()=>{
        const c=await settings();let inv=await inventory(c,batchId,true);
        check(inv.binding===reviewBinding,'REVIEW_CHANGED');
        const l=await ledger(c), items=states(c,inv,l);
        check(!items.some(p=>p.status==='uncertain'),'AMBIGUOUS_PART_RECONCILE_ONLY');
        check(!items.some(p=>p.status==='expired'),'MEDIA_EXPIRED_NO_AUTO_REUPLOAD');
        if(items.every(p=>p.status==='complete')) return {...view(c,inv,items),outcome:'REUSED_COMPLETE_RECEIPTS_NO_UPLOAD'};
        const previous=l.batches[batchId];
        if(!previous || now()-previous.approvedAt>=APPROVAL_MS) {
          const before=now();
          check(await approve(view(c,inv,items))===true && now()-before<5*60*1000,'OPERATOR_DECLINED_OR_TIMED_OUT');
          const fresh=await settings(), again=await inventory(fresh,batchId,true);
          check(fresh.configBinding===c.configBinding && again.binding===inv.binding,'REVIEW_CHANGED');
          inv=again;
          l.batches[batchId]={binding:inv.binding,approvedAt:now(),partIds:inv.parts.map(p=>partId(c,p))};
        }
        for(const p of inv.parts) {
          const id=partId(c,p);
          if(!l.parts[id])l.parts[id]={...identity(p),status:'pending',publicUrl:null,key:null,completedAt:null};
        }
        // Persist the entire approved batch before the first remote request.
        await save(state,'receipts.json',l);
        const transport=makeTransport(c,key,send);
        await transport.verifyIdentity();
        for(const p of inv.parts) {
          const id=partId(c,p), receipt=l.parts[id];
          if(receipt.status==='complete')continue;
          // Stop if the source/manifest/config changed while the batch was running.
          const fresh=await settings(), latest=await inventory(fresh,batchId);
          check(latest.binding===inv.binding,'REVIEW_CHANGED');
          const signed=await transport.presign(p);
          receipt.status='uncertain';receipt.publicUrl=signed.publicUrl;receipt.key=signed.key;
          await save(state,'receipts.json',l);
          try {await transport.put(signed,p);}
          catch(e) {
            if(e.code==='PUT_REJECTED') {receipt.status='pending';receipt.publicUrl=null;receipt.key=null;await save(state,'receipts.json',l);}
            throw e;
          }
          receipt.status='complete';receipt.completedAt=now();
          await save(state,'receipts.json',l);
        }
        return {...view(c,inv,states(c,inv,l)),outcome:'TRANSFERRED_TO_TEMPORARY_MEDIA_STORAGE'};
      });
    },
    async reconcile(batchId) {
      check(enabled,'TRANSFER_DISABLED');
      return locked(async()=>{
        const c=await settings(),inv=await inventory(c,batchId),l=await ledger(c);
        states(c,inv,l);
        check(l.batches[batchId],'NO_ATTEMPT_TO_RECONCILE');
        const transport=makeTransport(c,key,send); await transport.verifyIdentity();
        for(const p of inv.parts) {
          const r=l.parts[partId(c,p)];
          if(r.status!=='uncertain')continue;
          await transport.verifyStored(r);
          r.status='complete';r.completedAt=l.batches[batchId].approvedAt;
          await save(state,'receipts.json',l);
        }
        return {...view(c,inv,states(c,inv,l)),outcome:'RECONCILED_NO_UPLOAD'};
      });
    }
  };
}
export function safeError(e) {
  const code=e instanceof TransferError?e.code:'LOCAL_IO_OR_STATE_ERROR';
  const help={
    SETUP_REQUIRED:'Complete one-time private extension setup.',
    TRANSFER_DISABLED:'Transfer is off in extension settings.',
    PUT_REJECTED:'Storage explicitly rejected this part. Previously completed parts are saved. Review and run the same batch again to resume only pending parts under the saved approval.',
    PUT_UNCERTAIN:'The PUT may have completed. Run reconcile_samantha_transfer_batch. Do not delete receipts or request another upload.',
    AMBIGUOUS_PART_RECONCILE_ONLY:'A previous PUT may have completed. Reconcile only; there is no automatic retry.',
    RECONCILE_UNCONFIRMED:'Storage bytes could not be proven. Keep the hold. An authorized maintainer must resolve it; a missing response is not permission to retry.',
    TRANSFER_LOCKED:'Another transfer is active, or a process stopped while holding a lock. Keep receipts. A maintainer must verify no process remains before removing only transfer.lock.',
    MEDIA_EXPIRED_NO_AUTO_REUPLOAD:'A completed receipt passed the conservative 23-hour reuse window. No automatic re-upload. Remote media may expire sooner if consumed.',
    ALREADY_TRANSFERRED_BATCH_BLOCKED:'This legacy batch is blocked from transfer.',
    MANIFEST_CHANGED:'The approved batch manifest changed. Stop and review the producer handoff; partial state is retained.',
    REVIEW_CHANGED:'Inputs changed after review. No further upload. Existing receipts are retained.'
  };
  return code+': '+(help[code]||'Transfer stopped. Correct the local setup/input or inspect private receipts with an authorized maintainer; do not delete receipts to retry.');
}
