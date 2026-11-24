import {verify} from 'node:crypto';
import {inspect,execute,reconcile} from './core.mjs';
const life=300000;
function check(ok){if(!ok)throw Error('Missing, invalid or expired independent draft approval');}
export function approvalBytes({binding,deploymentId,issuedAt,expiresAt}){
 check(/^[a-f0-9]{64}$/.test(binding)&&/^[A-Za-z0-9_-]{24,100}$/.test(deploymentId)&&Number.isSafeInteger(issuedAt)&&Number.isSafeInteger(expiresAt)&&expiresAt>issuedAt&&expiresAt-issuedAt<=life);
 return Buffer.from(JSON.stringify(['samantha-draft-only-v1',deploymentId,binding,issuedAt,expiresAt]));
}
export function makeOfflineDraftGate({publicKey,deploymentId,provider,dir,c,clock=Date.now}){
 check(publicKey?.type==='public'&&publicKey.asymmetricKeyType==='ed25519');
 return {
  async review(contentId,platform){
   const {view,binding}=await inspect(c,contentId,platform),issuedAt=clock();
   const challenge={binding,deploymentId,issuedAt,expiresAt:issuedAt+life};
   approvalBytes(challenge);return {view,challenge};
  },
  async draft(contentId,platform,permit){
   const now=clock();
   check(permit&&Object.keys(permit).sort().join(',')==='binding,deploymentId,expiresAt,issuedAt,signature'&&permit.deploymentId===deploymentId&&Number.isSafeInteger(now)&&permit.issuedAt<=now&&now<permit.expiresAt&&typeof permit.signature==='string'&&/^[A-Za-z0-9_-]{86}$/.test(permit.signature));
   const bytes=Buffer.from(permit.signature,'base64url');
   check(bytes.length===64&&bytes.toString('base64url')===permit.signature&&verify(null,approvalBytes(permit),publicKey,bytes));
   return execute({dir,c,contentId,platform,approvedBinding:permit.binding,provider});
  },
  async recover(contentId,platform,draftId){return reconcile({dir,c,contentId,platform,draftId,provider});}
 };
}
