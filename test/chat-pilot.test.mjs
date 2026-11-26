const macPersistenceOnly={skip:process.platform==='win32'?'Inherited POSIX persistence test requires macOS/Unix; no Windows permission emulation':false};
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,realpath,rm,readdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
function rpc(home,mode,method,params){
 return new Promise((resolve,reject)=>{
  const cp=spawn(process.execPath,['chat-pilot/server/index.mjs',mode],{env:{...process.env,HOME:home,USERPROFILE:home},stdio:['pipe','pipe','pipe']});
  let out='',err='';cp.stdout.on('data',c=>out+=c);cp.stderr.on('data',x=>err+=x);
  cp.once('error',reject);cp.once('close',code=>{try{assert.equal(code,0,err);resolve(JSON.parse(out).result);}catch(e){reject(e);}});
  cp.stdin.end(JSON.stringify({jsonrpc:'2.0',id:1,method,params})+'\n');
 });
}
const tool=(h,m,name,args={})=>rpc(h,m,'tools/call',{name,arguments:args});
async function fixture(t){
 const root=await mkdtemp(path.join(await realpath(os.tmpdir()),'sj-chat-test-'));
 t.after(()=>rm(root,{recursive:true,force:true}));return root;
}
const text=r=>r.content[0].text;
const stage='save_samantha_mock_draft',recover='reconcile_samantha_mock_draft';
const proof=(r,i=0)=>{
 const bs=[...text(r).matchAll(/Review binding ([0-9a-f]{64})/g)].map(m=>m[1]);
 const cs=[...text(r).matchAll(/Human confirmation to type for this target: (APPROVE MOCK [A-Z]+ [0-9a-f]{12})/g)].map(m=>m[1]);
 return {platform:i===0?'instagram':'facebook',reviewBinding:bs[i],confirmation:cs[i]};
};
test('default off, prompt and genuine cover file/text; explicit draft refused',async t=>{
 const h=await fixture(t);
 const manifest=(await import('node:fs/promises')).readFile('chat-pilot/manifest.json','utf8');
 assert.equal(JSON.parse(await manifest).user_config.pilot_mode.default,'off');
 const p=await rpc(h,'off','prompts/get',{name:'review_samantha_mock'});assert.match(p.messages[0].content.text,/this chat/);
 const listed=await rpc(h,'off','tools/list');assert.equal(listed.tools.length,3);
 const r=await tool(h,'off','review_samantha_mock_reel');
 assert.match(text(r),/1080|SHA-256/);assert.match(text(r),/Halifax/); assert.match(text(r),/instagram @synthetic-ig[\s\S]*facebook @synthetic-fb/);
 assert.equal(Buffer.from(r.content[1].data,'base64').readUInt32BE(16),1080);
 assert.equal((await tool(h,'off','review_samantha_mock_reel',{textOnly:true})).content.length,1);
 assert.match(text(await tool(h,'off',stage,proof(r))),/Preview-only/);
 assert.deepEqual(await readdir(h),[]);
});
test('cannot create without exact binding+phrase, or add a schedule; admits separate target mock once across processes',macPersistenceOnly,async t=>{
 const h=await fixture(t),r=await tool(h,'mock','review_samantha_mock_reel'),ig=proof(r),fb=proof(r,1);
 assert.match(text(await tool(h,'mock',stage,{...ig,reviewBinding:fb.reviewBinding})),/binding/);
 assert.match(text(await tool(h,'mock',stage,{...ig,confirmation:'no'})),/confirmation/);
 assert.match(text(await tool(h,'mock',stage,{...ig,scheduledFor:'tomorrow'})),/Invalid/);
 assert.deepEqual(await readdir(h),[]);
 const [a,b]=await Promise.all([tool(h,'mock',stage,ig),tool(h,'mock',stage,ig)]);
 assert.equal([a,b].filter(x=>!x.isError).length,1);
 assert.match(text([a,b].find(x=>!x.isError)),/instagramThumbnail/);
 assert.match(text(await tool(h,'mock',stage,ig)),/never resubmit/);
 assert.match(text(await tool(h,'mock',stage,fb)),/media thumbnail/);
 assert.match(text(await tool(h,'mock',recover,{platform:ig.platform,reviewBinding:ig.reviewBinding})),/MOCK VERIFIED/);
});
test('timeout after save persists across restarts and recovers once without another post',macPersistenceOnly,async t=>{
 const h=await fixture(t),r=await tool(h,'mock-timeout','review_samantha_mock_reel'),ig=proof(r),{confirmation,...clean}=ig;
 assert.match(text(await tool(h,'mock-timeout',stage,ig)),/Simulated timeout/);
 assert.match(text(await tool(h,'mock-timeout',stage,ig)),/never resubmit/);
 const before=await readdir(path.join(h,'.samantha-social-desk-offline-pilot-timeout'));
 assert.equal(before.filter(x=>x.startsWith('mock-')).length,1);
 assert.match(text(await tool(h,'mock-timeout',recover,clean)),/MOCK VERIFIED DRAFT/);
 assert.deepEqual(await readdir(path.join(h,'.samantha-social-desk-offline-pilot-timeout')),before);
});
