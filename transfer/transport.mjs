import {check,TransferError,sha,parseJson} from './files.mjs';
const API='https://zernio.com/api/v1/';
export function deliveryUrl(value,key) {
  check(typeof key==='string' && /^temp\/[A-Za-z0-9_.-]+\.(mp4|png)$/.test(key),'PRESIGN_INVALID');
  let u;try{u=new URL(value);}catch{check(false,'PRESIGN_INVALID');}
  check(u.href===value && u.protocol==='https:' && u.hostname==='media.zernio.com' && !u.port && !u.username && !u.password && !u.hash && !u.search && u.pathname==='/'+key,'PRESIGN_INVALID');
  return u;
}
export function makeTransport(c,key,send=globalThis.fetch) {
  async function request(url,options) {
    try { return await send(url,{...options,redirect:'error',signal:AbortSignal.timeout(options.method==='PUT'?120000:30000)}); }
    catch { throw new TransferError(options.method==='PUT'?'PUT_UNCERTAIN':'NETWORK_UNCONFIRMED'); }
  }
  async function json(url,options) {
    const r=await request(url,{...options,headers:{authorization:'Bearer '+key,...options.headers}});
    check(r.status===200 && !r.redirected,'PROVIDER_REJECTED');
    const body=await limited(r,32768);
    try{return parseJson(body);}catch{throw new TransferError('PROVIDER_RESPONSE_INVALID');}
  }
  return {
    async verifyIdentity() {
      const r=await json(API+'auth/verify',{method:'GET'});
      check(r.valid===true && r.authType==='api_key' && r.userId===c.expectedOwnerId,'DESTINATION_MISMATCH');
    },
    async presign(part) {
      const r=await json(API+'media/presign',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({filename:part.name,contentType:part.mime,size:part.size})});
      const publicUrl=deliveryUrl(r.publicUrl,r.key);
      check(r.key.endsWith('_'+part.name) && r.expiresIn===3600,'PRESIGN_INVALID');
      let u;try{u=new URL(r.uploadUrl);}catch{check(false,'PRESIGN_INVALID');}
      check(u.href===r.uploadUrl && u.origin===c.storageOrigin && !u.username && !u.password && !u.hash && u.pathname===c.storagePathPrefix+r.key,'STORAGE_DESTINATION_MISMATCH');
      const params=u.searchParams, allowed=['X-Amz-Algorithm','X-Amz-Credential','X-Amz-Date','X-Amz-Expires','X-Amz-SignedHeaders','X-Amz-Signature','X-Amz-Content-Sha256','x-id'];
      check([...params.keys()].every(k=>allowed.includes(k)) && new Set(params.keys()).size===[...params.keys()].length && params.get('X-Amz-Algorithm')==='AWS4-HMAC-SHA256' && /^[a-f0-9]{64}$/.test(params.get('X-Amz-Signature')||'') && /^\d{8}T\d{6}Z$/.test(params.get('X-Amz-Date')||'') && /^.+\/\d{8}\/auto\/s3\/aws4_request$/.test(params.get('X-Amz-Credential')||'') && ['host','content-type;host'].includes(params.get('X-Amz-SignedHeaders')) && Number(params.get('X-Amz-Expires'))>0 && Number(params.get('X-Amz-Expires'))<=3600,'PRESIGN_INVALID');
      return {uploadUrl:u.href,publicUrl:publicUrl.href,key:r.key};
    },
    async put(signed,part) {
      const r=await request(signed.uploadUrl,{method:'PUT',headers:{'content-type':part.mime,'content-length':String(part.size)},body:part.bytes});
      if([400,401,403,413,415].includes(r.status)) throw new TransferError('PUT_REJECTED');
      check([200,201,204].includes(r.status) && !r.redirected,'PUT_UNCERTAIN');
      await r.body?.cancel();
    },
    async verifyStored(part) {
      const u=deliveryUrl(part.publicUrl,part.key);
      const r=await request(u.href,{method:'GET',headers:{}});
      check(r.status===200 && !r.redirected,'RECONCILE_UNCONFIRMED');
      check((r.headers.get('content-type')||'').split(';')[0]===part.mime,'RECONCILE_UNCONFIRMED');
      const bytes=await limited(r,part.size);
      check(bytes.length===part.size && sha(bytes)===part.sha256,'RECONCILE_UNCONFIRMED');
    }
  };
}
async function limited(response,max) {
  const reader=response.body?.getReader(); check(reader,'PROVIDER_RESPONSE_INVALID');
  const chunks=[];let n=0;
  try {while(true){const {value,done}=await reader.read();if(done)break;n+=value.length;check(n<=max,'PROVIDER_RESPONSE_TOO_LARGE');chunks.push(value);}}
  finally {await reader.cancel().catch(()=>{});}
  return Buffer.concat(chunks);
}
