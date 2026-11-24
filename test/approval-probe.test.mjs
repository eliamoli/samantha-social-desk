import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
function client(t){
 const p=spawn(process.execPath,['approval-probe/server.mjs'],{stdio:['pipe','pipe','inherit']});
 t.after(()=>p.stdin.end());
 const iter=createInterface({input:p.stdout})[Symbol.asyncIterator]();
 return {send:x=>p.stdin.write(JSON.stringify({jsonrpc:'2.0',...x})+'\n'),get:async()=>JSON.parse((await iter.next()).value)};
}
const init=(c,capabilities)=>c.send({id:1,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities}});
const call=(c,id,args)=>c.send({id,method:'tools/call',params:{name:'probe_draft_approval',arguments:args}});
const message=r=>r.result.content[0].text;
for(const capabilities of [{},{elicitation:{url:{}}}]) test('no form capability: fail closed '+JSON.stringify(capabilities),async t=>{
 const c=client(t);init(c,capabilities);await c.get();call(c,2,{});assert.match(message(await c.get()),/did not declare form/);
});
test('only the independent exact outstanding request accepts a positive decision once',async t=>{
 const c=client(t);init(c,{elicitation:{form:{}}});await c.get();
 c.send({method:'notifications/initialized'});
 call(c,2,{approveExactDraft:true});assert.match(message(await c.get()),/cannot supply/);
 call(c,3,{});const first=await c.get();assert.equal(first.method,'elicitation/create');
 for(const k of ['caption:','video: SJ-W03-R1-v1.mp4','cover: SJ-W03-R1-v1.png','Instagram @synthetic-ig','Review SHA-256'])assert(first.params.message.includes(k));
 c.send({id:'wrong-id',result:{action:'accept',content:{approveExactDraft:true}}});
 call(c,4,{});assert.match(message(await c.get()),/pending/);
 c.send({id:first.id,result:{action:'decline'}});assert.match(message(await c.get()),/declined/);
 call(c,5,{});const second=await c.get();assert.notEqual(first.id,second.id);
 c.send({id:first.id,result:{action:'accept',content:{approveExactDraft:true}}});
 c.send({id:second.id,result:{action:'accept',content:{approveExactDraft:true}}});
 const success=await c.get();assert.equal(success.id,5);assert.match(message(success),/exact binding/);assert.match(message(success),/no draft actually saved/);
 call(c,6,{});const third=await c.get();assert.notEqual(third.id,second.id);
 c.send({id:third.id,result:{action:'cancel'}});assert.match(message(await c.get()),/cancelled/);
});
