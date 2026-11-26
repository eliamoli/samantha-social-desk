import * as fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fixture,fakeHTTP} from './transfer-fixture.mjs';
import {makeEngine} from '../transfer/engine.mjs';
import {makeDraftEngine} from '../draft-only/core.mjs';
export async function draftFixture(t,options={}){
 const f=await fixture(t);
 f.draftConfigFile=path.join(f.root,'draft-config.json');f.draftState=path.join(f.root,'draft-state');
 f.draftConfig={version:1,destinationId:f.config.destinationId,destinationLabel:f.config.destinationLabel,expectedOwnerId:f.config.expectedOwnerId,credentialSha256:f.config.credentialSha256,profileId:'c'.repeat(24),targets:{instagram:{accountId:'a'.repeat(24),username:'synthetic-ig'},facebook:{accountId:'b'.repeat(24),username:'synthetic-fb'}}};
 await fs.writeFile(f.draftConfigFile,JSON.stringify(f.draftConfig),{mode:0o600});
 f.caption={contentId:'SJ-W99-R1',revision:1,status:'Approved',caption:'Synthetic caption approved only for this test.'};
 f.captionPath=path.join(f.folder,f.caption.contentId+'.draft.json');
 f.writeCaption=()=>fs.writeFile(f.captionPath,JSON.stringify(f.caption));await f.writeCaption();
 f.http=draftHTTP(f,options);
 f.transfer=makeEngine({...f,enabled:true,send:f.http.send});
 f.drafts=makeDraftEngine({enabled:true,configFile:f.draftConfigFile,key:f.key,state:f.draftState,transfer:f.transfer,send:f.http.send});
 f.upload=async()=>{const v=await f.transfer.review(f.batch.batchId);return f.transfer.transfer(f.batch.batchId,v.reviewBinding,async()=>true);};
 return f;
}
export function draftHTTP(f,options={},seed={}){
 const h=fakeHTTP(f,options),posts=new Map(seed.posts||[]);
 for(const [key,r] of seed.stored||[])h.stored.set(key,{...r,bytes:Buffer.from(r.bytes,'base64')});
 const send=async(raw,o)=>{
  const u=new URL(raw);
  if(u.origin==='https://zernio.com'&&u.pathname.startsWith('/api/v1/posts')){
   h.calls.push({method:o.method,path:u.pathname,auth:o.headers.authorization,body:o.body});
   assert.equal(o.redirect,'error');assert.equal(o.headers.authorization,'Bearer '+f.key);
   if(o.method==='POST'){
    assert.equal(u.pathname,'/api/v1/posts');const body=JSON.parse(o.body);
    assert.equal(body.isDraft,true);assert.deepEqual(Object.keys(body).sort(),['content','externalId','isDraft','mediaItems','platforms']);
    assert.equal(body.mediaItems.length,1);assert.equal(body.mediaItems[0].type,'video');assert.equal(body.platforms.length,2);
    assert.equal(body.externalId,'samantha-draft-'+o.headers['idempotency-key']);
    const post={...body,_id:posts.size.toString(16).padStart(24,'d'),status:'draft'};
    if(options.rewrittenUrls){
     const replace=old=>{const k=new URL(old).pathname.slice(1),newKey=k.replace('temp/','permanent/');h.stored.set(newKey,h.stored.get(k));return 'https://media.zernio.com/'+newKey;};
     post.mediaItems[0].url=replace(post.mediaItems[0].url);post.mediaItems[0].thumbnail=replace(post.mediaItems[0].thumbnail);post.platforms[0].platformSpecificData.instagramThumbnail=post.mediaItems[0].thumbnail;
    }
    posts.set(post._id,post);
    if(options.timeoutAfterCreate)throw Error('simulated lost response with sensitive URL');
    return Response.json({post:options.invalidCreateId?{}:post},{status:201});
   }
   assert.equal(o.method,'GET');
   if(u.pathname==='/api/v1/posts'){
    let found=[...posts.values()].filter(p=>p.externalId===u.searchParams.get('externalId'));
    if(options.noMatch)found=[];if(options.queryMany)found.push(...found);
    return Response.json({posts:found,pagination:{total:found.length,nextCursor:null}});
   }
   const p=posts.get(u.pathname.split('/').at(-1));if(!p)return Response.json({}, {status:404});
   const post=structuredClone(p);
   if(options.missingCover==='facebook')delete post.mediaItems[0].thumbnail;
   if(options.missingCover==='instagram')delete post.platforms[0].platformSpecificData.instagramThumbnail;
   if(options.scheduled)post.scheduledFor='2030-01-01T00:00:00Z';
   if(options.wrongPostAccount)post.platforms[0].accountId='e'.repeat(24);
   return Response.json({post});
  }
  if(u.origin==='https://zernio.com'&&u.pathname==='/api/v1/accounts'){
   h.calls.push({method:o.method,path:u.pathname,auth:o.headers.authorization});
   assert.equal(o.method,'GET');assert.equal(u.searchParams.get('status'),'connected');assert.equal(u.searchParams.get('profileId'),f.draftConfig.profileId);
   return Response.json({accounts:Object.entries(f.draftConfig.targets).map(([platform,t])=>({_id:t.accountId,username:t.username,platform,profileId:options.wrongTargets?'e'.repeat(24):f.draftConfig.profileId,enabled:true}))});
  }
  if(options.corruptCover&&u.origin==='https://media.zernio.com'&&u.pathname.endsWith('.png'))return new Response(Buffer.from('wrong'),{status:200,headers:{'content-type':'image/png'}});
  return h.send(raw,o);
 };
 return {...h,send,posts,options,dump:()=>({posts:[...posts],stored:[...h.stored].map(([k,v])=>[k,{...v,bytes:v.bytes.toString('base64')}])})};
}
