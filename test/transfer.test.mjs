import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import {makeEngine,safeError} from '../transfer/engine.mjs';
import {assemblePairedMedia,verifyPairedPreview} from '../transfer/draft-preview.mjs';
import {fixture,fakeHTTP} from './transfer-fixture.mjs';
const make=(f,h,options={})=>makeEngine({...f,enabled:true,send:h.send,...options});
const yes=async()=>true;
test('paired upload and durable restart reuse; no posts; private URL receipts; exact original bytes unchanged',async t=>{
 const f=await fixture(t),h=fakeHTTP(f),e=make(f,h),v=await e.review(f.batch.batchId);
 const before=await fs.readFile(path.join(f.folder,f.batch.pairs[0].video.name));
 let approvals=0;
 const r=await e.transfer(f.batch.batchId,v.reviewBinding,async view=>{approvals++;assert.equal(view.parts.length,2);return true;});
 assert.equal(r.outcome,'TRANSFERRED_TO_TEMPORARY_MEDIA_STORAGE');assert.equal(approvals,1);
 assert.equal(h.calls.filter(c=>c.method==='PUT').length,2);
 assert(!JSON.stringify(r).includes('https:'));assert(!JSON.stringify(r).includes(f.key));
 const repeated=await make(f,h).transfer(f.batch.batchId,v.reviewBinding,()=>assert.fail('Must reuse approval'));
 assert.match(repeated.outcome,/REUSED/);assert.equal(h.calls.filter(c=>c.method==='PUT').length,2);
 const disk=await fs.readFile(path.join(f.state,'receipts.json'),'utf8');
 assert(!disk.includes('X-Amz-'));assert(!disk.includes('uploadUrl'));assert(!disk.includes(f.key));
 assert.deepEqual(await fs.readFile(path.join(f.folder,f.batch.pairs[0].video.name)),before);
 const receipts=Object.values(JSON.parse(disk).parts);
 for(const platform of ['instagram','facebook']){
  const preview=assemblePairedMedia(v.parts,receipts,platform);
  assert.equal(preview.mediaItems.length,1);assert.equal(preview.mediaItems[0].type,'video');
  const cover=receipts.find(p=>p.kind==='cover').publicUrl;
  assert.equal(preview.mediaItems[0][platform==='facebook'?'thumbnail':'instagramThumbnail'],cover);
  assert.deepEqual(verifyPairedPreview(structuredClone(preview),preview),{coverBindingVerified:true,remoteDraftVerified:false});
  const wrong=structuredClone(preview);wrong.mediaItems[0].url='https://example.invalid/wrong.mp4';
  assert.throws(()=>verifyPairedPreview(wrong,preview),/COVER_MISMATCH/);
  for(const mutation of [r=>r.pop(),r=>r[1].status='uncertain',r=>r[1].sha256='0'.repeat(64),r=>r[1].completedAt=Date.now()-24*3600000]){
   const copy=structuredClone(receipts);mutation(copy);assert.throws(()=>assemblePairedMedia(v.parts,copy,platform),/DRAFT_PAIR/);
  }
 }
 assert(h.calls.every(c=>!c.path.includes('/posts')));
});
test('cover rejection resumes only cover with one durable approval across restart',async t=>{
 const f=await fixture(t),h=fakeHTTP(f,{rejectCover:true}),e=make(f,h),v=await e.review(f.batch.batchId);
 await assert.rejects(e.transfer(f.batch.batchId,v.reviewBinding,yes),/PUT_REJECTED/);
 const partial=await e.review(f.batch.batchId);assert.deepEqual(partial.parts.map(p=>p.status),['complete','pending']);
 h.options.rejectCover=false;
 await make(f,h).transfer(f.batch.batchId,v.reviewBinding,()=>assert.fail('Already approved exact batch'));
 assert.equal(h.calls.filter(c=>c.method==='PUT'&&c.path.endsWith('.mp4')).length,1);
 assert.equal(h.calls.filter(c=>c.method==='PUT'&&c.path.endsWith('.png')).length,2);
});
test('ambiguous PUT held across restart; exact readback reconciles without upload',async t=>{
 const f=await fixture(t),h=fakeHTTP(f,{timeout:true}),e=make(f,h),v=await e.review(f.batch.batchId);
 await assert.rejects(e.transfer(f.batch.batchId,v.reviewBinding,yes),/PUT_UNCERTAIN/);
 await assert.rejects(make(f,h).transfer(f.batch.batchId,v.reviewBinding,yes),/AMBIGUOUS_PART/);
 const count=h.calls.length;h.options.timeout=false;
 const r=await make(f,h).reconcile(f.batch.batchId);
 assert.equal(r.parts[0].status,'complete');assert(h.calls.slice(count).every(c=>c.method==='GET'));
 await make(f,h).transfer(f.batch.batchId,v.reviewBinding,()=>assert.fail('Approval persists'));
 assert.equal(h.calls.filter(c=>c.method==='PUT'&&c.path.endsWith('.mp4')).length,1);
});
test('missing remote ambiguous bytes stay held; no retry on 404',async t=>{
 const f=await fixture(t),h=fakeHTTP(f,{timeout:true}),e=make(f,h),v=await e.review(f.batch.batchId);
 await assert.rejects(e.transfer(f.batch.batchId,v.reviewBinding,yes));h.stored.clear();
 await assert.rejects(e.reconcile(f.batch.batchId),/RECONCILE_UNCONFIRMED/);
 await assert.rejects(e.transfer(f.batch.batchId,v.reviewBinding,yes),/AMBIGUOUS_PART/);
 assert.equal(h.calls.filter(c=>c.method==='PUT').length,1);
});
test('denial, input mutation during approval, disabled mode and wrong owner send no bytes',async t=>{
 const f=await fixture(t),h=fakeHTTP(f),e=make(f,h),v=await e.review(f.batch.batchId);
 await assert.rejects(e.transfer(f.batch.batchId,v.reviewBinding,async()=>false),/OPERATOR_DECLINED/);assert.equal(h.calls.length,0);
 await assert.rejects(e.transfer(f.batch.batchId,v.reviewBinding,async()=>{f.batch.status='For Review';await f.write();return true;}),/MANIFEST_NOT_APPROVED/);
 assert.equal(h.calls.length,0);f.batch.status='Approved';await f.write();
 await assert.rejects(make(f,h,{enabled:false}).transfer(f.batch.batchId,v.reviewBinding,yes),/DISABLED/);
 h.options.wrongOwner=true;await assert.rejects(e.transfer(f.batch.batchId,v.reviewBinding,yes),/DESTINATION_MISMATCH/);
 assert.equal(h.calls.filter(c=>c.method==='PUT'||c.method==='POST').length,0);
});
for(const [name,mutate] of [
 ['For Review batch',m=>m.status='For Review'],['For Review pair',m=>m.pairs[0].status='For Review'],
 ['wrong destination',m=>m.destinationId='ELSEWHERE'],['hash mismatch',m=>m.pairs[0].video.sha256='0'.repeat(64)],
 ['size mismatch',m=>m.pairs[0].cover.size++],['MIME mismatch',m=>m.pairs[0].cover.mime='image/jpeg'],
 ['path traversal',m=>m.pairs[0].video.name='../outside.mp4'],['unmatched cover',m=>delete m.pairs[0].cover],
 ['duplicate pair',m=>m.pairs.push(m.pairs[0])],['legacy week blocked',m=>m.pairs[0].contentId='SJ-W03-R1']
])test('rejects '+name+' before HTTP',async t=>{
 const f=await fixture(t),h=fakeHTTP(f);mutate(f.batch);await f.write();
 await assert.rejects(make(f,h).review(f.batch.batchId));assert.equal(h.calls.length,0);
});
for(const [name,mutate] of [
 ['storage host',r=>r.uploadUrl=r.uploadUrl.replace('.r2.cloudflarestorage.com','.r2.cloudflarestorage.com.evil.invalid')],
 ['storage path',r=>r.uploadUrl=r.uploadUrl.replace('/synthetic/','/other/')],
 ['delivery host',r=>r.publicUrl=r.publicUrl.replace('media.zernio.com','evil.invalid')],
 ['key mismatch',r=>r.key='temp/other.mp4'],
 ['query duplication',r=>r.uploadUrl+='&X-Amz-Signature='+'c'.repeat(64)],
 ['credentials',r=>r.uploadUrl=r.uploadUrl.replace('https://','https://user:pass@')],
 ['unsigned query',r=>r.uploadUrl=r.uploadUrl.split('?')[0]]
])test('rejects presign '+name+' before storage PUT',async t=>{
 const f=await fixture(t),h=fakeHTTP(f,{mutatePresign:mutate}),e=make(f,h),v=await e.review(f.batch.batchId);
 await assert.rejects(e.transfer(f.batch.batchId,v.reviewBinding,yes));assert.equal(h.calls.filter(c=>c.method==='PUT').length,0);
});
test('redirect and malformed receipt fail closed; no URL in surfaced errors',async t=>{
 const f=await fixture(t),h=fakeHTTP(f,{redirect:true}),e=make(f,h),v=await e.review(f.batch.batchId);
 await assert.rejects(e.transfer(f.batch.batchId,v.reviewBinding,yes),/PUT_UNCERTAIN/);
 await fs.writeFile(path.join(f.state,'receipts.json'),'broken');
 await assert.rejects(e.transfer(f.batch.batchId,v.reviewBinding,yes),/RECEIPT_DAMAGED/);
 assert(!safeError(Error('https://secret.invalid?key=secret')).includes('secret'));
});
test('expiry blocks automatic re-upload, changed manifest blocks partial resume',async t=>{
 const f=await fixture(t),h=fakeHTTP(f),e=make(f,h),v=await e.review(f.batch.batchId);
 await e.transfer(f.batch.batchId,v.reviewBinding,yes);const count=h.calls.length;
 await assert.rejects(make(f,h,{now:()=>Date.now()+24*3600000}).transfer(f.batch.batchId,v.reviewBinding,yes),/MEDIA_EXPIRED/);
 assert.equal(h.calls.length,count);
 await fs.appendFile(path.join(f.folder,'transfer-batch-'+f.batch.batchId+'.json'),' ');
 await assert.rejects(e.review(f.batch.batchId),/MANIFEST_CHANGED/);
});
test('concurrent calls and stale lock cannot duplicate storage writes',async t=>{
 const f=await fixture(t),h=fakeHTTP(f),e=make(f,h),v=await e.review(f.batch.batchId);
 const r=await Promise.allSettled([e.transfer(f.batch.batchId,v.reviewBinding,yes),make(f,h).transfer(f.batch.batchId,v.reviewBinding,yes)]);
 assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal(h.calls.filter(c=>c.method==='PUT').length,2);
 await fs.writeFile(path.join(f.state,'transfer.lock'),'stale');
 await assert.rejects(e.review(f.batch.batchId),/TRANSFER_LOCKED/);
});
test('hardlinks, directory junctions, missing files and wrong file signatures rejected',async t=>{
 const f=await fixture(t),h=fakeHTTP(f),e=make(f,h),p=path.join(f.folder,f.batch.pairs[0].cover.name);
 await fs.link(p,path.join(f.root,'cover-hardlink.png'));await assert.rejects(e.review(f.batch.batchId),/FILE_NOT_REGULAR/);
 await fs.unlink(path.join(f.root,'cover-hardlink.png'));
 const junction=path.join(f.root,'shortcut');await fs.symlink(f.folder,junction,process.platform==='win32'?'junction':'dir');
 await assert.rejects(make({...f,folder:junction},h).review(f.batch.batchId),/FOLDER_NOT_REAL/);
 await fs.unlink(p);await assert.rejects(e.review(f.batch.batchId));
});


test('rejects duplicate manifest keys, missing manifest and invalid signatures with matching hashes',async t=>{
 const f=await fixture(t),h=fakeHTTP(f),e=make(f,h),manifest=path.join(f.folder,'transfer-batch-'+f.batch.batchId+'.json');
 const raw=await fs.readFile(manifest,'utf8');
 await fs.writeFile(manifest,raw.replace('"status":"Approved"','"status":"For Review","status":"Approved"'));
 await assert.rejects(e.review(f.batch.batchId),/MANIFEST_INVALID/);
 await fs.unlink(manifest);await assert.rejects(e.review(f.batch.batchId));await f.write();
 const p=f.batch.pairs[0].video,bytes=await fs.readFile(path.join(f.folder,p.name));bytes.write('html',4);
 const {sha}=await import('../transfer/files.mjs');p.sha256=sha(bytes);
 await fs.writeFile(path.join(f.folder,p.name),bytes);await f.write();
 await assert.rejects(e.review(f.batch.batchId),/MIME_MISMATCH/);
 assert.equal(h.calls.length,0);
});
test('config credential pin and corrupt per-part key stop before any HTTP',async t=>{
 const f=await fixture(t),h=fakeHTTP(f);
 await assert.rejects(make({...f,key:f.key+'wrong'},h).review(f.batch.batchId),/CREDENTIAL_PIN_MISMATCH/);
 assert.equal(h.calls.length,0);
 const e=make(f,h),v=await e.review(f.batch.batchId);await e.transfer(f.batch.batchId,v.reviewBinding,yes);
 const p=path.join(f.state,'receipts.json'),l=JSON.parse(await fs.readFile(p));
 const r=Object.values(l.parts)[0];r.key='temp/not-the-reviewed-file.mp4';r.publicUrl='https://media.zernio.com/'+r.key;
 await fs.writeFile(p,JSON.stringify(l));const count=h.calls.length;
 await assert.rejects(e.review(f.batch.batchId),/RECEIPT_DAMAGED/);assert.equal(h.calls.length,count);
});
test('regular file symlink blocked on supported POSIX hosts',{skip:process.platform==='win32'?'Windows session cannot create file symlinks; real directory junction and hardlink tests run above':false},async t=>{
 const f=await fixture(t),h=fakeHTTP(f),p=path.join(f.folder,f.batch.pairs[0].cover.name);
 await fs.rename(p,p+'.saved');await fs.symlink(p+'.saved',p);
 await assert.rejects(make(f,h).review(f.batch.batchId),/FILE_NOT_REGULAR/);
});
