import {randomUUID,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createInterface} from 'node:readline';
const video=new URL('../chat-pilot/server/fixtures/SJ-W03-R1-v1.mp4',import.meta.url);
const cover=new URL('../chat-pilot/server/fixtures/SJ-W03-R1-v1.png',import.meta.url);
const caption=JSON.parse(readFileSync(new URL('../chat-pilot/server/fixtures/SJ-W03-R1.json', import.meta.url))).caption;
const sha=x=>createHash('sha256').update(x).digest('hex');
const exact={mode:'synthetic approval only',account:'Instagram @synthetic-ig',revision:1,caption,
  video:'SJ-W03-R1-v1.mp4 '+sha(readFileSync(video)),cover:'SJ-W03-R1-v1.png '+sha(readFileSync(cover))};
const binding=sha(JSON.stringify(exact));
const tool={name:'probe_draft_approval',description:'Request permission for one exact synthetic draft. No provider, files written, schedule, or publication.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,openWorldHint:false}};
let capable=false, initialized=false, pending=null;
const send=x=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',...x})+'\n');
const done=(id,status)=>send({id,result:{content:[{type:'text',text:status}]}});
const stop=(id,why)=>done(id,'NO DRAFT CREATED • '+why);
function handle(q){
 if(!q||q.jsonrpc!=='2.0')return;
 if(pending&&q.id===pending.approvalId&&!q.method){
  const p=pending; pending=null;clearTimeout(p.timer);
  const x=q.result;
  if(q.error||x?.action!=='accept'||x.content?.approveExactDraft!==true||Object.keys(x.content).length!==1)
    return stop(p.callId,'declined, cancelled, or unsupported approval response');
  return done(p.callId,'MOCK APPROVAL RECEIVED • exact binding '+binding+' • no draft actually saved');
 }
 if(q.id===undefined||typeof q.method!=='string')return;
 if(q.method==='initialize'&&!initialized){
  initialized=true;const e=q.params?.capabilities?.elicitation;
  capable=e&&typeof e==='object'&&!Array.isArray(e)&&(Object.hasOwn(e,'form')||Object.keys(e).length===0);
  return send({id:q.id,result:{protocolVersion:['2025-11-25','2025-06-18'].includes(q.params?.protocolVersion)?q.params.protocolVersion:'2025-11-25',capabilities:{tools:{}},serverInfo:{name:'samantha-approval-probe',version:'0.1.0'}}});
 }
 if(q.method==='tools/list')return send({id:q.id,result:{tools:[tool]}});
 if(q.method==='ping')return send({id:q.id,result:{}});
 if(q.method!=='tools/call'||q.params?.name!==tool.name)return send({id:q.id,error:{code:-32601,message:'Unknown method'}});
 const a=q.params.arguments??{};
 if(!a||typeof a!=='object'||Array.isArray(a)||Object.keys(a).length!==0)return stop(q.id,'tool arguments cannot supply approval');
 if(!capable)return stop(q.id,'client did not declare form elicitation');
 if(pending)return stop(q.id,'another human decision is pending');
 const approvalId='draft-approve-'+randomUUID();
 const timer=setTimeout(()=>{if(pending?.approvalId===approvalId){pending=null;stop(q.id,'approval timed out');}},45000);
 pending={callId:q.id,approvalId,timer};
 const message='Approve this exact synthetic draft only? No provider action occurs.\n\n'+Object.entries(exact).map(([k,v])=>k+': '+v).join('\n')+'\nReview SHA-256: '+binding;
 send({id:approvalId,method:'elicitation/create',params:{message,requestedSchema:{type:'object',properties:{approveExactDraft:{type:'boolean',title:'Approve this exact synthetic draft',default:false}},required:['approveExactDraft']}}});
}
createInterface({input:process.stdin,crlfDelay:Infinity}).on('line',line=>{try{if(line.length<16384)handle(JSON.parse(line));}catch{}}).on('close',()=>{if(pending)clearTimeout(pending.timer);});
