#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
mkdir -p dist
python3 - <<'PY'
import pathlib, zipfile, hashlib, json
assert json.loads(pathlib.Path('chat-pilot/manifest.json').read_text())['version']=='0.5.0', 'Use the 0.5 branch to rebuild 0.5'
files={'manifest.json':'chat-pilot/manifest.json','INSTALL.md':'chat-pilot/INSTALL.md','TRANSFER.md':'TRANSFER.md'}
for p in ('draft/core.mjs','chat-pilot/server/index.mjs','chat-pilot/server/mock.mjs'):
 files[p]=p
for folder in ('chat-pilot/server/fixtures','transfer'):
 for p in pathlib.Path(folder).iterdir():
  if p.is_file() and (folder.endswith('fixtures') or p.suffix=='.mjs'):
   files[p.as_posix()]=p
artifact=pathlib.Path('dist/samantha-social-desk-0.5.0.mcpb')
with zipfile.ZipFile(artifact,'w',zipfile.ZIP_DEFLATED) as z:
 for name,p in sorted(files.items()):
  m=zipfile.ZipInfo(name,date_time=(2026,11,25,0,0,0));m.compress_type=zipfile.ZIP_DEFLATED;z.writestr(m,pathlib.Path(p).read_bytes())
with zipfile.ZipFile(artifact) as z:
 assert z.testzip() is None
digest=hashlib.sha256(artifact.read_bytes()).hexdigest()
artifact.with_suffix('.mcpb.sha256').write_text(digest+'  '+artifact.name+'\n')
print(artifact,digest)
PY
