import * as fs from 'node:fs/promises';
import readline from 'node:readline';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {sha,inspect,execute,reconcile,requirePrivateDir} from '../../draft/core.mjs';
import {fixtureTargets,profileId,draftId,mockProvider} from './mock.mjs';
const mode=process.argv[2]||'off';
if(!['off','mock','mock-timeout'].includes(mode))throw Error('Only offline mock modes are supported');
const enabled=mode!=='off';
const folder=process.argv[3]||'';
if(folder&&!path.isAbsolute(folder))throw Error('Configured review folder must be an absolute path');
const probeEnabled=process.argv[4]==='on';
let formCapable=false, initialized=false, pending=null;
const opened=path.dirname(fileURLToPath(import.meta.url));
const approvedFolder=await fs.realpath(path.join(opened,'fixtures'));
const home=await fs.realpath(os.homedir());
const state=path.join(home,'.samantha-social-desk-offline-pilot-'+(mode==='mock-timeout'?'timeout':'normal'));
const c={profileId,approvedFolder,targets:fixtureTargets}, contentId='SJ-W03-R1', localTime='Friday, December 4, 2026 at 10:30 a.m. Halifax (AST / 14:30 UTC) — editorial example only, never schedules';
const platforms=['instagram','facebook'];
const spec=(n,d,p,required,readOnlyHint)=>({name:n,description:d,inputSchema:{type:'object',properties:p,required,additionalProperties:false},annotations:{readOnlyHint,destructiveHint:false,openWorldHint:false}});
const target={type:'string',enum:platforms}, hex={type:'string',pattern:'^[0-9a-f]{64}$'};
const preview=spec('review_samantha_mock_reel','Review a synthetic reel and both exact dummy destinations in this Chat. No state change.',{textOnly:{type:'boolean'}},[],true);
const create=spec('save_samantha_mock_draft','Create one synthetic draft, only after the human explicitly confirms the exact review binding and target. Never touches a provider.',{platform:target,reviewBinding:hex,confirmation:{type:'string'}},['platform','reviewBinding','confirmation'],false);
const read=spec('reconcile_samantha_mock_draft','Verify an already attempted synthetic draft using saved state; never creates another.',{platform:target,reviewBinding:hex},['platform','reviewBinding'],false);
const local=spec('review_samantha_local_reel','Read one user-selected reel from the configured approved folder; shares caption and optional cover in this Chat, never the video bytes. No draft action.',{contentId:{type:'string',pattern:'^SJ-W[0-9]{2}-R[1-4]$'},textOnly:{type:'boolean'}},['contentId'],true);
const probe=spec('probe_samantha_native_approval','Optional synthetic native approval test; does not save anything.',{},[],true);
const catalog=[preview,...(folder?[local]:[]),...(enabled?[create,read]:[]),...(probeEnabled?[probe]:[])];
const provider=mockProvider(state,mode==='mock-timeout');
function exact(args,allowed,required=[]){return args&&typeof args==='object'&&!Array.isArray(args)&&Object.keys(args).every(x=>allowed.includes(x))&&required.every(x=>Object.hasOwn(args,x));}
function fail(m){throw Error(m);}
const confirmation=(p,b)=>'APPROVE MOCK '+p.toUpperCase()+' '+b.slice(0,12);
async function review(p){
 const raw=await inspect(c,contentId,p);
 const v={...raw.view,editorialTime:localTime};
 return {...raw,view:v,reviewBinding:sha(JSON.stringify(v))};
}
const asText=text=>({type:'text',text});
const emit=result=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',...result})+'\n');
async function call(n,a){
 if(n===local.name&&folder){
  if(!exact(a,['contentId','textOnly'],['contentId'])||typeof a.contentId!=='string'||(a.textOnly!==undefined&&typeof a.textOnly!=='boolean'))fail('Invalid local review arguments');
  const {view:v,cover,stem}=await inspect({...c,approvedFolder:folder},a.contentId,'instagram');
  return [asText(['LOCAL REVIEW ONLY • NO DRAFT ACTION','Caption: '+v.caption,'Video: '+stem+'.mp4; SHA-256 '+v.videoSha256,'Cover: '+stem+'.png; SHA-256 '+v.coverSha256,'Halifax editorial timezone; no scheduled time or external destination. Real media cannot enter the mock draft path.'].join('\n')),...(a.textOnly?[]:[{type:'image',mimeType:'image/png',data:cover.toString('base64')}])];
 }
 if(n===preview.name){
  if(!exact(a,['textOnly'])||(a.textOnly!==undefined&&typeof a.textOnly!=='boolean'))fail('Invalid preview arguments');
  const proofs=await Promise.all(platforms.map(review));
  const {view:v,stem}=proofs[0];
  const text=['SYNTHETIC REEL • NOT FOR POSTING','Mode: '+(enabled?'offline mock draft enabled':'preview-only (default)'),localTime,
   'Video: '+stem+'.mp4\nSHA-256 '+v.videoSha256,'Cover: '+stem+'.png\nSHA-256 '+v.coverSha256,
   'Caption: '+v.caption,...proofs.map(({view,reviewBinding})=>view.platform+' @'+view.username+' ('+view.accountId+')\nReview binding '+reviewBinding+'\n'+(enabled?('Human confirmation to type for this target: '+confirmation(view.platform,reviewBinding)):'Draft creation unavailable until mock is enabled.'))];
  return [asText(text.join('\n\n')),...(a.textOnly?[]:[{type:'image',mimeType:'image/png',data:proofs[0].cover.toString('base64')}])];
 }
 if(!enabled)fail('Preview-only by default. No draft action available.');
 const isCreate=n===create.name;
 if(!isCreate&&n!==read.name)fail('No such tool');
 const required=['platform','reviewBinding',...(isCreate?['confirmation']:[])];
 if(!exact(a,required,required)||!platforms.includes(a.platform))fail('Invalid draft tool arguments');
 const r=await review(a.platform);
 if(a.reviewBinding!==r.reviewBinding)fail('Review binding changed or missing; no draft attempt');
 if(isCreate&&a.confirmation!==confirmation(a.platform,r.reviewBinding))fail('Exact human confirmation phrase is required; no draft attempt');
 await requirePrivateDir(state);
 const base={dir:state,c,contentId,platform:a.platform,provider};
 const result=isCreate?await execute({...base,approvedBinding:r.binding}):await reconcile({...base,draftId:draftId(a.platform)});
 return [asText(['MOCK VERIFIED DRAFT • NO EXTERNAL ACTION',result.platform+' @'+r.view.username,
  'Synthetic draft ID: '+result.draftId,'Revision: '+result.revision,'Review binding: '+r.reviewBinding,
  'Readback matched exact '+(a.platform==='instagram'?'instagramThumbnail':'media thumbnail')+' and video. No schedule or publication.'].join('\n'))];
}
async function dispatch(q){
 if(!q||q.jsonrpc!=='2.0')return emit({id:null,error:{code:-32600,message:'Invalid request'}});
 const {id,method,params}=q;
 if(typeof method!=='string'){
  if(pending&&pending.requestId===id){const p=pending;pending=null;clearTimeout(p.timer);
   const x=q.result; const ok=!q.error&&x?.action==='accept'&&x.content?.approveExactDraft===true&&Object.keys(x.content).length===1;
   emit({id:p.id,result:{content:[asText(ok?'MOCK APPROVAL RECEIVED • no draft actually saved':'NO DRAFT CREATED • declined, cancelled, or unsupported response')]}});
  }
  return;
 }
 if(id===undefined)return;
 try{
  let result;
  if(method==='initialize'){
   if(initialized)fail('Already initialized');
   initialized=true;const e=params?.capabilities?.elicitation;
   formCapable=!!(e&&typeof e==='object'&&!Array.isArray(e)&&(Object.hasOwn(e,'form')||Object.keys(e).length===0));
   result={protocolVersion:['2025-11-25','2025-06-18','2025-03-26','2024-11-05'].includes(params?.protocolVersion)?params.protocolVersion:'2025-11-25',capabilities:{tools:{},prompts:{}},serverInfo:{name:'samantha-social-desk-chat-pilot',version:'0.4.0'}};
  }
  else if(method==='ping')result={};
  else if(method==='tools/list')result={tools:catalog};
  else if(method==='prompts/list')result={prompts:[{name:'review_samantha_mock',description:'Open the synthetic workflow in ordinary Chat.'}]};
  else if(method==='prompts/get'&&params?.name==='review_samantha_mock')result={messages:[{role:'user',content:asText('Run review_samantha_mock_reel and show its original cover, caption, Halifax time and exact target bindings in this chat. Do not invoke a draft action unless I explicitly ask and confirm the exact target. This is synthetic only.')} ]};
  else if(method==='tools/call'&&params?.name===probe.name&&probeEnabled){
   if(!exact(params.arguments??{},[])||!formCapable||pending)fail(!formCapable?'Client did not declare form elicitation':'Invalid probe or another decision pending');
   const v=await review('instagram');
   if(pending)fail('Another decision pending');
   const requestId='synthetic-probe-'+randomUUID();
   const timer=setTimeout(()=>{if(pending?.requestId===requestId){pending=null;emit({id,result:{isError:true,content:[asText('NO DRAFT CREATED • approval timed out')]}});}},45000);
   pending={id,requestId,timer};
   emit({id:requestId,method:'elicitation/create',params:{message:'Synthetic only. Confirm this exact rehearsal; no draft is saved. '+JSON.stringify(v.view)+' Review SHA-256: '+v.reviewBinding,requestedSchema:{type:'object',properties:{approveExactDraft:{type:'boolean',title:'Approve this exact synthetic rehearsal',default:false}},required:['approveExactDraft']}}});
   return;
  }
  else if(method==='tools/call')result={content:await call(params?.name,params?.arguments??{})};
  else return emit({id,error:{code:-32601,message:'Unknown method'}});
  emit({id,result});
 }catch(e){emit({id,result:{isError:true,content:[asText(e.code?'Mock input/state error: '+e.code:e.message)]}});}
}
readline.createInterface({input:process.stdin,crlfDelay:Infinity}).on('line',line=>{
 if(line.length>16384)return emit({id:null,error:{code:-32600,message:'Request too large'}});
 let q;try{q=JSON.parse(line);}catch{return emit({id:null,error:{code:-32700,message:'Invalid JSON'}});}
 void dispatch(q);
});

process.stdin.on('end',()=>{if(pending){clearTimeout(pending.timer);pending=null;}});
