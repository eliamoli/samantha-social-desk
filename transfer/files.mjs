import * as fs from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
export const sha = value => createHash('sha256').update(value).digest('hex');
export const check = (ok, code) => { if (!ok) throw new TransferError(code); };
export class TransferError extends Error { constructor(code) { super(code); this.code=code; } }
export const exact = (x, keys) => x && typeof x==='object' && !Array.isArray(x) && Object.keys(x).sort().join(',')===[...keys].sort().join(',');
export const digest = x => typeof x==='string' && /^[a-f0-9]{64}$/.test(x);
export async function realDirectory(root) {
  check(typeof root==='string' && path.isAbsolute(root) && path.normalize(root)===root,'FOLDER_NOT_REAL');
  let part=path.parse(root).root;
  for (const name of root.slice(part.length).split(path.sep).filter(Boolean)) {
    part=path.join(part,name);
    const s=await fs.lstat(part);
    check(s.isDirectory() && !s.isSymbolicLink(),'FOLDER_NOT_REAL');
  }
  check(await fs.realpath(root)===root,'FOLDER_NOT_REAL');
}
export async function readFile(root, name, max, privateFile=false) {
  check(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,150}$/.test(name),'INVALID_FILENAME');
  await realDirectory(root);
  const full=path.join(root,name), before=await fs.lstat(full);
  check(before.isFile() && !before.isSymbolicLink() && before.nlink===1,'FILE_NOT_REGULAR');
  check(before.size>0 && before.size<=max,'FILE_SIZE');
  if(privateFile && process.platform!=='win32') check(before.uid===process.getuid() && (before.mode&0o077)===0,'PRIVATE_PERMISSIONS');
  const h=await fs.open(full,constants.O_RDONLY|(constants.O_NOFOLLOW||0)|(constants.O_NONBLOCK||0));
  try {
    const s=await h.stat();
    check(s.isFile() && s.dev===before.dev && s.ino===before.ino && s.size===before.size,'FILE_CHANGED');
    const data=Buffer.alloc(s.size); let at=0;
    while(at<data.length) { const {bytesRead}=await h.read(data,at,data.length-at,at); check(bytesRead>0,'FILE_CHANGED'); at+=bytesRead; }
    const end=await h.stat(), after=await fs.lstat(full);
    for(const x of [end,after]) check(x.size===s.size && x.mtimeMs===s.mtimeMs && x.ctimeMs===s.ctimeMs && x.ino===s.ino && x.dev===s.dev && !x.isSymbolicLink(),'FILE_CHANGED');
    return data;
  } finally { await h.close(); }
}
export async function privateDirectory(root) {
  await fs.mkdir(root,{recursive:true,mode:0o700});
  await realDirectory(root);
  const s=await fs.lstat(root);
  if(process.platform!=='win32') check(s.uid===process.getuid() && (s.mode&0o077)===0,'PRIVATE_PERMISSIONS');
}
export async function syncDirectory(root) {
  if(process.platform==='win32') return; // Test host only; supported install target is macOS.
  const h=await fs.open(root,'r'); try { await h.sync(); } finally { await h.close(); }
}
export async function save(root,name,value) {
  const tmp=name+'.tmp';
  const h=await fs.open(path.join(root,tmp),'wx',0o600);
  try { await h.writeFile(JSON.stringify(value)+'\n'); await h.sync(); } finally { await h.close(); }
  await fs.rename(path.join(root,tmp),path.join(root,name));
  await syncDirectory(root);
}
export async function load(root,name) {
  try { return parseJson(await readFile(root,name,1024*1024,true)); }
  catch(e) { if(e.code==='ENOENT')return null; throw new TransferError('RECEIPT_DAMAGED'); }
}


export function parseJson(bytes) {
  const source=bytes.toString('utf8');
  let value;try{value=JSON.parse(source);}catch{throw new TransferError('INVALID_JSON');}
  const stack=[];
  const tokens=source.match(/"(?:\\.|[^"\\])*"|[{}\[\],:]|[^\s{}\[\],:]+/g)||[];
  for(const token of tokens) {
    const top=stack.at(-1);
    if(token==='{')stack.push({object:true,key:true,seen:new Set()});
    else if(token==='[')stack.push({object:false});
    else if(token==='}'||token===']')stack.pop();
    else if(token===','){if(top?.object)top.key=true;}
    else if(token.startsWith('"')&&top?.object&&top.key){
      const key=JSON.parse(token);check(!top.seen.has(key),'DUPLICATE_JSON_KEY');top.seen.add(key);top.key=false;
    }
  }
  return value;
}
