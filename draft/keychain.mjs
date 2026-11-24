import {execFileSync} from 'node:child_process';
// Unwired pilot helper. Credential enters only this process's memory; never a command argument or a log.
export function readScopedKeychain(){
  if(process.platform!=='darwin')throw Error('Samantha credential can only be read from the Mac Keychain');
  let key;
  try{key=execFileSync('/usr/bin/security',['find-generic-password','-s','Bridgerow Samantha Social Desk / Zernio','-a','samantha-publisher','-w'],{encoding:'utf8',stdio:['ignore','pipe','ignore'],timeout:15000}).trim();}
  catch{throw Error('Samantha-only Keychain item not accessible');}
  if(!key)throw Error('Samantha-only Keychain item empty');
  return key;
}
