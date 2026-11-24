import * as fs from 'node:fs/promises';
import path from 'node:path';
import {sha,requirePrivateDir} from '../../draft/core.mjs';
export const fixtureTargets={
 instagram:{accountId:'a'.repeat(24),username:'synthetic-ig'},
 facebook:{accountId:'b'.repeat(24),username:'synthetic-fb'},
};
export const profileId='c'.repeat(24);
export const draftId = p => sha('mock-only:fixture-v1:'+p).slice(0,24);
export function mockProvider(state,failAfterSave=false){
 const pth=id=>path.join(state,'mock-'+id+'.json');
 return {
  async accounts(profile){if(profile!==profileId)throw Error('Synthetic profile mismatch');return Object.entries(fixtureTargets).map(([platform,a])=>({_id:a.accountId,profileId,platform,username:a.username,enabled:true}));},
  async upload({mime,bytes}){
   if(!['video/mp4','image/png'].includes(mime)||!bytes.length)throw Error('Invalid synthetic upload');
   return 'https://demo.invalid/'+sha(bytes)+(mime==='video/mp4'?'.mp4':'.png');
  },
  async createDraft(body,requestId){
   const p=body.platforms?.[0]?.platform,dest=fixtureTargets[p];
   if(!dest||body.platforms.length!==1||body.platforms[0].accountId!==dest.accountId||body.isDraft!==true||
      Object.keys(body).sort().join(',')!=='content,isDraft,mediaItems,platforms')throw Error('Mock accepts only exact draft action');
   await requirePrivateDir(state);
   const id=draftId(p),h=await fs.open(pth(id),'wx',0o600);
   try{await h.writeFile(JSON.stringify({requestId,post:{...body,_id:id,status:'draft'}}));await h.sync();}finally{await h.close();}
   const d=await fs.open(state,'r');try{await d.sync();}finally{await d.close();}
   if(failAfterSave)throw Error('Simulated timeout after mock saved; reconcile, never recreate');
   return {_id:id};
  },
  async getDraft(id){
   if(!Object.keys(fixtureTargets).some(p=>draftId(p)===id))throw Error('Unknown mock ID');
   return JSON.parse(await fs.readFile(pth(id),'utf8')).post;
  }
 };
}
