#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
mkdir -p dist
out=dist/samantha-social-desk-chat-pilot-0.3.0.mcpb
test ! -e "$out"
python3 - "$out" <<'PY'
import pathlib,sys,zipfile
files={'manifest.json':'chat-pilot/manifest.json','MAC-CHAT-TEST.md':'chat-pilot/MAC-CHAT-TEST.md'}
for name in ['draft/core.mjs','chat-pilot/server/index.mjs','chat-pilot/server/mock.mjs','chat-pilot/server/fixtures/SJ-W03-R1.json','chat-pilot/server/fixtures/SJ-W03-R1-v1.mp4','chat-pilot/server/fixtures/SJ-W03-R1-v1.png']:
 files[name]=name
with zipfile.ZipFile(sys.argv[1],'x',compression=zipfile.ZIP_DEFLATED) as z:
 for name,p in files.items():
  m=zipfile.ZipInfo(name,date_time=(2026,11,24,0,0,0));m.compress_type=zipfile.ZIP_DEFLATED;z.writestr(m,pathlib.Path(p).read_bytes())
PY
unzip -t "$out"
