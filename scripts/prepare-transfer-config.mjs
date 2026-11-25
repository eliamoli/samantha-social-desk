// One-time LOCAL helper: no HTTP, no Keychain/config discovery, no secret in argv or output.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline/promises';
import {Writable} from 'node:stream';
import {sha,privateDirectory,check} from '../transfer/files.mjs';
if(process.platform!=='darwin' || !process.stdin.isTTY) throw Error('Run interactively on the operator Mac during one-time setup.');
let muted=false;
const output=new Writable({write(chunk,encoding,cb){if(!muted)process.stdout.write(chunk,encoding);cb();}});
const rl=readline.createInterface({input:process.stdin,output,terminal:true});
try {
 console.log('Local setup only. Obtain the dedicated restricted credential, owner ID and exact storage pin through authorized Zernio setup first. Never paste them into Chat.');
 const destinationId=await rl.question('Local destination label ID (uppercase letters/numbers/underscore): ');
 const destinationLabel=await rl.question('Workspace label to display in the confirmation: ');
 const expectedOwnerId=await rl.question('Verified credential owner ID: ');
 const storageOrigin=await rl.question('Verified exact HTTPS R2 storage origin: ');
 const storagePathPrefix=await rl.question('Verified exact bucket prefix, /bucket/: ');
 process.stdout.write('Dedicated credential (hidden; used only to calculate its pin): ');muted=true;
 const key=await rl.question('');muted=false;process.stdout.write('\n');
 check(/^(sk|zrk)_[A-Za-z0-9_-]{32,256}$/.test(key),'INVALID_KEY');
 const dir=path.join(os.homedir(),'Library','Application Support','Samantha Social Desk');
 await privateDirectory(dir);
 const config={version:1,destinationId,destinationLabel,expectedOwnerId,credentialSha256:sha(key),storageOrigin,storagePathPrefix};
 const dest=path.join(dir,'transfer-config.json');
 await fs.writeFile(dest,JSON.stringify(config,null,2)+'\n',{flag:'wx',mode:0o600});
 console.log('Created the private transfer config. Select it in the extension settings and enter the same credential in its sensitive credential field. This helper did not save the credential or contact a provider.');
} finally {muted=false;rl.close();}
