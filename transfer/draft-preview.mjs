// Internal pure assembler only. No transport, tool, caption or destination lookup.
import {check} from './files.mjs';
import {deliveryUrl} from './transport.mjs';
export function assemblePairedMedia(expected,receipts,platform,now=Date.now()) {
  check(['instagram','facebook'].includes(platform) && expected.length===2 && receipts.length===2,'DRAFT_PAIR_INVALID');
  const video=expected.find(p=>p.kind==='video'),cover=expected.find(p=>p.kind==='cover');
  check(video && cover && video.contentId===cover.contentId && video.revision===cover.revision,'DRAFT_PAIR_MISMATCH');
  const resolved=expected.map(p=>{
    const found=receipts.filter(r=>r.kind===p.kind);
    check(found.length===1,'DRAFT_PAIR_MISMATCH');const r=found[0];
    check(['name','mime','size','sha256','contentId','revision','kind'].every(k=>r[k]===p[k]),'DRAFT_PAIR_MISMATCH');
    check(r.status==='complete' && Number.isSafeInteger(r.completedAt) && now>=r.completedAt && now-r.completedAt<23*3600000,'DRAFT_PAIR_UNCONFIRMED_OR_EXPIRED');
    deliveryUrl(r.publicUrl,r.key);check(r.key.endsWith('_'+p.name),'DRAFT_PAIR_MISMATCH');return r;
  });
  const v=resolved.find(p=>p.kind==='video'),c=resolved.find(p=>p.kind==='cover');
  check(v.mime==='video/mp4' && c.mime==='image/png' && c.size<=10*1024*1024 && v.publicUrl!==c.publicUrl,'DRAFT_PAIR_INVALID');
  return {
    mediaItems:[{type:'video',url:v.publicUrl,...(platform==='facebook'?{thumbnail:c.publicUrl}:{instagramThumbnail:c.publicUrl})}],
    platformSpecificData:platform==='facebook'?{contentType:'reel'}:{instagramThumbnail:c.publicUrl,shareToFeed:true}
  };
}
export function verifyPairedPreview(actual,expected) {
  check(JSON.stringify(actual)===JSON.stringify(expected),'DRAFT_PREVIEW_COVER_MISMATCH');
  return {coverBindingVerified:true,remoteDraftVerified:false};
}
