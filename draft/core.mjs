import * as fs from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
export const sha = x => createHash('sha256').update(x).digest('hex');
const ensure=(x,m)=>{if(!x)throw Error(m);};
export const id = x => typeof x==='string' && /^[a-f0-9]{24}$/i.test(x);
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const keys=(x,ks)=>plain(x)&&Object.keys(x).length===ks.length&&ks.every(k=>Object.hasOwn(x,k));
const suite=['instagram','facebook'];
const sig=Buffer.from('89504e470d0a1a0a','hex');

export async function privateDir(dir) {
  await fs.mkdir(dir,{mode:0o700});
}
export async function requirePrivateDir(dir) {
  ensure(path.isAbsolute(dir)&&path.normalize(dir)===dir,'Private state path must be absolute and normalized');
  try{await privateDir(dir);}catch(e){if(e.code!=='EEXIST')throw e;}
  const st=await fs.lstat(dir);
  ensure(await fs.realpath(dir)===dir && st.isDirectory() && (st.mode&0o077)===0 &&
    (typeof process.getuid!=='function'||st.uid===process.getuid()),'Private state directory must be owned, mode 0700 and not a shortcut');
}
async function readBound(root,name,max,ownerOnly=false) {
  ensure(/^[a-zA-Z0-9_.-]+$/.test(name)&&name!=='.'&&name!=='..','Invalid filename');
  const h=await fs.open(path.join(root,name),constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try{
    const s=await h.stat();
    ensure(s.isFile()&&s.size>0&&s.size<=max,'Invalid file size or kind');
    ensure(!ownerOnly||(s.mode&0o077)===0&&s.uid===process.getuid(),'Private file ownership or permissions invalid');
    const data=Buffer.alloc(s.size); let offset=0;
    while(offset<data.length){
      const {bytesRead}=await h.read(data,offset,data.length-offset,offset);
      ensure(bytesRead>0,'File changed during read');offset+=bytesRead;
    }
    const end=await h.stat();
    ensure(end.mtimeMs===s.mtimeMs&&end.ctimeMs===s.ctimeMs&&end.size===s.size,'File changed during read');
    return data;
  }finally{await h.close();}
}
async function directory(root) {
  ensure(path.isAbsolute(root)&&path.normalize(root)===root&&(await fs.realpath(root))===root&&(await fs.lstat(root)).isDirectory(),'Approved folder must be a real absolute directory');
}
export async function configAt(dir){
  await requirePrivateDir(dir);
  return validateConfig(JSON.parse(await readBound(dir,'config.json',16384,true)));
}
export function validateConfig(c){
  ensure(keys(c,['profileId','targets','approvedFolder'])&&id(c.profileId)&&typeof c.approvedFolder==='string','Invalid Samantha profile');
  ensure(keys(c.targets,suite)&&suite.every(p=>keys(c.targets[p],['accountId','username'])&&id(c.targets[p].accountId)&&typeof c.targets[p].username==='string'&&/^[a-zA-Z0-9._-]{2,100}$/.test(c.targets[p].username))&&c.targets.instagram.accountId!==c.targets.facebook.accountId,'Need exact, distinct Instagram and Facebook account IDs and usernames');
  return c;
}
export async function inspect(c,contentId,platform){
  validateConfig(c);ensure(suite.includes(platform)&&/^SJ-W\d{2}-R[1-4]$/.test(contentId),'Use an exact Samantha reel ID and instagram or facebook');
  await directory(c.approvedFolder);
  const doc=JSON.parse(await readBound(c.approvedFolder,contentId+'.json',16384));
  ensure(keys(doc,['contentId','revision','caption'])&&doc.contentId===contentId&&Number.isSafeInteger(doc.revision)&&doc.revision>=1&&typeof doc.caption==='string'&&doc.caption.trim()===doc.caption&&doc.caption.length>0&&doc.caption.length<=2200&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(doc.caption),'Invalid exact reel manifest');
  const stem=contentId+'-v'+doc.revision;
  const [video,cover]=await Promise.all([readBound(c.approvedFolder,stem+'.mp4',120*1024*1024),readBound(c.approvedFolder,stem+'.png',10*1024*1024)]);
  ensure(video.length>16&&video.toString('ascii',4,8)==='ftyp','Video lacks an MP4 file signature');
  ensure(cover.length>=33&&cover.subarray(0,8).equals(sig)&&cover.readUInt32BE(8)===13&&cover.toString('ascii',12,16)==='IHDR'&&cover.readUInt32BE(16)===1080&&cover.readUInt32BE(20)===1920,'Cover must be a 1080 × 1920 PNG');
  const view={contentId,revision:doc.revision,caption:doc.caption,videoSha256:sha(video),coverSha256:sha(cover),profileId:c.profileId,platform,accountId:c.targets[platform].accountId,username:c.targets[platform].username,mode:'draft-only',timezone:'America/Halifax'};
  return {view,binding:sha(JSON.stringify(view)),video,cover,stem};
}
const entryName=v=>sha(JSON.stringify([v.platform,v.contentId]))+'.json';
const writeAll=async(h,row)=>{await h.writeFile(JSON.stringify(row)+'\n');await h.sync();};
async function syncDir(d){const h=await fs.open(d,'r');try{await h.sync();}finally{await h.close();}}
async function reserve(d,v,row){
  const h=await fs.open(path.join(d,entryName(v)),'wx',0o600);
  try{await writeAll(h,row);}finally{await h.close();}
  await syncDir(d);
}
async function update(d,v,row){
  const tmp='update-'+randomUUID()+'.json';
  const h=await fs.open(path.join(d,tmp),'wx',0o600);
  try{await writeAll(h,row);}finally{await h.close();}
  await fs.rename(path.join(d,tmp),path.join(d,entryName(v)));
  await syncDir(d);
}
async function getRow(d,v){
  try{return JSON.parse(await readBound(d,entryName(v),16384,true));}
  catch(e){if(e.code==='ENOENT')return null;throw Error('Existing local receipt is damaged. Stop; no retry.');}
}
export function compileDraft(v,videoUrl,coverUrl){
  ensure(suite.includes(v.platform)&&id(v.accountId),'Invalid target');
  const media={type:'video',url:videoUrl};
  const platformSpecificData=v.platform==='instagram'?{instagramThumbnail:coverUrl,shareToFeed:true}:{contentType:'reel'};
  if(v.platform==='facebook')media.thumbnail=coverUrl;
  return {isDraft:true,content:v.caption,mediaItems:[media],platforms:[{platform:v.platform,accountId:v.accountId,platformSpecificData}]};
}
function accountId(x){return typeof x==='string'?x:x?._id??x?.id;}
export function verifyTarget(accounts,v){
  ensure(Array.isArray(accounts),'Account readback shape not recognized');
  const found=accounts.filter(a=>accountId(a)===v.accountId);
  ensure(found.length===1&&accountId(found[0].profileId)===v.profileId&&found[0].platform===v.platform&&found[0].username===v.username&&found[0].isActive!==false&&found[0].enabled!==false,'Account is not the exact active Samantha destination. Stop.');
}
export function verifyDraft(p,body,draftId){
  ensure(p&&accountId(p)===draftId&&p.status==='draft'&&p.scheduledFor==null&&p.publishedAt==null&&p.content===body.content,'Provider readback did not prove exact unscheduled draft');
  const [target]=p.platforms??[], exp=body.platforms[0], media=p.mediaItems?.[0], wanted=body.mediaItems[0];
  ensure(p.platforms?.length===1&&target.platform===exp.platform&&accountId(target.accountId)===exp.accountId&&target.scheduledFor==null&&!target.platformPostUrl&&!target.platformPostId&&target.publishedAt==null,'Provider target did not match exact draft destination');
  ensure(p.mediaItems?.length===1&&media.url===wanted.url&&media.type==='video','Provider did not return exact video');
  ensure(Object.entries(exp.platformSpecificData).every(([k,val])=>target.platformSpecificData?.[k]===val)&&(!wanted.thumbnail||media.thumbnail===wanted.thumbnail),'Provider did not return exact reel settings and cover');
}
export async function execute({dir,c,contentId,platform,approvedBinding,provider}){
  const {view:v,binding,stem,video,cover}=await inspect(c,contentId,platform);
  ensure(approvedBinding===binding,'Review/binding changed; no upload made');
  await requirePrivateDir(dir);
  const seen=await getRow(dir,v);
  if(seen)throw Error('Already reserved or drafted for this content and account; inspect or reconcile, never resubmit');
  verifyTarget(await provider.accounts(v.profileId),v);
  const row={state:'reserved',binding,contentId,revision:v.revision,accountId:v.accountId,platform,requestId:randomUUID(),at:new Date().toISOString()};
  try{await reserve(dir,v,row);}catch(e){if(e.code==='EEXIST')throw Error('Concurrent operation already reserved; no retry');throw e;}
  const videoUrl=await provider.upload({name:stem+'.mp4',mime:'video/mp4',bytes:video});
  const coverUrl=await provider.upload({name:stem+'.png',mime:'image/png',bytes:cover});
  const body=compileDraft(v,videoUrl,coverUrl);
  await update(dir,v,{...row,state:'attempted',videoUrl,coverUrl});
  const p=await provider.createDraft(body,row.requestId);
  const draftId=accountId(p);
  ensure(id(draftId),'No verified draft ID was returned. Stop; never retry automatically.');
  const withId={...row,state:'awaiting-readback',draftId,videoUrl,coverUrl};
  await update(dir,v,withId);
  verifyDraft(await provider.getDraft(draftId),body,draftId);
  await update(dir,v,{...withId,state:'verified-draft'});
  return {draftId,state:'verified-draft',contentId,revision:v.revision,platform};
}
export async function reconcile({dir,c,contentId,platform,provider,draftId}){
  const {view:v,binding}=await inspect(c,contentId,platform);
  const old=await getRow(dir,v);
  ensure(old&&old.binding===binding&&old.videoUrl&&old.coverUrl,'No matching attempted receipt to reconcile');
  ensure(id(draftId)&&(!old.draftId||old.draftId===draftId),'Require the exact manually found draft ID');
  verifyTarget(await provider.accounts(v.profileId),v);
  verifyDraft(await provider.getDraft(draftId),compileDraft(v,old.videoUrl,old.coverUrl),draftId);
  if(old.state!=='verified-draft')await update(dir,v,{...old,draftId,state:'verified-draft'});
  return {draftId,state:'verified-draft',contentId,revision:v.revision,platform};
}
