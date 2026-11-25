import path from 'node:path';
import {check,exact,digest,sha,readFile,realDirectory,parseJson} from './files.mjs';
export const batchPattern=/^[A-Z0-9][A-Z0-9_-]{0,47}$/;
export async function configAt(file,folder,key) {
  check(typeof file==='string' && path.isAbsolute(file),'SETUP_REQUIRED');
  const bytes=await readFile(path.dirname(file),path.basename(file),16384,true);
  let c; try {c=parseJson(bytes);}catch{check(false,'CONFIG_INVALID');}
  check(exact(c,['version','destinationId','destinationLabel','expectedOwnerId','credentialSha256','storageOrigin','storagePathPrefix']),'CONFIG_INVALID');
  check(c.version===1 && batchPattern.test(c.destinationId) && /^[A-Za-z0-9 ._-]{1,80}$/.test(c.destinationLabel) && /^[a-f0-9]{24}$/.test(c.expectedOwnerId) && digest(c.credentialSha256),'CONFIG_INVALID');
  check(typeof key==='string' && /^(sk|zrk)_[A-Za-z0-9_-]{32,256}$/.test(key) && sha(key)===c.credentialSha256,'CREDENTIAL_PIN_MISMATCH');
  check(/^https:\/\/[a-f0-9]{32}\.r2\.cloudflarestorage\.com$/.test(c.storageOrigin) && /^\/[a-z0-9][a-z0-9-]{0,62}\/$/.test(c.storagePathPrefix),'STORAGE_PIN_INVALID');
  await realDirectory(folder);
  return {...c,folder,configBinding:sha(bytes)};
}
export async function inventory(c,batchId,keepBytes=false) {
  check(batchPattern.test(batchId),'BATCH_ID_INVALID');
  const filename='transfer-batch-'+batchId+'.json', raw=await readFile(c.folder,filename,65536);
  let m; try{m=parseJson(raw);}catch{check(false,'MANIFEST_INVALID');}
  check(exact(m,['version','batchId','status','destinationId','pairs']) && m.version===1 && m.batchId===batchId && m.status==='Approved' && m.destinationId===c.destinationId && Array.isArray(m.pairs) && m.pairs.length>=1 && m.pairs.length<=4,'MANIFEST_NOT_APPROVED');
  const parts=[], seen=new Set();
  for(const pair of m.pairs) {
    check(exact(pair,['contentId','revision','status','video','cover']) && /^SJ-W[0-9]{2}-R[1-4]$/.test(pair.contentId) && pair.status==='Approved' && Number.isSafeInteger(pair.revision) && pair.revision>=1 && pair.revision<=999 && !seen.has(pair.contentId),'PAIR_NOT_APPROVED');
    check(!pair.contentId.startsWith('SJ-W03-'),'ALREADY_TRANSFERRED_BATCH_BLOCKED');
    seen.add(pair.contentId);
    for(const [kind,ext,mime,max] of [['video','mp4','video/mp4',120*1024*1024],['cover','png','image/png',10*1024*1024]]) {
      const p=pair[kind], name=pair.contentId+'-v'+pair.revision+'.'+ext;
      check(exact(p,['name','mime','size','sha256']) && p.name===name && p.mime===mime && Number.isSafeInteger(p.size) && p.size>0 && p.size<=max && digest(p.sha256),'PART_INVALID');
      const data=await readFile(c.folder,name,max);
      check(data.length===p.size && sha(data)===p.sha256,'PART_HASH_OR_SIZE_MISMATCH');
      if(kind==='video') check(data.length>=24 && data.toString('ascii',4,8)==='ftyp' && data.readUInt32BE(0)>=16 && data.readUInt32BE(0)<=data.length,'MIME_MISMATCH');
      else check(data.length>=33 && data.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')) && data.readUInt32BE(8)===13 && data.toString('ascii',12,16)==='IHDR' && data.readUInt32BE(16)===1080 && data.readUInt32BE(20)===1920,'MIME_MISMATCH');
      parts.push({...p,kind,contentId:pair.contentId,revision:pair.revision,...(keepBytes?{bytes:data}:{})});
    }
  }
  check(sha(await readFile(c.folder,filename,65536))===sha(raw),'MANIFEST_CHANGED');
  const manifestSha=sha(raw), binding=sha(JSON.stringify({manifestSha,configBinding:c.configBinding,folder:c.folder}));
  return {batchId,manifestSha,binding,parts};
}
