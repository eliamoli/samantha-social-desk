import os from 'node:os';
import path from 'node:path';
import {configAt,inspect} from './core.mjs';
const dir=path.join(os.homedir(),'Library','Application Support','Samantha Social Desk');
try{
  const [action,id,platform]=process.argv.slice(2);
  if(action!=='review'||process.argv.length!==5)throw Error('Usage: node draft/desk.mjs review SJ-W03-R1 instagram|facebook. Live transport is not wired in this pilot.');
  const c=await configAt(dir);
  const {view,binding}=await inspect(c,id,platform);
  process.stdout.write(JSON.stringify({view,binding},null,2)+'\n');
}catch(e){console.error(e.code?('Local input error: '+e.code):e.message);process.exitCode=1;}
