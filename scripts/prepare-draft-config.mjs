// One-time local setup. No provider calls or credential/config discovery.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline/promises';
import {Writable} from 'node:stream';
import {sha,check,privateDirectory} from '../transfer/files.mjs';
if(process.platform!=='darwin'||!process.stdin.isTTY)throw Error('Run interactively on the authorized operator Mac.');
let muted=false;
const output=new Writable({write(chunk,encoding,cb){if(!muted)process.stdout.write(chunk,encoding);cb();}});
const rl=readline.createInterface({input:process.stdin,output,terminal:true});
try{
 console.log('Local draft setup only. Supply independently verified exact workspace/profile/account pins. Never enter credentials in Chat.');
 const destinationId=await rl.question('Existing transfer destination label ID: ');
 const destinationLabel=await rl.question('Workspace display label: ');
 const expectedOwnerId=await rl.question('Verified credential owner ID: ');
 const profileId=await rl.question('Verified profile ID: ');
 const targets={};
 for(const platform of ['instagram','facebook'])targets[platform]={accountId:await rl.question(platform+' verified account ID: '),username:await rl.question(platform+' exact connected username: ')};
 check(/^[A-Z0-9][A-Z0-9_-]{0,47}$/.test(destinationId)&&/^[A-Za-z0-9 ._-]{1,80}$/.test(destinationLabel)&&[expectedOwnerId,profileId,...Object.values(targets).map(t=>t.accountId)].every(v=>/^[a-f0-9]{24}$/.test(v))&&Object.values(targets).every(t=>/^[A-Za-z0-9._-]{2,100}$/.test(t.username))&&targets.instagram.accountId!==targets.facebook.accountId,'DRAFT_SETUP_INVALID');
 process.stdout.write('Dedicated integration credential (hidden; only hashed locally): ');muted=true;
 const key=await rl.question('');muted=false;process.stdout.write('\n');
 check(/^(sk|zrk)_[A-Za-z0-9_-]{32,256}$/.test(key),'DRAFT_KEY_INVALID');
 const dir=path.join(os.homedir(),'Library','Application Support','Samantha Social Desk');await privateDirectory(dir);
 const config={version:1,destinationId,destinationLabel,expectedOwnerId,credentialSha256:sha(key),profileId,targets};
 await fs.writeFile(path.join(dir,'draft-config.json'),JSON.stringify(config,null,2)+'\n',{flag:'wx',mode:0o600});
 console.log('Created the private draft config. Select it in the extension and enter the same credential only in its sensitive draft credential field. No credential was saved by this helper and no provider was contacted.');
}finally{muted=false;rl.close();}
