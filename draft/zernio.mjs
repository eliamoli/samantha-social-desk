const apiOrigin='https://zernio.com';
const apiPath=/^\/api\/v1\/(?:accounts|media\/presign|posts(?:\/[0-9a-f]{24})?)$/i;
const policy=(ok,msg)=>{if(!ok)throw Error(msg);};
const urlSafe=(x)=>{const u=new URL(x);policy(u.protocol==='https:'&&!u.port&&!u.username&&!u.password&&!u.hash,'Invalid upload URL origin');return u;};
export function makeZernio({key,send=fetch,storageHost}){
  policy(typeof key==='string'&&/^[A-Za-z0-9_.-]{12,256}$/.test(key),'Invalid or missing scoped credential');
  policy(typeof storageHost==='string'&&/^[a-f0-9]{32}\.r2\.cloudflarestorage\.com$/.test(storageHost),'Pin the confirmed Zernio R2 hostname before enabling uploads');
  async function request(p,{method='GET',body,requestId,query}={}){
    policy(apiPath.test(p),'Route forbidden');
    const headers={authorization:'Bearer '+key};
    if(body!==undefined)headers['content-type']='application/json';
    if(requestId)headers['idempotency-key']=requestId;
    const u=new URL(p,apiOrigin); if(query)u.search=new URLSearchParams(query);
    const r=await send(u,{method,headers,body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(15000)});
    policy(r.ok,'Zernio request was not confirmed (HTTP '+r.status+'); review safely, do not resubmit');
    return await r.json();
  }
  return {
    async accounts(profileId){
      const r=await request('/api/v1/accounts',{query:{profileId,status:'connected',excludeHidden:'true'}});
      return r.accounts;
    },
    async upload({name,mime,bytes}){
      policy((mime==='video/mp4'&&name.endsWith('.mp4'))||(mime==='image/png'&&name.endsWith('.png')),'Disallowed upload kind');
      const r=await request('/api/v1/media/presign',{method:'POST',body:{filename:name,contentType:mime,size:bytes.length}});
      const u=urlSafe(r.uploadUrl), p=urlSafe(r.publicUrl);
      policy(u.hostname===storageHost&&u.searchParams.has('X-Amz-Signature')&&p.hostname==='media.zernio.com'&&!p.search&&p.pathname.endsWith(name.slice(name.lastIndexOf('.'))),'Unexpected presign host or media path; no upload');
      const put=await send(u,{method:'PUT',headers:{'content-type':mime},body:bytes,redirect:'error',signal:AbortSignal.timeout(60000)});
      policy(put.ok,'Media PUT was not confirmed (HTTP '+put.status+')');
      return p.href;
    },
    async createDraft(body,requestId){
      const list=Object.keys(body).sort().join(',');
      policy(list==='content,isDraft,mediaItems,platforms'&&body.isDraft===true&&body.platforms?.length===1&&body.mediaItems?.length===1,'Only an exact single-target draft may be created');
      const target=body.platforms[0],media=body.mediaItems[0],ig=target.platform==='instagram';
      policy(target.platform==='instagram'||target.platform==='facebook','Unsupported platform');
      policy(Object.keys(target).sort().join(',')==='accountId,platform,platformSpecificData'&&/^[0-9a-f]{24}$/i.test(target.accountId),'Invalid target');
      policy(Object.keys(media).sort().join(',')===(ig?'type,url':'thumbnail,type,url')&&media.type==='video','Invalid draft media');
      const settings=target.platformSpecificData;
      policy(ig?Object.keys(settings).sort().join(',')==='instagramThumbnail,shareToFeed'&&settings.shareToFeed===true:Object.keys(settings).join(',')==='contentType'&&settings.contentType==='reel','Invalid draft settings');
      for(const x of [media.url,ig?settings.instagramThumbnail:media.thumbnail]){
        const u=urlSafe(x);policy(u.hostname==='media.zernio.com'&&!u.search,'Invalid returned media reference');
      }
      const r=await request('/api/v1/posts',{method:'POST',body,requestId});
      return r.post;
    },
    async getDraft(draftId){return (await request('/api/v1/posts/'+draftId)).post;}
  };
}
