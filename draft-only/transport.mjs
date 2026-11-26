import {check,parseJson,TransferError,sha} from '../transfer/files.mjs';
import {id,verifyTarget} from '../draft/core.mjs';
const API='https://zernio.com/api/v1/';
async function bytes(response,max) {
 const reader=response.body?.getReader();check(reader,'DRAFT_RESPONSE_INVALID');const chunks=[];let size=0;
 try{while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;check(size<=max,'DRAFT_RESPONSE_TOO_LARGE');chunks.push(r.value);}}
 finally{await reader.cancel().catch(()=>{});}
 return Buffer.concat(chunks);
}
function cdnUrl(value){
 let u;try{u=new URL(value);}catch{throw new TransferError('DRAFT_MEDIA_UNCONFIRMED');}
 check(u.href===value&&u.origin==='https://media.zernio.com'&&!u.username&&!u.password&&!u.search&&!u.hash&&/^\/[A-Za-z0-9_./-]+$/.test(u.pathname)&&!u.pathname.includes('..'),'DRAFT_MEDIA_UNCONFIRMED');
 return u;
}
export function makeDraftTransport(c,key,send=globalThis.fetch) {
 async function request(url,options){
  try{return await send(url,{...options,redirect:'error',signal:AbortSignal.timeout(60000)});}
  catch{throw new TransferError('DRAFT_NETWORK_UNCONFIRMED');}
 }
 async function api(route,method='GET',body,requestId) {
  const allowed=method==='GET'&&(route==='auth/verify'||route.startsWith('accounts?')||route.startsWith('posts?')||/^posts\/[a-f0-9]{24}$/.test(route))||method==='POST'&&route==='posts'&&body?.isDraft===true;
  check(allowed && ['GET','POST'].includes(method),'DRAFT_ROUTE_FORBIDDEN');
  const headers={authorization:'Bearer '+key};
  if(body){headers['content-type']='application/json';headers['idempotency-key']=requestId;}
  const r=await request(API+route,{method,headers,...(body?{body:JSON.stringify(body)}:{})});
  check((method==='POST'?[200,201]:[200]).includes(r.status)&&!r.redirected,'DRAFT_HTTP_UNCONFIRMED');
  return parseJson(await bytes(r,1024*1024));
 }
 return {
  async verifyTargets(){
   const identity=await api('auth/verify');
   check(identity.valid===true&&identity.authType==='api_key'&&identity.userId===c.expectedOwnerId,'DRAFT_DESTINATION_MISMATCH');
   const r=await api('accounts?'+new URLSearchParams({profileId:c.profileId,status:'connected',excludeHidden:'true'}));
   check(Array.isArray(r.accounts)&&!r.pagination?.nextCursor&&!r.warning,'DRAFT_ACCOUNT_READBACK_INCOMPLETE');
   for(const platform of ['instagram','facebook']){
    const target=c.targets[platform];verifyTarget(r.accounts,{platform,profileId:c.profileId,...target});
   }
  },
  async create(body,requestId){
   check(Object.keys(body).sort().join(',')==='content,externalId,isDraft,mediaItems,platforms'&&body.isDraft===true&&body.mediaItems.length===1&&body.platforms.length===2,'DRAFT_PAYLOAD_INVALID');
   check(body.externalId==='samantha-draft-'+requestId&&/^[a-f0-9-]{36}$/.test(requestId),'DRAFT_PAYLOAD_INVALID');
   const m=body.mediaItems[0];
   cdnUrl(m.url);cdnUrl(m.thumbnail);check(typeof body.content==='string'&&body.content.length>0&&body.content.length<=2200,'DRAFT_PAYLOAD_INVALID');
   check(Object.keys(m).sort().join(',')==='thumbnail,type,url'&&m.type==='video','DRAFT_PAYLOAD_INVALID');
   for(const platform of ['instagram','facebook']){
    const ts=body.platforms.filter(p=>p.platform===platform);check(ts.length===1,'DRAFT_PAYLOAD_INVALID');const p=ts[0];
    check(Object.keys(p).sort().join(',')==='accountId,platform,platformSpecificData'&&p.accountId===c.targets[platform].accountId,'DRAFT_PAYLOAD_INVALID');
    const s=p.platformSpecificData;
    check(platform==='instagram'?Object.keys(s).sort().join(',')==='instagramThumbnail,shareToFeed'&&s.instagramThumbnail===m.thumbnail&&s.shareToFeed===true:Object.keys(s).join(',')==='contentType'&&s.contentType==='reel','DRAFT_PAYLOAD_INVALID');
   }
   const r=await api('posts','POST',body,requestId);check(id(r.post?._id),'DRAFT_CREATE_UNCONFIRMED');return r.post._id;
  },
  async get(postId){check(id(postId),'DRAFT_ID_INVALID');return (await api('posts/'+postId)).post;},
  async find(externalId){
   check(/^samantha-draft-[a-f0-9-]{36}$/.test(externalId),'DRAFT_ID_INVALID');
   const r=await api('posts?'+new URLSearchParams({externalId,profileId:c.profileId,view:'full'}));
   check(Array.isArray(r.posts)&&r.posts.length===1&&!r.pagination?.nextCursor&&(r.pagination?.total??1)===1&&r.posts[0].externalId===externalId&&id(r.posts[0]._id),'DRAFT_LOOKUP_UNCONFIRMED');
   return r.posts[0]._id;
  },
  async verifyMedia(value,expected){
   check(['video/mp4','image/png'].includes(expected.mime)&&Number.isSafeInteger(expected.size)&&expected.size>0&&expected.size<=(expected.mime==='video/mp4'?120:10)*1024*1024&&/^[a-f0-9]{64}$/.test(expected.sha256),'DRAFT_MEDIA_UNCONFIRMED');
   cdnUrl(value);
   const r=await request(value,{method:'GET',headers:{}});
   check(r.status===200&&!r.redirected&&(r.headers.get('content-type')||'').split(';')[0]===expected.mime,'DRAFT_MEDIA_UNCONFIRMED');
   const data=await bytes(r,expected.size);check(data.length===expected.size&&sha(data)===expected.sha256,'DRAFT_MEDIA_UNCONFIRMED');
  }
 };
}
