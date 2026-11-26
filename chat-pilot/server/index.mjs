import * as fs from 'node:fs/promises';
import readline from 'node:readline';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {sha,inspect,execute,reconcile,requirePrivateDir} from '../../draft/core.mjs';
import {fixtureTargets,profileId,draftId,mockProvider} from './mock.mjs';
import {makeEngine,safeError} from '../../transfer/engine.mjs';
import {makeDraftEngine,draftError} from '../../draft-only/core.mjs';
let transferDecision=null,draftDecision=null;
const transferEnabled=process.env.SAMANTHA_TRANSFER_ENABLED==='true';
const transferEngine=makeEngine({enabled:transferEnabled,configFile:process.env.SAMANTHA_TRANSFER_CONFIG||'',folder:process.argv[3]||'',key:process.env.SAMANTHA_TRANSFER_KEY||'',state:path.join(os.homedir(),'Library','Application Support','Samantha Social Desk','transfer-v1')});
delete process.env.SAMANTHA_TRANSFER_KEY;
const draftEnabled=process.env.SAMANTHA_DRAFT_ENABLED==='true';
const draftEngine=makeDraftEngine({enabled:draftEnabled,configFile:process.env.SAMANTHA_DRAFT_CONFIG||'',key:process.env.SAMANTHA_DRAFT_KEY||'',state:path.join(os.homedir(),'Library','Application Support','Samantha Social Desk','draft-v1'),transfer:transferEngine});
delete process.env.SAMANTHA_DRAFT_KEY;
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
const preflight=spec('preflight_samantha_transfer','Check local transfer setup without network calls or credentials in Chat.',{},[],true);
const batchArgs={batchId:{type:'string',pattern:'^[A-Z0-9][A-Z0-9_-]{0,47}$'}};
const transferReview=spec('review_samantha_transfer_batch','Read and validate one exact approved manifest and paired MP4/PNG inventory. No upload.',batchArgs,['batchId'],true);
const transferRun=spec('transfer_samantha_approved_batch','Transfer only the exact reviewed approved batch after one native operator form. Reuse receipts and resume explicitly rejected parts. Never create posts or drafts.',{...batchArgs,reviewBinding:hex},['batchId','reviewBinding'],false);
transferRun.annotations.openWorldHint=true;
transferRun.annotations.idempotentHint=true;
const transferReconcile=spec('reconcile_samantha_transfer_batch','Verify an ambiguous storage PUT by comparing returned bytes with its private receipt. No re-upload.',batchArgs,['batchId'],true);
transferReconcile.annotations.openWorldHint=true;
const draftPreflight=spec('preflight_samantha_drafts','Check optional local draft-only setup. No network or draft creation.',{},[],true);
const reelId={type:'string',pattern:'^SJ-W[0-9]{2}-R[1-4]$'};
const draftArgs={...batchArgs,contentId:reelId};
const draftReview=spec('review_samantha_draft_pair','Review one approved caption and already uploaded video/cover pair with exact pinned IG/FB accounts. No external calls.',draftArgs,['batchId','contentId'],true);
const draftCreate=spec('save_samantha_paired_draft','After independent native approval, save one unscheduled Zernio draft with both pinned destinations and the paired PNG cover. Never upload, schedule, edit or publish.',{...draftArgs,reviewBinding:hex},['batchId','contentId','reviewBinding'],false);
draftCreate.annotations.openWorldHint=true;
const draftReconcile=spec('reconcile_samantha_paired_draft','Read back one saved or uncertain draft and its exact cover bytes. Never create or edit another draft.',{contentId:reelId,revision:{type:'integer',minimum:1,maximum:999}},['contentId','revision'],true);
draftReconcile.annotations.openWorldHint=true;
const catalog=[preview,preflight,draftPreflight,...(draftEnabled?[draftReview,draftCreate,draftReconcile]:[]),...(transferEnabled?[transferReview,transferRun,transferReconcile]:[]),...(folder?[local]:[]),...(enabled?[create,read]:[]),...(probeEnabled?[probe]:[])];
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
 if(n===draftPreflight.name){if(!exact(a,[]))fail('Invalid draft preflight');return [asText(JSON.stringify(await draftEngine.preflight(formCapable),null,2))];}
 if([draftReview.name,draftCreate.name,draftReconcile.name].includes(n)){
  try{
   const required=n===draftReconcile.name?['contentId','revision']:['batchId','contentId',...(n===draftCreate.name?['reviewBinding']:[])];
   if(!exact(a,required,required)||typeof a.contentId!=='string'||!/^SJ-W[0-9]{2}-R[1-4]$/.test(a.contentId)||
    (n===draftReconcile.name?(!Number.isSafeInteger(a.revision)||a.revision<1||a.revision>999):(typeof a.batchId!=='string'||!/^[A-Z0-9][A-Z0-9_-]{0,47}$/.test(a.batchId)))||
    (n===draftCreate.name&&!/^[a-f0-9]{64}$/.test(a.reviewBinding)))fail('Invalid draft arguments');
   if(n===draftCreate.name&&(!initialized||!formCapable))fail('Native form confirmation unavailable. No draft; a chat phrase cannot substitute.');
   const r=n===draftReview.name?await draftEngine.review(a.batchId,a.contentId):n===draftReconcile.name?await draftEngine.reconcile(a.contentId,a.revision):await draftEngine.create(a.batchId,a.contentId,a.reviewBinding,askDraft);
   return [asText(JSON.stringify(r,null,2))];
  }catch(e){throw Error(e.message?.startsWith('Native form')?e.message:draftError(e));}
 }

 if(n===preflight.name){if(!exact(a,[]))fail('Invalid preflight arguments');return [asText(JSON.stringify(await transferEngine.preflight(formCapable),null,2))];}
 if([transferReview.name,transferRun.name,transferReconcile.name].includes(n)){
  try{
   const required=n===transferRun.name?['batchId','reviewBinding']:['batchId'];
   if(!exact(a,required,required)||typeof a.batchId!=='string'||(n===transferRun.name&&!/^[a-f0-9]{64}$/.test(a.reviewBinding)))fail('Invalid transfer arguments');
   if(n===transferRun.name&&(!initialized||!formCapable))fail('Native form confirmation unavailable. No transfer; a chat phrase cannot substitute.');
   const r=n===transferReview.name?await transferEngine.review(a.batchId):n===transferReconcile.name?await transferEngine.reconcile(a.batchId):await transferEngine.transfer(a.batchId,a.reviewBinding,askTransfer);
   return [asText(JSON.stringify(r,null,2))];
  }catch(e){throw Error(e.message?.startsWith('Native form')?e.message:safeError(e));}
 }

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
async function askTransfer(view){
 if(!formCapable||pending||transferDecision||draftDecision)return false;
 return new Promise(resolve=>{
  const requestId='transfer-approval-'+randomUUID();
  const timer=setTimeout(()=>{if(transferDecision?.requestId===requestId){transferDecision=null;resolve(false);}},240000);
  transferDecision={requestId,timer,resolve};
  emit({id:requestId,method:'elicitation/create',params:{message:'Approve this exact transfer to '+view.destination+'? Review every filename, SHA-256 and size below. Only listed new/pending parts will upload. The sources remain unchanged. Temporary storage; no draft, post, schedule or cover assignment.\n'+JSON.stringify(view,null,2),requestedSchema:{type:'object',properties:{approveExactTransfer:{type:'boolean',title:'I approve this exact batch and destination',default:false}},required:['approveExactTransfer']}}});
 });
}
async function askDraft(view){
 if(!formCapable||pending||transferDecision||draftDecision)return false;
 return new Promise(resolve=>{
  const requestId='paired-draft-approval-'+randomUUID();
  const timer=setTimeout(()=>{if(draftDecision?.requestId===requestId){draftDecision=null;resolve(false);}},240000);
  draftDecision={requestId,timer,resolve};
  emit({id:requestId,method:'elicitation/create',params:{message:'Create exactly ONE unscheduled draft with this caption, paired cover and these TWO accounts? No publishing or scheduling.\n'+JSON.stringify(view,null,2),requestedSchema:{type:'object',properties:{approveExactPairedDraft:{type:'boolean',title:'Approve this exact paired draft and both accounts',default:false}},required:['approveExactPairedDraft']}}});
 });
}
async function dispatch(q){
 if(!q||q.jsonrpc!=='2.0')return emit({id:null,error:{code:-32600,message:'Invalid request'}});
 const {id,method,params}=q;
 if(typeof method!=='string'){
  if(draftDecision?.requestId===id){const p=draftDecision;draftDecision=null;clearTimeout(p.timer);const x=q.result;p.resolve(!q.error&&x?.action==='accept'&&x.content?.approveExactPairedDraft===true&&exact(x.content,['approveExactPairedDraft']));return;}
  if(transferDecision?.requestId===id){const p=transferDecision;transferDecision=null;clearTimeout(p.timer);const x=q.result;p.resolve(!q.error&&x?.action==='accept'&&x.content?.approveExactTransfer===true&&exact(x.content,['approveExactTransfer']));return;}
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
   result={protocolVersion:['2025-11-25','2025-06-18','2025-03-26','2024-11-05'].includes(params?.protocolVersion)?params.protocolVersion:'2025-11-25',capabilities:{tools:{},prompts:{}},serverInfo:{name:'samantha-social-desk-chat-pilot',version:'0.6.0'}};
  }
  else if(method==='ping')result={};
  else if(method==='tools/list')result={tools:catalog};
  else if(method==='prompts/list')result={prompts:[{name:'review_samantha_mock',description:'Open the synthetic workflow in ordinary Chat.'}]};
  else if(method==='prompts/get'&&params?.name==='review_samantha_mock')result={messages:[{role:'user',content:asText('Run review_samantha_mock_reel and show its original cover, caption, Halifax time and exact target bindings in this chat. Do not invoke a draft action unless I explicitly ask and confirm the exact target. This is synthetic only.')} ]};
  else if(method==='tools/call'&&params?.name===probe.name&&probeEnabled){
   if(!exact(params.arguments??{},[])||!formCapable||pending||transferDecision||draftDecision)fail(!formCapable?'Client did not declare form elicitation':'Invalid probe or another decision pending');
   const v=await review('instagram');
   if(pending||transferDecision||draftDecision)fail('Another decision pending');
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

process.stdin.on('end',()=>{if(draftDecision){clearTimeout(draftDecision.timer);draftDecision.resolve(false);draftDecision=null;}if(transferDecision){clearTimeout(transferDecision.timer);transferDecision.resolve(false);transferDecision=null;}if(pending){clearTimeout(pending.timer);pending=null;}});
