import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
test('preview over STDIO: synthetic image, text fallback and no arbitrary file/tool access',()=>{
  const m=JSON.parse(readFileSync('preview/manifest.json'));
  const name=m.tools[0].name;
  const req=[
    {id:1,method:'initialize',params:{protocolVersion:'2025-06-18'}},
    {method:'notifications/initialized'},
    {id:2,method:'tools/list'},
    {id:3,method:'tools/call',params:{name}},
    {id:4,method:'tools/call',params:{name,arguments:{textOnly:true}}},
    {id:5,method:'tools/call',params:{name,arguments:{file:'/etc/passwd'}}},
    {id:6,method:'tools/call',params:{name:'create_draft'}},
    {id:7,method:'tools/call',params:{name:'simulate_samantha_draft_report'}},
    {id:8,method:'tools/call',params:{name:'simulate_samantha_draft_report',arguments:{publishNow:true}}}
  ].map(x=>JSON.stringify({jsonrpc:'2.0',...x})).join('\n')+'\n';
  const r=spawnSync(process.execPath,['preview/'+m.server.entry_point],{input:req,encoding:'utf8',timeout:5000});
  assert.equal(r.status,0); assert.equal(r.stderr,'');
  const [a,b,c,d,e,f,g,h]=r.stdout.trim().split('\n').map(x=>JSON.parse(x));
  assert.equal(a.result.protocolVersion,'2025-06-18'); assert.equal(b.result.tools.length,2);
  assert.equal(b.result.tools[0].name,name);
  assert.match(c.result.content[0].text,/14:30 UTC/);
  assert.deepEqual(Buffer.from(c.result.content[1].data,'base64'),readFileSync('preview/server/dummy-cover.png'));
  assert.deepEqual(d.result.content,[c.result.content[0]]);
  assert.equal(e.error.code,-32602); assert.equal(f.error.code,-32602);
  assert.match(g.result.content[0].text,/SIMULATION ONLY • NO DRAFT CREATED/);
  assert.match(g.result.content[0].text,/Instagram:[\s\S]*Facebook:[\s\S]*Not scheduled/);
  assert.equal(h.error.code,-32602);
});
