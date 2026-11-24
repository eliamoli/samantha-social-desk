import {verifyDraft,id} from './core.mjs';
const WINDOW=7*24*60*60*1000;
export async function auditDraftRetention({draftId,expected,readDraft,probe,videoUploadedAt,coverUploadedAt,now}){
 if(!id(draftId)||!Number.isSafeInteger(now))throw Error('Invalid read-only retention audit inputs');
 const post=await readDraft(draftId);
 try{verifyDraft(post,expected,draftId);}catch{return {draftId,status:'held',issues:['exact draft/cover readback mismatch'],canPromote:false};}
 const m=expected.mediaItems[0],t=expected.platforms[0], cover=m.thumbnail??t.platformSpecificData.instagramThumbnail;
 const assets=[['video',m.url,videoUploadedAt],['cover',cover,coverUploadedAt]];
 const issues=[];
 for(const [kind,url,at] of assets){
  let state;try{state=await probe(url);}catch{state='unknown';}
  if(state==='verified-permanent')continue; // independently verified for this exact readback URL, not inferred from draft status
  if(!Number.isSafeInteger(at)||at>now||now-at>=WINDOW){issues.push(kind+' temporary upload age expired or unknown');continue;}
  if(state!=='available')issues.push(kind+' unavailable or unverified');
 }
 return {draftId,status:issues.length?'held':'draft-assets-verified',issues,canPromote:false};
}
