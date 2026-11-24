'use strict';
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const supported = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const name = 'preview_samantha_reel';
const tool = {name, description: 'Display the synthetic Samantha preview. Read-only, no credentials or network. Set textOnly true for the text fallback.', inputSchema: {type:'object',properties:{textOnly:{type:'boolean'}},additionalProperties:false}, annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}};
const demo = {name:'simulate_samantha_draft_report',description:'Show a fully synthetic two-destination draft report. Does not make or save a real draft.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}};
const simulated = 'SIMULATION ONLY • NO DRAFT CREATED\nPackage: DEMO-SJ-R1 v1 (synthetic).\nInstagram: pretend draft — custom cover would use the Instagram reel thumbnail field.\nFacebook: pretend draft — custom cover would use the video thumbnail field.\nExample editorial time: Friday, December 4, 2026 at 10:30 a.m. Halifax / 14:30 UTC. Not scheduled.\nNo login, media upload, external draft, local draft record, schedule or publication occurred.';
const fallback = 'SYNTHETIC PREVIEW • NOT FOR POSTING\nCover: cream and burgundy; “Before you send the deposit” over an outlined doorway.\nSample caption: Check the amount, deadline and recipient in your agreement before sending a deposit.\nExample only: Friday, December 4, 2026 at 10:30 a.m. Halifax (AST / 14:30 UTC). Nothing was uploaded, drafted or scheduled.';
const send = res => process.stdout.write(JSON.stringify({jsonrpc:'2.0',...res})+'\n');
const cover = fs.readFileSync(path.join(__dirname,'dummy-cover.png')).toString('base64');
function dispatch(req) {
  if (!req || req.jsonrpc!=='2.0' || typeof req.method!=='string') return send({id:null,error:{code:-32600,message:'Invalid request'}});
  const {id,method,params} = req;
  if (id===undefined) return;
  if (method==='initialize') return send({id,result:{protocolVersion:supported.includes(params?.protocolVersion)?params.protocolVersion:supported[0],capabilities:{tools:{}},serverInfo:{name:'samantha-social-desk-preview',version:'0.2.0'}}});
  if (method==='ping') return send({id,result:{}});
  if (method==='tools/list') return send({id,result:{tools:[tool,demo]}});
  if (method==='tools/call') {
    const a = params?.arguments ?? {};
    if (params?.name===demo.name && a && typeof a==='object' && !Array.isArray(a) && Object.keys(a).length===0) return send({id,result:{content:[{type:'text',text:simulated}]}});
    if (params?.name!==name || !a || typeof a!=='object' || Array.isArray(a) || Object.keys(a).some(k=>k!=='textOnly') || (Object.hasOwn(a,'textOnly') && typeof a.textOnly!=='boolean')) return send({id,error:{code:-32602,message:'Invalid tool name or arguments'}});
    const content = [{type:'text', text:fallback}];
    if (!a.textOnly) content.push({type:'image',mimeType:'image/png',data:cover});
    return send({id,result:{content}});
  }
  return send({id,error:{code:-32601,message:'Method not found'}});
}
readline.createInterface({input:process.stdin, crlfDelay:Infinity}).on('line',line=>{
  if (line.length>16384) return send({id:null,error:{code:-32600,message:'Request too large'}});
  try { dispatch(JSON.parse(line)); } catch { send({id:null,error:{code:-32700,message:'Invalid JSON'}});
  }
});
