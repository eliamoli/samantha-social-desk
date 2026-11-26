import assert from 'node:assert/strict';
import test from 'node:test';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {realpath} from 'node:fs/promises';
const valid='SJ-W03-R1';
async function driver(t,...options){
 const p=spawn(process.execPath,['chat-pilot/server/index.mjs',...options]);
 t.after(()=>p.stdin.end());
 const iter=createInterface({input:p.stdout})[Symbol.asyncIterator]();
 return {send:x=>p.stdin.write(JSON.stringify({jsonrpc:'2.0',...x})+'\n'),get:async()=>JSON.parse((await iter.next()).value)};
}
const text=x=>x.result.content[0].text;
const invoke=(c,id,name,args={})=>c.send({id,method:'tools/call',params:{name,arguments:args}});
test('consolidated extension exposes read-only opted-in files, not arbitrary paths or real draft routes',async t=>{
 const folder=await realpath('chat-pilot/server/fixtures');
 const c=await driver(t,'off',folder,'off');
 c.send({id:1,method:'tools/list'});assert.deepEqual((await c.get()).result.tools.map(t=>t.name),['review_samantha_mock_reel','preflight_samantha_transfer','preflight_samantha_drafts','review_samantha_local_reel']);
 invoke(c,2,'review_samantha_local_reel',{contentId:valid});
 const r=await c.get();assert.match(text(r),/LOCAL REVIEW ONLY/);assert.match(text(r),/caption/i);
 assert.equal(r.result.content[1].mimeType,'image/png');
 invoke(c,3,'review_samantha_local_reel',{contentId:'../../foo'});assert((await c.get()).result.isError);
 invoke(c,4,'save_samantha_mock_draft',{contentId:valid});assert((await c.get()).result.isError);
});
test('optional integrated native probe has no write result and needs distinct transport response',async t=>{
 const c=await driver(t,'off','','on');
 c.send({id:1,method:'initialize',params:{capabilities:{elicitation:{form:{}}}}});assert.equal((await c.get()).result.serverInfo.version,'0.6.0');
 invoke(c,2,'probe_samantha_native_approval',{approveExactDraft:true});
 assert((await c.get()).result.isError);
 invoke(c,3,'probe_samantha_native_approval');
 const req=await c.get();assert.equal(req.method,'elicitation/create');assert.match(req.params.message,/synthetic-ig/);
 c.send({id:req.id,result:{action:'accept',content:{approveExactDraft:true}}});
 assert.match(text(await c.get()),/no draft actually saved/);
});
